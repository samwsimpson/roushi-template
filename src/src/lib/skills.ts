// Skills — Claude Code skills as first-class entities in the brain.
//
// A skill is a directory under `~/.claude/skills/<name>/` (or a project's
// `.claude/skills/<name>/`) containing a `SKILL.md` file with YAML
// frontmatter. The frontmatter's `name` and `description` are what Claude
// Code uses to decide when to invoke the skill — so they're what we want
// in the brain's embedding for "think can cite a skill" to work.
//
// We do NOT host skill bodies in Roushi (that would break Claude Code's
// native /<skill> invocation). We just INDEX them — slug, trigger
// description, body for context, and a pointer back to the SKILL.md path.
//
// Distribution is one-way: SKILL.md files on disk → Roushi entities.
// Editing the entity in Roushi does NOT write back to disk (use
// /skill-creator for that — see CLAUDE.md).

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { writeFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Entity, NewEntity } from "../db/schema";
import { entities } from "../db/schema";
import { embedText } from "./embeddings";

export interface SkillFrontmatter {
  /** Required — the canonical skill name (kebab-case). */
  name?: string;
  /** Required — the trigger description Claude Code matches against. */
  description?: string;
  license?: string;
  /**
   * Optional scope hints. Mirror the rules-system pattern so per-product
   * skills can be auto-pushed into the right workspace via
   * `pnpm roushi skill sync-workspace`. A skill applies to a workspace if
   * any of these match:
   *   - applies_to_slug === productSlug
   *   - applies_to_type === productType (usually "product")
   *   - applies_to === "portfolio"
   * A skill with none of these stays user-global only — it lives in
   * `~/.claude/skills/` and isn't propagated to per-project dirs.
   */
  applies_to_slug?: string;
  applies_to_type?: string;
  applies_to?: "portfolio";
  /** Free-form: skills may include other fields (allowed-tools, etc.). */
  [key: string]: unknown;
}

export type Skill = Entity & { type: "skill" };

export interface DiscoveredSkill {
  /** Directory basename — used as the slug (after sanitization). */
  dirName: string;
  /** Absolute path to the SKILL.md file. */
  skillMdPath: string;
  /** Parsed YAML frontmatter (may be empty). */
  frontmatter: SkillFrontmatter;
  /** SKILL.md content with the frontmatter stripped. */
  body: string;
  /** File mtime — used as `last_validated_at`. */
  modifiedAt: Date;
  /** What flagged this skill during discovery (linter-style). */
  warnings: string[];
}

export interface IngestSkillsResult {
  scanned: number;
  upserted: number;
  skipped: Array<{ dir: string; reason: string }>;
}

/**
 * Default search path for user-global skills: `~/.claude/skills/`.
 */
