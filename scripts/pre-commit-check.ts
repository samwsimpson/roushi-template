// scripts/pre-commit-check.ts
//
// Mechanical enforcement of the shipment-sweep discipline. Runs as a git
// pre-commit hook (installed via `pnpm hooks:install`) and blocks the commit
// if any of the following are out of sync:
//
//   1. package.json version was bumped, but CHANGELOG.md has no entry for it
//   2. package.json version doesn't match src/cli/index.ts .version() call
//   3. package.json version doesn't match src/mcp/server.ts McpServer version
//
// The hook is intentionally minimal — it catches the most common shipment-sweep
// drift (forgot to bump CHANGELOG when bumping the version) without trying to
// be a full doc-sweep linter. For surface-by-surface enforcement, see the
// shipment-sweep rule + the planned cron drift detector (v1.5).
//
// Bypass: `git commit --no-verify` skips this hook. Use sparingly.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  try {
    fs.accessSync(path.join(ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

interface Failure {
  rule: string;
  message: string;
  fix?: string;
}

function fail(failures: Failure[]): never {
  console.error("");
  console.error("✗ pre-commit shipment-sweep check failed:");
  console.error("");
  for (const f of failures) {
    console.error(`  [${f.rule}] ${f.message}`);
    if (f.fix) console.error(`    fix: ${f.fix}`);
  }
  console.error("");
  console.error(
    "Bypass (use sparingly): git commit --no-verify",
  );
  process.exit(1);
}

function getStagedFiles(): string[] {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=AM"],
      { encoding: "utf-8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function packageJsonVersion(): string {
  const pkg = JSON.parse(read("package.json")) as { version?: string };
  if (!pkg.version) {
    throw new Error("package.json has no version field");
  }
  return pkg.version;
}

function cliVersion(): string | null {
  if (!fileExists("src/cli/index.ts")) return null;
  const m = read("src/cli/index.ts").match(/\.version\("([^"]+)"\)/);
  return m?.[1] ?? null;
}

function mcpVersion(): string | null {
  if (!fileExists("src/mcp/server.ts")) return null;
  const m = read("src/mcp/server.ts").match(
    /name:\s*["']roushi["'],\s*version:\s*["']([^"']+)["']/,
  );
  return m?.[1] ?? null;
}

function changelogHasVersion(version: string): boolean {
  if (!fileExists("CHANGELOG.md")) return false;
  const content = read("CHANGELOG.md");
  // Match either "## [0.13.0]" or "## 0.13.0"
  return new RegExp(`^##\\s+\\[?${version.replace(/\./g, "\\.")}\\]?`, "m").test(
    content,
  );
}

function main() {
  const staged = getStagedFiles();
  const failures: Failure[] = [];

  // We only run the version-sync check if package.json is being committed
  // with a changed version. Otherwise the hook is a no-op (commits not
  // tied to a release are unaffected).
  if (!staged.includes("package.json")) {
    process.exit(0);
  }

  // Was the version actually changed in this commit? Compare staged version
  // to HEAD version.
  let headVersion: string | null = null;
  try {
    const headPkg = execFileSync("git", ["show", "HEAD:package.json"], {
      encoding: "utf-8",
    });
    headVersion = (JSON.parse(headPkg) as { version?: string }).version ?? null;
  } catch {
    // No HEAD yet (first commit) — treat as a version bump
    headVersion = null;
  }

  const currentVersion = packageJsonVersion();
  if (headVersion === currentVersion) {
    // package.json staged but version unchanged — not a release commit
    process.exit(0);
  }

  // ─── Version-sync checks ────────────────────────────────────
  const cli = cliVersion();
  if (cli !== null && cli !== currentVersion) {
    failures.push({
      rule: "version-lockstep",
      message: `src/cli/index.ts has .version("${cli}") but package.json is ${currentVersion}`,
      fix: `Update the .version() call in src/cli/index.ts to "${currentVersion}", or use the release-bump skill.`,
    });
  }

  const mcp = mcpVersion();
  if (mcp !== null && mcp !== currentVersion) {
    failures.push({
      rule: "version-lockstep",
      message: `src/mcp/server.ts has version: "${mcp}" but package.json is ${currentVersion}`,
      fix: `Update the McpServer constructor in src/mcp/server.ts to "${currentVersion}", or use the release-bump skill.`,
    });
  }

  // ─── CHANGELOG check ────────────────────────────────────────
  if (!changelogHasVersion(currentVersion)) {
    failures.push({
      rule: "changelog-entry",
      message: `package.json bumped to ${currentVersion} but CHANGELOG.md has no entry for it`,
      fix: `Add a "## [${currentVersion}] — YYYY-MM-DD" entry at the top of CHANGELOG.md.`,
    });
  }

  if (failures.length > 0) fail(failures);

  console.log(
    `✓ shipment-sweep check passed (version ${currentVersion}, CHANGELOG + 3 version sites in lockstep)`,
  );
}

try {
  main();
} catch (err) {
  console.error("✗ pre-commit-check.ts crashed:", err);
  process.exit(1);
}
