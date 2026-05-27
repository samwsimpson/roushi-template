// Project discovery + self-bootstrap.
//
// discoverProjects(rootDir): walk one level deep, find directories that look
// like projects (CLAUDE.md, package.json, or .git/). Return metadata so the
// caller can render a candidate list (existing vs new).
//
// addProject(input): given a project path, upsert it as a `product` entity in
// the brain, ingest its per-project Claude auto-memory if present, and run
// LLM extraction over its description. Used by the CLI `roushi add-project`
// and the MCP `roushi_add_project` tools.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Entity, NewEntity } from "../db/schema";
import { edges, entities } from "../db/schema";
import { embedText } from "./embeddings";
import { extractEntities } from "./extract";
import { ingestPath } from "./ingest";
import { recordInvocation } from "./invocations";
import { getMatchingPlaybooks } from "./playbooks";
import { syncRulesToWorkspace, type SyncResult } from "./rules";
import type { Playbook, PlaybookInvocation } from "../db/schema";

const CANONICAL_FILES = [
  "CLAUDE.md",
  "PROJECT_SCOPE.md",
  "SCOPE.md",
  "TECH_STACK.md",
  "CHANGELOG.md",
  "README.md",
  "AGENTS.md",
  "PHASES.md",
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
  ".pnpm-store",
]);

const MAX_DESC_CHARS = 8000;
const MAX_EMBED_CHARS = 6000;

export interface DiscoveredProject {
  path: string;
  slug: string;
  name: string;
  alreadyInBrain: boolean;
  signals: {
    hasPackageJson: boolean;
    hasClaudeMd: boolean;
    hasGitDir: boolean;
    canonicalFiles: string[];
    autoMemoryDir: string | null;
    autoMemoryFileCount: number;
  };
}

export interface AddProjectInput {
  /** Absolute path to the project directory. */
  path: string;
  /** Override the brand name (default: package.json.name → PascalCase basename). */
  name?: string;
  /** Override the slug (default: kebab-cased name). */
  slug?: string;
  /** Mark as KumoKodo Studio client work rather than KumoKodo's own product. */
  isClientWork?: boolean;
  /** Client / immediate counterparty. */
  client?: string;
  /** End-customer (for relationships like Navioniq → Clint). */
  endClient?: string;
  /** Skip auto-memory ingest (default: do it if the dir exists). */
  skipAutoMemory?: boolean;
  /** Skip LLM extraction (default: run it). */
  skipExtraction?: boolean;
}

export interface AddProjectResult {
  entity: Entity;
  ingestedMemoryFiles: number;
  ingestedMemoryEntities: number;
  extractedEntities: number;
  extractedEdges: number;
  /**
   * Playbooks whose trigger + filter matches this project_created event.
   * Each one was also persisted as a `PlaybookInvocation` (see invocations),
   * so the caller has both the matched playbook and the run record to
   * track approvals against.
   */
  matchingPlaybooks: Playbook[];
  /** One invocation row per matched playbook, with all actions pre-staged as `pending`. */
  invocations: PlaybookInvocation[];
  /**
   * Rules that were materialized into this workspace's Claude memory dir.
   * Includes rules added (`written`) and orphans removed (`removed`).
   */
  rulesSync: SyncResult;
  /** Whether this was a brand-new entity (true) or an update to an existing one. */
  wasNew: boolean;
}