export function defaultSkillsRoot(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

/**
 * Walk one or more skills-root directories and return every well-formed
 * skill found. Each root is expected to contain `<name>/SKILL.md` entries
 * one level deep — that's the structure Claude Code itself uses.
 *
 * Loose `.md` files at the top level of a skills root (not in a subdir)
 * are flagged as warnings — they won't be picked up by Claude Code's
 * discovery either. This matches the "misfiled skill" linter check the
 * skill-creator plugin runs.
 */
export async function discoverSkills(roots: string[]): Promise<DiscoveredSkill[]> {
  const out: DiscoveredSkill[] = [];

  for (const root of roots) {
    let dirents: import("node:fs").Dirent[];
    try {
      dirents = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue; // root doesn't exist — silently skip
    }

    for (const ent of dirents) {
      const full = path.join(root, ent.name);

      if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
        // Misfiled — a top-level .md that should be in `<name>/SKILL.md`.
        // Surface it so the linter / web UI can flag it, but don't ingest.
        out.push({
          dirName: ent.name.replace(/\.md$/i, ""),
          skillMdPath: full,
          frontmatter: {},
          body: "",
          modifiedAt: new Date(),
          warnings: [
            `Misfiled: lives at \`${full}\` — Claude Code expects \`${ent.name.replace(/\.md$/i, "")}/SKILL.md\`. Move it.`,
          ],
        });
        continue;
      }

      if (!ent.isDirectory()) continue;

      const skillMdPath = path.join(full, "SKILL.md");
      let raw: string;
      let stat: import("node:fs").Stats;
      try {
        [raw, stat] = await Promise.all([fs.readFile(skillMdPath, "utf-8"), fs.stat(skillMdPath)]);
      } catch {
        continue; // dir has no SKILL.md — not a skill
      }

      let frontmatter: SkillFrontmatter = {};
      let body = raw;
      try {
        const parsed = matter(raw);
        frontmatter = (parsed.data ?? {}) as SkillFrontmatter;
        body = parsed.content ?? raw;
      } catch (err) {
        // Malformed YAML — still index it, but flag.
        out.push({
          dirName: ent.name,
          skillMdPath,
          frontmatter: {},
          body: raw,
          modifiedAt: stat.mtime,
          warnings: [`Malformed YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`],
        });
        continue;
      }

      const warnings: string[] = [];
      if (!frontmatter.name) warnings.push("Missing `name` in frontmatter — falling back to directory basename.");
      if (!frontmatter.description) warnings.push("Missing `description` in frontmatter — skill won't trigger reliably without one.");
      if (frontmatter.name && frontmatter.name !== ent.name) {
        warnings.push(
          `Frontmatter \`name: ${frontmatter.name}\` doesn't match directory \`${ent.name}\` — Claude Code uses the directory name as the slug.`,
        );
      }

      out.push({
        dirName: ent.name,
        skillMdPath,
        frontmatter,
        body,
        modifiedAt: stat.mtime,
        warnings,
      });
    }
  }

  return out;
}

/**
 * Discover skills under the given roots and upsert each as a `skill`
 * entity. Slug = directory basename (sanitized). Embedding made from
 * `name + description` (the trigger surface), not the body, since that's
 * what determines triggering.
 *
 * Misfiled top-level .md files are reported as `skipped` — we don't
 * create entities for them because Claude Code can't load them either.
 */
export async function ingestSkills(roots?: string[]): Promise<IngestSkillsResult> {
  const targets = roots && roots.length > 0 ? roots : [defaultSkillsRoot()];
  const discovered = await discoverSkills(targets);

  const skipped: Array<{ dir: string; reason: string }> = [];
  let upserted = 0;

  for (const d of discovered) {
    if (d.warnings.some((w) => w.startsWith("Misfiled:")) || !d.frontmatter.name) {
      const primaryWarning = d.warnings[0] ?? "Missing frontmatter.name — cannot index.";
      if (!d.frontmatter.name && d.body.length === 0) {
        skipped.push({ dir: d.skillMdPath, reason: primaryWarning });
        continue;
      }
      if (d.warnings.some((w) => w.startsWith("Misfiled:"))) {
        skipped.push({ dir: d.skillMdPath, reason: primaryWarning });
        continue;
      }
    }

    const slug = sanitizeSlug(d.dirName);
    const name = d.frontmatter.name ?? d.dirName;
    const triggerDesc = d.frontmatter.description ?? "";

    // Embedding is the trigger surface — that's what `think`/`search` use to
    // recommend the skill. The body is for retrieval context only.
    const embeddingInput = [name, triggerDesc].filter(Boolean).join("\n").trim();
    const embedding = embeddingInput ? await embedText(embeddingInput) : undefined;

    const frontmatterToStore: Record<string, unknown> = {
      ...d.frontmatter,
      _source_path: d.skillMdPath,
      _warnings: d.warnings.length > 0 ? d.warnings : undefined,
    };

    const newSkill: NewEntity = {
      slug,
      type: "skill",
      name,
      description: triggerDesc ? `${triggerDesc}\n\n---\n\n${d.body}` : d.body,
      frontmatter: frontmatterToStore,
      sourcePath: d.skillMdPath,
      embedding,
      lastValidatedAt: d.modifiedAt,
    };

    await db
      .insert(entities)
      .values(newSkill)
      .onConflictDoUpdate({
        target: entities.slug,
        set: {
          type: "skill",
          name: newSkill.name,
          description: newSkill.description,
          frontmatter: newSkill.frontmatter,
          sourcePath: newSkill.sourcePath,
          embedding: newSkill.embedding,
          lastValidatedAt: newSkill.lastValidatedAt,
          updatedAt: new Date(),
        },
      });
    upserted++;
  }

  return { scanned: discovered.length, upserted, skipped };
}

