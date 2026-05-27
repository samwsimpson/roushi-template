// Markdown ingest — read .md files, upsert as entities, resolve [[wikilinks]] into typed edges.
// Two-phase so forward references work: pass 1 upserts every entity, pass 2 creates edges
// (because an edge needs both endpoints to exist).

import { promises as fs } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { edges, entities } from "../db/schema";
import type { Entity, NewEdge, NewEntity } from "../db/schema";
import { embedText } from "./embeddings";
import { parseMarkdown, type WikilinkRef } from "./markdown";

const VALID_ENTITY_TYPES = [
  "product",
  "tech",
  "vendor",
  "decision",
  "pattern",
  "incident",
  "lesson",
  "goal",
  "person",
  "roadmap_item",
  "rule",
] as const;
type EntityType = (typeof VALID_ENTITY_TYPES)[number];

const VALID_EDGE_RELATIONS = [
  "uses",
  "hosted_on",
  "applies_to",
  "supersedes",
  "led_to",
  "shares_pattern",
  "mentions",
  "defined_by",
  "blocks",
  "depends_on",
] as const;
type EdgeRelation = (typeof VALID_EDGE_RELATIONS)[number];

export interface IngestStats {
  filesScanned: number;
  entitiesUpserted: number;
  edgesUpserted: number;
  skippedFiles: string[];
  unresolvedLinks: Array<{ from: string; to: string; relation: string | null }>;
}

interface StagedFile {
  filePath: string;
  slug: string;
  type: EntityType;
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  wikilinks: WikilinkRef[];
}

export async function ingestPath(target: string): Promise<IngestStats> {
  const stats: IngestStats = {
    filesScanned: 0,
    entitiesUpserted: 0,
    edgesUpserted: 0,
    skippedFiles: [],
    unresolvedLinks: [],
  };

  const filePaths = await collectMarkdownFiles(target);
  stats.filesScanned = filePaths.length;

  const staged: StagedFile[] = [];
  for (const filePath of filePaths) {
    const parsed = await stageFile(filePath);
    if (parsed) staged.push(parsed);
    else stats.skippedFiles.push(filePath);
  }

  // Pass 1 — upsert entities (so every slug exists before we create edges).
  const upsertedBySlug = new Map<string, Entity>();
  for (const file of staged) {
    const entity = await upsertEntity(file);
    upsertedBySlug.set(entity.slug, entity);
    stats.entitiesUpserted += 1;
  }

  // Pass 2 — resolve wikilinks → edges. Skip self-edges and unresolved targets.
  for (const file of staged) {
    const from = upsertedBySlug.get(file.slug);
    if (!from) continue;
    for (const link of file.wikilinks) {
      const to = upsertedBySlug.get(link.slug) ?? (await findEntityBySlug(link.slug));
      if (!to) {
        stats.unresolvedLinks.push({ from: file.slug, to: link.slug, relation: link.relation });
        continue;
      }
      if (to.id === from.id) continue;
      const relation = normalizeRelation(link.relation);
      const inserted = await upsertEdge({
        fromEntityId: from.id,
        toEntityId: to.id,
        relation,
        declaredByEntityId: from.id,
        context: link.context,
      });
      if (inserted) stats.edgesUpserted += 1;
    }
  }

  return stats;
}

async function collectMarkdownFiles(target: string): Promise<string[]> {
  const stat = await fs.stat(target);
  if (stat.isFile()) {
    return target.toLowerCase().endsWith(".md") ? [target] : [];
  }
  const out: string[] = [];
  const stack: string[] = [target];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(full);
    }
  }
  return out.sort();
}

async function stageFile(filePath: string): Promise<StagedFile | null> {
  const raw = await fs.readFile(filePath, "utf-8");
  const { frontmatter, body, wikilinks } = parseMarkdown(raw);

  const slug = String(frontmatter.slug ?? frontmatter.name ?? "").trim() || deriveSlug(filePath);
  if (!slug) return null;

  const type = normalizeType(frontmatter.type, filePath);
  const name = String(frontmatter.name ?? frontmatter.title ?? deriveTitle(body) ?? slug).trim();
  const description = extractDescription(frontmatter, body);

  if (!name) return null;

  return {
    filePath,
    slug: slug.toLowerCase().replace(/\s+/g, "-").slice(0, 128),
    type,
    name,
    description,
    frontmatter,
    wikilinks,
  };
}

function deriveSlug(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveTitle(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? (match[1]?.trim() ?? null) : null;
}

function normalizeType(raw: unknown, filePath: string): EntityType {
  const candidate = String(raw ?? "").trim().toLowerCase();
  if ((VALID_ENTITY_TYPES as readonly string[]).includes(candidate)) {
    return candidate as EntityType;
  }
  // Fall back to parent directory name (e.g. content/decisions/foo.md → "decision").
  const parent = path.basename(path.dirname(filePath)).toLowerCase();
  const singular = parent.endsWith("s") ? parent.slice(0, -1) : parent;
  if ((VALID_ENTITY_TYPES as readonly string[]).includes(singular)) {
    return singular as EntityType;
  }
  return "lesson";
}

function normalizeRelation(raw: string | null): EdgeRelation {
  if (!raw) return "mentions";
  const candidate = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((VALID_EDGE_RELATIONS as readonly string[]).includes(candidate)) {
    return candidate as EdgeRelation;
  }
  return "mentions";
}

function extractDescription(frontmatter: Record<string, unknown>, body: string): string {
  if (typeof frontmatter.description === "string") return frontmatter.description;
  const trimmed = body.trim();
  if (!trimmed) return "";
  // First paragraph after any leading heading, capped at 2000 chars.
  const withoutLeadingHeading = trimmed.replace(/^#[^\n]*\n+/, "");
  const firstPara = withoutLeadingHeading.split(/\n\s*\n/)[0] ?? "";
  return firstPara.slice(0, 2000);
}

async function upsertEntity(file: StagedFile): Promise<Entity> {
  const embeddingInput = [file.name, file.description].filter(Boolean).join("\n").trim();
  const embedding = embeddingInput ? await embedText(embeddingInput) : null;

  const newEntity: NewEntity = {
    slug: file.slug,
    type: file.type,
    name: file.name,
    description: file.description,
    frontmatter: file.frontmatter,
    sourcePath: file.filePath,
    embedding: embedding ?? undefined,
    lastValidatedAt: new Date(),
  };

  const [row] = await db
    .insert(entities)
    .values(newEntity)
    .onConflictDoUpdate({
      target: entities.slug,
      set: {
        type: newEntity.type,
        name: newEntity.name,
        description: newEntity.description,
        frontmatter: newEntity.frontmatter,
        sourcePath: newEntity.sourcePath,
        embedding: newEntity.embedding,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error(`upsertEntity returned no row for slug=${file.slug}`);
  return row;
}

async function findEntityBySlug(slug: string): Promise<Entity | null> {
  const rows = await db
    .select()
    .from(entities)
    .where(sql`${entities.slug} = ${slug}`)
    .limit(1);
  return rows[0] ?? null;
}

async function upsertEdge(edge: NewEdge): Promise<boolean> {
  const result = await db
    .insert(edges)
    .values(edge)
    .onConflictDoNothing({
      target: [edges.fromEntityId, edges.toEntityId, edges.relation],
    })
    .returning({ id: edges.id });
  return result.length > 0;
}
