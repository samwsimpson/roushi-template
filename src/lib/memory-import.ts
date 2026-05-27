// Memory import — pull a workspace's Claude auto-memory dir into Roushi as
// searchable `lesson` entities. Auto-memory files (the `feedback_*.md` and
// `project_*.md` that Claude Code writes during sessions) are valuable
// gotchas + workflow notes, but they only live in the local workspace's
// memory dir. Importing them as Roushi lessons gives them cross-portfolio
// discoverability via search without disturbing the local-memory mechanism
// (the files stay in place, get loaded as before, AND become first-class
// brain entities).
//
// Strategy:
//   - Walk the workspace's memory dir
//   - Skip MEMORY.md (it's the local index)
//   - Skip roushi-rule_*.md (those came FROM us — don't re-ingest)
//   - For each remaining .md file with `type: feedback` in its frontmatter,
//     upsert as a `lesson` entity. Slug is prefixed with the product slug
//     (so e.g. Kodori's `feedback_drizzle_migrate_gap.md` becomes the
//     `kodori-drizzle-migrate-gap` lesson — avoids cross-workspace collision).
//   - For `type: project` (work-in-progress notes), skip by default — those
//     are local-only WIP, not durable lessons. Caller can override with
//     includeProjectNotes.
//   - Re-running is idempotent: same slug → upsert.

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { NewEntity } from "../db/schema";
import { entities } from "../db/schema";
import { autoMemoryDirFor } from "./discovery";
import { embedText } from "./embeddings";

export interface ImportOptions {
  /** Include `type: project` notes (WIP, usually local-only). Default: false. */
  includeProjectNotes?: boolean;
}

export interface ImportedFile {
  filename: string;
  slug: string;
  action: "created" | "updated" | "skipped";
  reason?: string;
}

export interface ImportResult {
  workspacePath: string;
  productSlug: string | null;
  memoryDir: string;
  files: ImportedFile[];
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

const SKIP_FILENAMES = new Set(["MEMORY.md"]);
const ROUSHI_RULE_PREFIX = "roushi-rule_";

export async function importWorkspaceMemory(
  workspacePath: string,
  productSlug: string | null,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const memoryDir = autoMemoryDirFor(workspacePath);
  const result: ImportResult = {
    workspacePath,
    productSlug,
    memoryDir,
    files: [],
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
  };

  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(memoryDir);
  } catch {
    // Memory dir doesn't exist — nothing to import.
    return result;
  }

  for (const filename of dirEntries) {
    if (!filename.endsWith(".md")) continue;
    if (SKIP_FILENAMES.has(filename)) continue;
    if (filename.startsWith(ROUSHI_RULE_PREFIX)) continue;

    const filePath = path.join(memoryDir, filename);
    const raw = await fs.readFile(filePath, "utf-8");
    const { data: frontmatter, content: body } = matter(raw);

    // Two frontmatter conventions in use across KumoKodo workspaces:
    //   - Older (DMS): top-level `type: feedback`
    //   - Newer (Roushi-style): nested `metadata.type: feedback`
    // Read both, prefer top-level if present.
    const topLevelType = typeof frontmatter.type === "string" ? frontmatter.type : null;
    const meta = frontmatter.metadata as Record<string, unknown> | undefined;
    const nestedType = meta && typeof meta.type === "string" ? meta.type : null;
    const memoryType = topLevelType ?? nestedType;

    if (memoryType !== "feedback" && memoryType !== "project") {
      result.files.push({ filename, slug: "", action: "skipped", reason: `unknown frontmatter type=${memoryType ?? "(none)"}` });
      result.skippedCount++;
      continue;
    }
    if (memoryType === "project" && !options.includeProjectNotes) {
      result.files.push({ filename, slug: "", action: "skipped", reason: "type=project (use --include-project-notes to import)" });
      result.skippedCount++;
      continue;
    }

    const baseSlug = filename
      .replace(/^feedback_|^project_/, "")
      .replace(/\.md$/, "")
      .replace(/_/g, "-")
      .toLowerCase();
    const scopedSlug = productSlug ? `${productSlug}-${baseSlug}` : `unscoped-${baseSlug}`;

    const name =
      (typeof frontmatter.name === "string" && frontmatter.name) ||
      (typeof frontmatter.description === "string" && frontmatter.description) ||
      baseSlug.replace(/-/g, " ");

    const description = `${frontmatter.description ? `${frontmatter.description}\n\n---\n\n` : ""}${body.trim()}`;

    const embedInput = `${name}: ${description.slice(0, 6000)}`;
    const embedding = await embedText(embedInput);

    const newFrontmatter: Record<string, unknown> = {
      ...frontmatter,
      source: "auto-memory",
      source_workspace: productSlug,
      source_file: filename,
      memory_type: memoryType,
    };
    // Remove the Roushi-incompatible `type: feedback|project` from frontmatter
    // (we're upserting with type=lesson directly).
    delete newFrontmatter.type;

    const values: NewEntity = {
      slug: scopedSlug,
      type: "lesson",
      name: String(name),
      description,
      frontmatter: newFrontmatter,
      sourcePath: filePath,
      embedding,
      lastValidatedAt: new Date(),
    };

    const existing = await db
      .select({ id: entities.id })
      .from(entities)
      .where(sql`${entities.slug} = ${scopedSlug}`)
      .limit(1);

    if (existing[0]) {
      await db
        .update(entities)
        .set({
          type: "lesson",
          name: String(name),
          description,
          frontmatter: newFrontmatter,
          sourcePath: filePath,
          embedding,
          lastValidatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(sql`${entities.slug} = ${scopedSlug}`);
      result.files.push({ filename, slug: scopedSlug, action: "updated" });
      result.updatedCount++;
    } else {
      await db.insert(entities).values(values);
      result.files.push({ filename, slug: scopedSlug, action: "created" });
      result.createdCount++;
    }
  }

  return result;
}