export async function listSkills(): Promise<Skill[]> {
  const rows = await db
    .select()
    .from(entities)
    .where(sql`${entities.type} = 'skill'`)
    .orderBy(sql`${entities.name}`);
  return rows as Skill[];
}

export async function getSkill(slug: string): Promise<Skill | null> {
  const rows = await db
    .select()
    .from(entities)
    .where(sql`${entities.type} = 'skill' AND ${entities.slug} = ${slug}`)
    .limit(1);
  return (rows[0] as Skill | undefined) ?? null;
}

function sanitizeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Disk ↔ repo sync ──────────────────────────────────────────────
// Skills live on disk at `~/.claude/skills/<name>/SKILL.md` so Claude
// Code can invoke them natively. That location isn't git-tracked, so
// edits are vulnerable to machine wipes and can't be shared across
// teammates without manual copying.
//
// These helpers mirror skills into Roushi's `content/skills/<name>/SKILL.md`
// (git-tracked) and back. Disk stays the source of authority for what
// Claude Code loads; the repo copy is the version-controlled backup +
// team-sync channel. They're independent of the brain `skill` entity
// — those are still managed via `ingestSkills` reading disk.

/** Default location of the git-tracked mirror, relative to repo root. */
const DEFAULT_REPO_SKILLS_DIR_REL = "content/skills";

function defaultRepoSkillsDir(): string {
  return path.resolve(process.cwd(), DEFAULT_REPO_SKILLS_DIR_REL);
}

interface SkillFile {
  /** Skill name = directory basename. */
  name: string;
  /** Absolute path to the SKILL.md on disk. */
  skillMdPath: string;
  /** Raw contents of SKILL.md. */
  content: string;
  /** SHA-256 of content. Used for conflict detection. */
  hash: string;
}

export interface SkillSyncConflict {
  name: string;
  reason: string;
  /** Unified diff of disk-side vs repo-side, if computeDiff was set. */
  diff?: string;
}

export interface SkillSyncResult {
  /** Names of skills written FROM disk INTO the repo mirror. */
  pulled: string[];
  /** Names of skills written FROM the repo mirror TO disk. */
  pushed: string[];
  /** Names where the two sides matched and no write was needed. */
  unchanged: string[];
  /** Names where the two sides diverge — operator must pick a winner. */
  conflicts: SkillSyncConflict[];
}

/**
 * Compute a unified diff between two strings by shelling out to
 * `git diff --no-index`. Falls back to a plain "both contents shown
 * separately" rendering if git isn't on PATH.
 *
 * `git diff --no-index` exits non-zero when files differ — that's
 * the expected case here, so we ignore the exit code and read stdout.
 */