export async function discoverProjects(rootDir: string): Promise<DiscoveredProject[]> {
  const abs = path.resolve(rootDir);
  const dirents = await fs.readdir(abs, { withFileTypes: true });

  const projects: DiscoveredProject[] = [];
  for (const ent of dirents) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".") || SKIP_DIRS.has(ent.name)) continue;

    const projPath = path.join(abs, ent.name);
    const signals = await probeSignals(projPath);
    if (!signals.hasPackageJson && !signals.hasClaudeMd && !signals.hasGitDir) continue;

    const derived = await deriveSlugAndName(projPath, ent.name);
    // If the project is already in the brain, display its actual stored slug/name —
    // not whatever we'd guess. The user manually picked Kodori for DMS, Kasuri for
    // logo creator, etc. — scan should respect that.
    const existing = await findExistingForPath(projPath);
    const slug = existing?.slug ?? derived.slug;
    const name = existing?.name ?? derived.name;

    projects.push({
      path: projPath,
      slug,
      name,
      alreadyInBrain: existing !== null,
      signals,
    });
  }

  return projects.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function addProject(input: AddProjectInput): Promise<AddProjectResult> {
  const projPath = path.resolve(input.path);
  await ensureDirExists(projPath);

  const dirBase = path.basename(projPath);
  const derived = await deriveSlugAndName(projPath, dirBase);
  const slug = input.slug ?? derived.slug;
  const name = input.name ?? derived.name;

  // Check whether this project already exists so we can fire project_created
  // (vs project_updated) playbooks.
  const existingBySlug = await findEntityBySlug(slug);
  const wasNew = existingBySlug === null;

  const content = await loadProjectContent(projPath, name);
  const description = content.slice(0, MAX_DESC_CHARS);
  const embedInput = `${name}: ${description}`.slice(0, MAX_EMBED_CHARS).trim();
  const embedding = embedInput ? await embedText(embedInput) : undefined;

  const frontmatter: Record<string, unknown> = {
    repo: dirBase,
    source_files: CANONICAL_FILES,
    auto_added_at: new Date().toISOString(),
  };
  if (input.isClientWork) {
    frontmatter.client_work = true;
    if (input.client) frontmatter.client = input.client;
    if (input.endClient) frontmatter.end_client = input.endClient;
  }

  const values: NewEntity = {
    slug,
    type: "product",
    name,
    description,
    frontmatter,
    sourcePath: projPath,
    embedding,
    lastValidatedAt: new Date(),
  };

  const [entity] = await db
    .insert(entities)
    .values(values)
    .onConflictDoUpdate({
      target: entities.slug,
      set: {
        type: "product",
        name,
        description,
        frontmatter,
        sourcePath: projPath,
        embedding,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!entity) throw new Error(`addProject: upsert returned no row for ${slug}`);

  // Ingest per-project Claude auto-memory if it exists.
  let ingestedMemoryFiles = 0;
  let ingestedMemoryEntities = 0;
  if (!input.skipAutoMemory) {
    const memDir = autoMemoryDirFor(projPath);
    try {
      await fs.stat(memDir);
      const stats = await ingestPath(memDir);
      ingestedMemoryFiles = stats.filesScanned;
      ingestedMemoryEntities = stats.entitiesUpserted;
    } catch {
      // No auto-memory dir — that's fine.
    }
  }

  // Run LLM extraction over the new product's description.
  let extractedEntities = 0;
  let extractedEdges = 0;
  if (!input.skipExtraction && entity.description.trim().length > 0) {
    const allSlugs = (await db.select({ slug: entities.slug }).from(entities)).map((r) => r.slug);
    const result = await extractEntities({
      sourceSlug: entity.slug,
      sourceName: entity.name,
      sourceText: entity.description,
      existingSlugs: allSlugs,
    });

    const slugToId = new Map<string, string>();
    for (const e of result.entities) {
      if (e.slug === entity.slug) continue;
      try {
        const upserted = await upsertExtractedEntity(e);
        slugToId.set(e.slug, upserted.id);
        extractedEntities += 1;
      } catch {
        const existing = await findEntityBySlug(e.slug);
        if (existing) slugToId.set(e.slug, existing.id);
      }
    }

    for (const edge of result.edges) {
      let toId = slugToId.get(edge.toSlug);
      if (!toId) {
        const existing = await findEntityBySlug(edge.toSlug);
        if (!existing) continue;
        toId = existing.id;
      }
      const created = await db
        .insert(edges)
        .values({
          fromEntityId: entity.id,
          toEntityId: toId,
          relation: edge.relation as never,
          declaredByEntityId: entity.id,
          context: edge.context ?? null,
        })
        .onConflictDoNothing({
          target: [edges.fromEntityId, edges.toEntityId, edges.relation],
        })
        .returning({ id: edges.id });
      if (created.length > 0) extractedEdges += 1;
    }
  }

  // Surface matching playbooks for the appropriate trigger. wasNew → project_created;
  // existing entity refresh → project_updated. Caller decides what to do with them.
  const trigger = wasNew ? "project_created" : "project_updated";
  const eventContext: Record<string, unknown> = {
    entitySlug: entity.slug,
    entityType: entity.type,
    clientWork: (entity.frontmatter as Record<string, unknown>)?.client_work === true,
  };
  const matchingPlaybooks = await getMatchingPlaybooks({
    trigger,
    entitySlug: entity.slug,
    entityType: entity.type,
    meta: eventContext,
  });

  // Persist one invocation per matching playbook so they show up in /playbooks/runs
  // for review. Auto-execution stays opt-in (the agent/human handles actions).
  const invocations: PlaybookInvocation[] = [];
  for (const pb of matchingPlaybooks) {
    const { invocation } = await recordInvocation({
      playbook: pb,
      eventTrigger: trigger,
      eventContext,
      entityId: entity.id,
    });
    invocations.push(invocation);
  }

  // Sync portfolio / type / slug-scoped rules into this workspace's Claude
  // memory dir. The agent in that workspace will pick them up on next session
  // start. Failures here log but don't block the add.
  let rulesSync: SyncResult;
  try {
    rulesSync = await syncRulesToWorkspace(projPath, entity.slug);
  } catch (err) {
    console.error(
      `[addProject] rules sync failed for ${entity.slug}:`,
      err instanceof Error ? err.message : err,
    );
    rulesSync = {
      workspacePath: projPath,
      productSlug: entity.slug,
      memoryDir: autoMemoryDirFor(projPath),
      written: [],
      removed: [],
    };
  }

  return {
    entity,
    ingestedMemoryFiles,
    ingestedMemoryEntities,
    extractedEntities,
    extractedEdges,
    matchingPlaybooks,
    invocations,
    rulesSync,
    wasNew,
  };
}

// ─── internals ──────────────────────────────────────────────────────

async function probeSignals(projPath: string): Promise<DiscoveredProject["signals"]> {
  const [hasPackageJson, hasClaudeMd, hasGitDir] = await Promise.all([
    exists(path.join(projPath, "package.json")),
    exists(path.join(projPath, "CLAUDE.md")),
    exists(path.join(projPath, ".git")),
  ]);

  const canonicalFiles: string[] = [];
  for (const f of CANONICAL_FILES) {
    if (await exists(path.join(projPath, f))) canonicalFiles.push(f);
  }

  const memDir = autoMemoryDirFor(projPath);
  let autoMemoryDir: string | null = null;
  let autoMemoryFileCount = 0;
  try {
    const stat = await fs.stat(memDir);
    if (stat.isDirectory()) {
      autoMemoryDir = memDir;
      const files = await fs.readdir(memDir);
      autoMemoryFileCount = files.filter((f) => f.toLowerCase().endsWith(".md")).length;
    }
  } catch {
    // No auto-memory dir
  }

  return { hasPackageJson, hasClaudeMd, hasGitDir, canonicalFiles, autoMemoryDir, autoMemoryFileCount };
}

async function deriveSlugAndName(
  _projPath: string,
  dirBasename: string,
): Promise<{ slug: string; name: string }> {
  // Default slug = kebab-cased directory basename. We intentionally DON'T trust
  // package.json.name because it's often generic ("scope", "app", "main") or a
  // workspace sub-package name that doesn't represent the project as a whole.
  // Users can override with --slug / --name on `roushi add-project`.
  const slug = dirBasename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  return { slug, name: dirBasename };
}

async function findExistingForPath(projPath: string): Promise<{ slug: string; name: string } | null> {
  const rows = await db
    .select({ slug: entities.slug, name: entities.name })
    .from(entities)
    .where(sql`${entities.sourcePath} = ${projPath} AND ${entities.type} = 'product'`)
    .limit(1);
  return rows[0] ?? null;
}

async function loadProjectContent(projPath: string, fallbackTagline: string): Promise<string> {
  const sections: string[] = [fallbackTagline];
  for (const file of CANONICAL_FILES) {
    const full = path.join(projPath, file);
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
      const raw = await fs.readFile(full, "utf-8");
      const stripped = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
      if (stripped.length > 0) sections.push(`## ${file}\n${stripped}`);
    } catch {
      // Skip missing
    }
  }
  return sections.join("\n\n");
}

export function autoMemoryDirFor(projPath: string): string {
  // Claude Code encodes the absolute path by lowercasing the drive letter and
  // replacing colons, slashes, backslashes, and spaces with dashes.
  // e.g. C:/Users/samws/zoningai → c--Users-samws-zoningai
  const encoded = projPath
    .replace(/^([A-Z])/, (c) => c.toLowerCase())
    .replace(/[:\\/\s]/g, "-");
  return path.join(os.homedir(), ".claude", "projects", encoded, "memory");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirExists(p: string): Promise<void> {
  const stat = await fs.stat(p).catch(() => null);
  if (!stat) throw new Error(`addProject: path does not exist: ${p}`);
  if (!stat.isDirectory()) throw new Error(`addProject: not a directory: ${p}`);
}

async function findEntityBySlug(slug: string): Promise<Entity | null> {
  const rows = await db.select().from(entities).where(sql`${entities.slug} = ${slug}`).limit(1);
  return rows[0] ?? null;
}

async function upsertExtractedEntity(input: {
  slug: string;
  type: "tech" | "vendor" | "decision" | "pattern" | "lesson";
  name: string;
  description: string;
}): Promise<Entity> {
  const existing = await findEntityBySlug(input.slug);
  if (existing) {
    const isExtracted = (existing.frontmatter as Record<string, unknown> | null)?.extracted === true;
    const isEmpty = !existing.description || existing.description.trim() === "";
    if (!isExtracted && !isEmpty) {
      const [row] = await db
        .update(entities)
        .set({ lastValidatedAt: new Date() })
        .where(sql`${entities.id} = ${existing.id}`)
        .returning();
      return row ?? existing;
    }
  }

  const embeddingInput = `${input.name}\n${input.description}`.trim();
  const embedding = embeddingInput ? await embedText(embeddingInput) : undefined;

  const values: NewEntity = {
    slug: input.slug,
    type: input.type,
    name: input.name,
    description: input.description,
    frontmatter: { extracted: true },
    embedding,
    lastValidatedAt: new Date(),
  };

  const [row] = await db
    .insert(entities)
    .values(values)
    .onConflictDoUpdate({
      target: entities.slug,
      set: {
        type: input.type,
        name: input.name,
        description: input.description,
        embedding,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error(`upsertExtractedEntity: no row for ${input.slug}`);
  return row;
}
