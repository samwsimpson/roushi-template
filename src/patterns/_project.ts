// Project helper — the API patterns use to inspect and modify a target project.
// Encapsulates file ops, env-var reads/writes, package management, and git
// commit safety. Patterns shouldn't reach for fs / spawn / dotenv directly —
// they should go through this helper so the safety rules (e.g. don't auto-commit
// if the repo has unrelated WIP) stay consistent across all patterns.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sync as crossSpawnSync } from "cross-spawn";

/**
 * Safe spawn for CLI tools that may be .cmd shims on Windows (pnpm, vercel).
 * cross-spawn handles the .cmd lookup + escaping internally — no shell:true,
 * no shell-injection risk even if values contain metacharacters.
 */
function spawnSafe(
  command: string,
  args: string[],
  options: { cwd?: string; stdio?: "inherit" | "ignore" | "pipe" } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = crossSpawnSync(command, args, {
    cwd: options.cwd,
    stdio: options.stdio ?? "pipe",
    encoding: "utf-8",
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

export interface ProjectInit {
  /** Absolute path to the project root */
  cwd: string;
  /** Optional product slug from the Roushi brain — for context only */
  productSlug?: string | null;
  /** Optional domain for the product (used by some patterns) */
  domain?: string | null;
}

export class Project {
  readonly cwd: string;
  readonly productSlug: string | null;
  readonly domain: string | null;

  constructor(init: ProjectInit) {
    this.cwd = init.cwd;
    this.productSlug = init.productSlug ?? null;
    this.domain = init.domain ?? null;
  }

  // ─── File operations ──────────────────────────────────────

  async readFile(relPath: string): Promise<string | null> {
    try {
      return await fs.readFile(path.join(this.cwd, relPath), "utf-8");
    } catch {
      return null;
    }
  }

  async writeFile(relPath: string, content: string): Promise<void> {
    const full = path.join(this.cwd, relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf-8");
  }

  async fileExists(relPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.cwd, relPath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Locate the root layout.tsx for Next.js App Router projects. Walks
   * common project shapes in order of specificity:
   *
   *   app/layout.tsx                   - flat (Roushi, Akiko)
   *   src/app/layout.tsx               - src/-rooted
   *   frontend/app/layout.tsx          - separate frontend/backend dirs (Aether)
   *   apps/web/app/layout.tsx          - Turborepo with apps/web (Kodori)
   *   apps/*+/app/layout.tsx           - any other Turborepo apps/* dir
   *
   * Returns null if no layout found.
   */
  async findRootLayout(): Promise<string | null> {
    const candidates = [
      "app/layout.tsx",
      "src/app/layout.tsx",
      "frontend/app/layout.tsx",
      "apps/web/app/layout.tsx",
    ];
    for (const c of candidates) {
      if (await this.fileExists(c)) return c;
    }

    // Fall back to scanning apps/*/app/layout.tsx in case the monorepo uses
    // a non-"web" directory name
    try {
      const appsEntries = await fs.readdir(path.join(this.cwd, "apps"), {
        withFileTypes: true,
      });
      for (const entry of appsEntries) {
        if (!entry.isDirectory()) continue;
        const candidate = `apps/${entry.name}/app/layout.tsx`;
        if (await this.fileExists(candidate)) return candidate;
      }
    } catch {
      // No apps/ dir — fine
    }

    return null;
  }

  /** Returns true if any tracked file contains the pattern */
  grep(pattern: string, options: { glob?: string } = {}): boolean {
    try {
      const args = ["grep", "-l", pattern, "--", options.glob ?? "."];
      const result = execFileSync("git", args, {
        encoding: "utf-8",
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "ignore"],
      });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  // ─── Package.json ─────────────────────────────────────────

  async readPackageJson(): Promise<Record<string, unknown> | null> {
    // Check the app root first (handles monorepo shapes), then fall back
    // to the cwd. For most projects these are the same dir.
    const appRoot = await this.findAppRoot();
    const candidates = appRoot === this.cwd
      ? ["package.json"]
      : [path.relative(this.cwd, appRoot).replace(/\\/g, "/") + "/package.json", "package.json"];
    for (const c of candidates) {
      const content = await this.readFile(c);
      if (!content) continue;
      try {
        return JSON.parse(content) as Record<string, unknown>;
      } catch {
        // try next candidate
      }
    }
    return null;
  }

  async hasDependency(name: string): Promise<boolean> {
    const pkg = await this.readPackageJson();
    if (!pkg) return false;
    const deps = pkg.dependencies as Record<string, string> | undefined;
    const devDeps = pkg.devDependencies as Record<string, string> | undefined;
    return Boolean(deps?.[name] ?? devDeps?.[name]);
  }

  /**
   * Returns the directory containing the project's primary package.json
   * (the one tied to the Next.js app). For monorepo shapes (apps/web,
   * frontend/, packages/), this is the dir where the app lives, not the
   * repo root. Falls back to cwd if no nested package.json is more specific.
   */
  async findAppRoot(): Promise<string> {
    // Reuse layout detection — wherever the layout is, that's the app dir.
    // If frontend/app/layout.tsx → app root is frontend/.
    // If apps/web/app/layout.tsx → app root is apps/web/.
    const layout = await this.findRootLayout();
    if (!layout) return this.cwd;
    // Strip "app/layout.tsx" or "src/app/layout.tsx" off the end
    let dir = path.dirname(layout);
    if (dir.endsWith("app")) dir = path.dirname(dir);
    if (dir.endsWith("src")) dir = path.dirname(dir);
    const candidate = path.join(this.cwd, dir);
    // Use this dir only if it has its own package.json; otherwise fall back to cwd
    try {
      await fs.access(path.join(candidate, "package.json"));
      return candidate;
    } catch {
      return this.cwd;
    }
  }

  installPackage(name: string, options: { dev?: boolean } = {}): void {
    if (!isValidPackageName(name)) {
      throw new Error(`Invalid package name: ${name}`);
    }
    const args = ["add", ...(options.dev ? ["-D"] : []), name];
    // installCwd needs to be the dir with the right package.json — for
    // monorepo shapes the app's package.json may not be at the repo root.
    const result = spawnSafe("pnpm", args, {
      cwd: this.appRootSync(),
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`pnpm add ${name} failed with exit code ${result.status}`);
    }
  }

  /** Sync sibling of findAppRoot for the (sync) installPackage path */
  private appRootSync(): string {
    // Try common layout candidate paths synchronously
    const candidates = [
      "app/layout.tsx",
      "src/app/layout.tsx",
      "frontend/app/layout.tsx",
      "apps/web/app/layout.tsx",
    ];
    for (const c of candidates) {
      try {
        if (require("node:fs").existsSync(path.join(this.cwd, c))) {
          let dir = path.dirname(c);
          if (dir.endsWith("app")) dir = path.dirname(dir);
          if (dir.endsWith("src")) dir = path.dirname(dir);
          const candidateDir = path.join(this.cwd, dir);
          if (
            require("node:fs").existsSync(path.join(candidateDir, "package.json"))
          ) {
            return candidateDir;
          }
        }
      } catch {
        // continue
      }
    }
    return this.cwd;
  }

  // ─── Env vars ─────────────────────────────────────────────

  async envHas(key: string): Promise<boolean> {
    if (!isValidEnvKey(key)) return false;
    const envLocal = await this.readFile(".env.local");
    if (envLocal && new RegExp(`^${key}\\s*=`, "m").test(envLocal)) return true;
    const envExample = await this.readFile(".env.example");
    if (envExample && new RegExp(`^${key}\\s*=`, "m").test(envExample)) return true;
    return false;
  }

  async appendToEnvExample(key: string, defaultValue = ""): Promise<void> {
    if (!isValidEnvKey(key)) {
      throw new Error(`Invalid env key: ${key}`);
    }
    const existing = (await this.readFile(".env.example")) ?? "";
    if (new RegExp(`^${key}\\s*=`, "m").test(existing)) return;
    const sep = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
    await this.writeFile(".env.example", `${existing}${sep}${key}="${defaultValue}"\n`);
  }

  /**
   * Set an env var on Vercel via the CLI. Skipped silently if `vercel` isn't
   * installed or the project isn't linked — patterns can call this freely.
   */
  setVercelEnv(
    key: string,
    value: string,
    environments: Array<"production" | "preview" | "development"> = ["production", "development"],
  ): { ok: boolean; error?: string } {
    if (!isValidEnvKey(key)) {
      return { ok: false, error: `Invalid env key: ${key}` };
    }
    const check = spawnSafe("vercel", ["--version"], { stdio: "pipe" });
    if (check.status !== 0) {
      return { ok: false, error: "Vercel CLI not installed" };
    }

    for (const env of environments) {
      // cross-spawn handles arg escaping per-platform without shell:true,
      // so value can contain any characters (quotes, &, |, etc.) safely.
      const result = spawnSafe(
        "vercel",
        ["env", "add", key, env, "--value", value, "--yes"],
        { cwd: this.cwd, stdio: "pipe" },
      );
      if (result.status !== 0) {
        return {
          ok: false,
          error: `Failed to set ${key} on ${env}: ${result.stderr || result.stdout}`,
        };
      }
    }
    return { ok: true };
  }

  // ─── Git ──────────────────────────────────────────────────

  /** Returns true if the working tree is clean (no modifications, no untracked) */
  isGitClean(): boolean {
    try {
      const result = execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf-8",
        cwd: this.cwd,
      });
      return result.trim().length === 0;
    } catch {
      return false;
    }
  }

  /** List the files modified relative to HEAD (no untracked) */
  modifiedFiles(): string[] {
    try {
      const result = execFileSync("git", ["diff", "--name-only"], {
        encoding: "utf-8",
        cwd: this.cwd,
      });
      return result.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Stage + commit IF the repo was clean before this pattern ran.
   * If unrelated WIP existed before, only stage `filesToStage` and warn.
   * Returns whether a commit was actually created.
   */
  commitIfClean(
    args: { wasCleanBefore: boolean; filesToStage: string[]; message: string },
  ): { committed: boolean; warning?: string } {
    if (args.filesToStage.length === 0) {
      return { committed: false };
    }

    // Reject any path that tries to escape the repo via .. or absolute paths
    for (const f of args.filesToStage) {
      if (f.includes("..") || path.isAbsolute(f)) {
        throw new Error(`Refusing to stage unsafe path: ${f}`);
      }
    }

    execFileSync("git", ["add", "--", ...args.filesToStage], {
      cwd: this.cwd,
      stdio: "ignore",
    });

    if (!args.wasCleanBefore) {
      return {
        committed: false,
        warning:
          "Repo had uncommitted changes before this pattern ran. Pattern's changes staged but NOT committed — review and commit yourself.",
      };
    }

    execFileSync("git", ["commit", "-m", args.message], {
      cwd: this.cwd,
      stdio: "ignore",
    });
    return { committed: true };
  }
}

// ─── Validators ────────────────────────────────────────────

function isValidEnvKey(key: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(key);
}

function isValidPackageName(name: string): boolean {
  // npm package name spec: lowercase, may have scope (@scope/name)
  // Slashes / dots / hyphens / digits OK. Must start with letter or @.
  return /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name);
}