function unifiedDiff(diskContent: string, repoContent: string): string {
  const tmpDir = os.tmpdir();
  const stamp = `${process.pid}-${Date.now()}`;
  const diskPath = path.join(tmpDir, `roushi-skill-disk-${stamp}.md`);
  const repoPath = path.join(tmpDir, `roushi-skill-repo-${stamp}.md`);
  try {
    writeFileSync(diskPath, diskContent);
    writeFileSync(repoPath, repoContent);
    const result = spawnSync(
      "git",
      ["diff", "--no-index", "--no-color", "--unified=3", diskPath, repoPath],
      { encoding: "utf-8" },
    );
    if (result.stdout && result.stdout.length > 0) {
      // git diff --no-index emits 4 header lines (diff --git, index, ---,
      // +++) with absolute temp paths that are noise to the operator.
      // Drop them, keep the @@/+/-/space body. Substitute a clean
      // semantic header at the top.
      const body = result.stdout
        .split("\n")
        .filter((line, i, lines) => {
          if (line.startsWith("diff --git ")) return false;
          if (line.startsWith("index ")) return false;
          if (line.startsWith("--- ") && i < 6) return false;
          if (line.startsWith("+++ ") && i < 6) return false;
          // also drop tab "no newline" markers — rare and confusing
          if (line === "\\ No newline at end of file") return false;
          // Reference lines[i] in a no-op so eslint doesn't whine about
          // an unused param (the index is real, the array isn't needed).
          void lines;
          return true;
        })
        .join("\n")
        .replace(/^\s+|\s+$/g, "");
      return body ? `--- a (disk)\n+++ b (repo)\n${body}` : "(no diff body)";
    }
    return "(git diff produced no output)";
  } catch {
    return [
      "(diff unavailable — git not on PATH; raw contents below)",
      "",
      "--- DISK SIDE ---",
      diskContent,
      "--- REPO SIDE ---",
      repoContent,
    ].join("\n");
  } finally {
    try {
      unlinkSync(diskPath);
    } catch {
      // ignore — temp file cleanup is best-effort
    }
    try {
      unlinkSync(repoPath);
    } catch {
      // ignore
    }
  }
}

async function readSkillFile(skillDir: string): Promise<SkillFile | null> {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  try {
    const content = await fs.readFile(skillMdPath, "utf-8");
    return {
      name: path.basename(skillDir),
      skillMdPath,
      content,
      hash: crypto.createHash("sha256").update(content).digest("hex"),
    };
  } catch {
    return null;
  }
}

async function collectSkillFiles(root: string): Promise<Map<string, SkillFile>> {
  const out = new Map<string, SkillFile>();
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of dirents) {
    if (!ent.isDirectory()) continue;
    const file = await readSkillFile(path.join(root, ent.name));
    if (file) out.set(file.name, file);
  }
  return out;
}

async function writeSkillFile(targetDir: string, name: string, content: string): Promise<void> {
  const skillDir = path.join(targetDir, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8");
}

export interface SyncOptions {
  /** Disk source root. Defaults to `~/.claude/skills/`. */
  diskRoot?: string;
  /** Repo mirror root. Defaults to `<cwd>/content/skills/`. */
  repoSkillsDir?: string;
  /** When true, include a unified diff with each conflict (sync only). */
  computeDiff?: boolean;
}

/**
 * One-way copy: disk → repo mirror. Idempotent — files unchanged on
 * both sides are skipped. Existing repo content for the same skill
 * name is OVERWRITTEN; if the repo had local edits not on disk, run
 * `syncSkillsWithDisk` instead to detect conflicts.
 */
export async function pullSkillsFromDisk(opts: SyncOptions = {}): Promise<SkillSyncResult> {
  const diskRoot = opts.diskRoot ?? defaultSkillsRoot();
  const repoSkillsDir = opts.repoSkillsDir ?? defaultRepoSkillsDir();

  const [disk, repo] = await Promise.all([
    collectSkillFiles(diskRoot),
    collectSkillFiles(repoSkillsDir),
  ]);

  const pulled: string[] = [];
  const unchanged: string[] = [];

  for (const [name, diskFile] of disk) {
    const repoFile = repo.get(name);
    if (repoFile && repoFile.hash === diskFile.hash) {
      unchanged.push(name);
      continue;
    }
    await writeSkillFile(repoSkillsDir, name, diskFile.content);
    pulled.push(name);
  }

  return { pulled, pushed: [], unchanged, conflicts: [] };
}

/**
 * One-way copy: repo mirror → disk. Idempotent. Existing disk content
 * for the same skill name is OVERWRITTEN; use `syncSkillsWithDisk` for
 * conflict-aware behavior.
 */
export async function pushSkillsToDisk(opts: SyncOptions = {}): Promise<SkillSyncResult> {
  const diskRoot = opts.diskRoot ?? defaultSkillsRoot();
  const repoSkillsDir = opts.repoSkillsDir ?? defaultRepoSkillsDir();

  const [repo, disk] = await Promise.all([
    collectSkillFiles(repoSkillsDir),
    collectSkillFiles(diskRoot),
  ]);

  const pushed: string[] = [];
  const unchanged: string[] = [];

  for (const [name, repoFile] of repo) {
    const diskFile = disk.get(name);
    if (diskFile && diskFile.hash === repoFile.hash) {
      unchanged.push(name);
      continue;
    }
    await writeSkillFile(diskRoot, name, repoFile.content);
    pushed.push(name);
  }

  return { pulled: [], pushed, unchanged, conflicts: [] };
}

/**
 * Two-way sync between disk and repo mirror.
 *
 * - If only one side has a skill, copy to the other.
 * - If both sides have it and contents match, skip.
 * - If both sides have it and contents differ, FLAG AS CONFLICT — do
 *   NOT auto-merge. The operator picks the winner via `pull` (take
 *   disk) or `push` (take repo).
 *
 * This is the safe default for teams: it never silently overwrites
 * divergent work.
 */
export async function syncSkillsWithDisk(opts: SyncOptions = {}): Promise<SkillSyncResult> {
  const diskRoot = opts.diskRoot ?? defaultSkillsRoot();
  const repoSkillsDir = opts.repoSkillsDir ?? defaultRepoSkillsDir();

  const [disk, repo] = await Promise.all([
    collectSkillFiles(diskRoot),
    collectSkillFiles(repoSkillsDir),
  ]);

  const pulled: string[] = [];
  const pushed: string[] = [];
  const unchanged: string[] = [];
  const conflicts: SkillSyncConflict[] = [];

  const names = new Set<string>([...disk.keys(), ...repo.keys()]);

  for (const name of names) {
    const diskFile = disk.get(name);
    const repoFile = repo.get(name);

    if (diskFile && !repoFile) {
      await writeSkillFile(repoSkillsDir, name, diskFile.content);
      pulled.push(name);
    } else if (!diskFile && repoFile) {
      await writeSkillFile(diskRoot, name, repoFile.content);
      pushed.push(name);
    } else if (diskFile && repoFile) {
      if (diskFile.hash === repoFile.hash) {
        unchanged.push(name);
      } else {
        const conflict: SkillSyncConflict = {
          name,
          reason:
            "Disk and repo both have content but they differ. Resolve manually: `pnpm roushi skill pull` takes disk; `pnpm roushi skill push` takes repo.",
        };
        if (opts.computeDiff) {
          conflict.diff = unifiedDiff(diskFile.content, repoFile.content);
        }
        conflicts.push(conflict);
      }
    }
  }

  return { pulled, pushed, unchanged, conflicts };
}

// ─── Project-scoped skill sync ─────────────────────────────────────
// Some skills are universal (frontend-design, seo-optimizer); others
// only make sense in a specific product (e.g. a "kodori-redline-helper").
// Project-scoped skills set `applies_to_slug` / `applies_to_type` /
// `applies_to: portfolio` in frontmatter — same vocabulary as rules — and
// get pushed into matching workspaces' `.claude/skills/` on demand.
//
// A marker file (`.roushi-skill`) is dropped alongside the SKILL.md when
// Roushi writes the dir, so we can safely remove orphans later WITHOUT
// touching user-installed skills that share the same workspace.

const MANAGED_MARKER = ".roushi-skill";

export interface WorkspaceSkill {
  slug: string;
  content: string;
}

/**
 * Return skills that should propagate to a workspace with the given
 * product slug. Reads content from the git-tracked repo mirror
 * (`content/skills/<slug>/SKILL.md`) first, falls back to the skill's
 * original disk source if the repo doesn't have a copy.
 */
export async function skillsForWorkspace(
  productSlug: string | null,
  productType = "product",
  repoSkillsDir?: string,
): Promise<WorkspaceSkill[]> {
  const all = await listSkills();
  const dir = repoSkillsDir ?? defaultRepoSkillsDir();
  const out: WorkspaceSkill[] = [];

  for (const s of all) {
    const fm = (s.frontmatter ?? {}) as Record<string, unknown>;
    const matches =
      (productSlug && fm.applies_to_slug === productSlug) ||
      fm.applies_to_type === productType ||
      fm.applies_to === "portfolio";
    if (!matches) continue;

    // Prefer the git-tracked repo copy as source of truth.
    let content: string | null = null;
    try {
      content = await fs.readFile(path.join(dir, s.slug, "SKILL.md"), "utf-8");
    } catch {
      // Fall back to the original disk path the brain remembered on ingest.
      const sourcePath = typeof fm._source_path === "string" ? fm._source_path : s.sourcePath;
      if (sourcePath) {
        try {
          content = await fs.readFile(sourcePath, "utf-8");
        } catch {
          // Both paths failed — skip this skill silently.
        }
      }
    }
    if (content) out.push({ slug: s.slug, content });
  }

  return out;
}

export interface WorkspaceSyncResult {
  workspacePath: string;
  skillsDir: string;
  productSlug: string | null;
  written: string[];
  removed: string[];
}

/**
 * Push every skill applicable to this workspace into
 * `<workspacePath>/.claude/skills/<slug>/SKILL.md`, drop a
 * `.roushi-skill` marker alongside, and remove any previously-managed
 * skill dirs that no longer apply. User-installed skills (no marker)
 * are never touched.
 */
export async function syncSkillsToWorkspace(
  workspacePath: string,
  productSlug: string | null,
  productType = "product",
): Promise<WorkspaceSyncResult> {
  const skillsDir = path.join(workspacePath, ".claude", "skills");
  await fs.mkdir(skillsDir, { recursive: true });

  const applicable = await skillsForWorkspace(productSlug, productType);
  const applicableSlugs = new Set(applicable.map((s) => s.slug));

  const written: string[] = [];
  for (const s of applicable) {
    const dir = path.join(skillsDir, s.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), s.content, "utf-8");
    await fs.writeFile(path.join(dir, MANAGED_MARKER), "", "utf-8");
    written.push(s.slug);
  }

  // Orphan removal: anything that has our marker but isn't in the
  // current applicable set gets deleted. Anything without our marker
  // (user-installed skills) is left alone.
  const removed: string[] = [];
  let dirents: import("node:fs").Dirent[] = [];
  try {
    dirents = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch {
    dirents = [];
  }
  for (const ent of dirents) {
    if (!ent.isDirectory()) continue;
    if (applicableSlugs.has(ent.name)) continue;
    const markerPath = path.join(skillsDir, ent.name, MANAGED_MARKER);
    try {
      await fs.access(markerPath);
    } catch {
      continue; // no marker — user-installed, do not touch
    }
    await fs.rm(path.join(skillsDir, ent.name), { recursive: true, force: true });
    removed.push(ent.name);
  }

  return { workspacePath, skillsDir, productSlug, written, removed };
}

/**
 * Resolve a user-supplied target path into the disk root that
 * Claude Code reads skills from. Accepts:
 *   - An absolute path ending in `.claude/skills` → used as-is.
 *   - A workspace path (e.g. `C:/Users/samws/Some-Project`) → appends
 *     `.claude/skills` to make it the project-scoped skill location.
 *   - `undefined` → falls back to `~/.claude/skills/` (user-global).
 */
export function resolveSkillsTarget(input?: string): string {
  if (!input) return defaultSkillsRoot();
  const abs = path.resolve(input);
  const normalized = abs.replace(/\\/g, "/");
  if (normalized.endsWith("/.claude/skills") || normalized.endsWith("/.claude/skills/")) {
    return abs;
  }
  return path.join(abs, ".claude", "skills");
}
