// Roushi-as-advisor — given a file path being edited in any KumoKodo
// workspace, return the brain's relevant context for that file: which
// product, which lessons match this file type, which decisions apply.
//
// Surfaced to Claude via a PreToolUse hook so the brain prescribes
// context BEFORE the edit lands, not after.
//
// Design: fast over thorough. The hook fires on every Edit/Write across
// every workspace, so total budget is ~500ms wall-clock. We use a
// classification + slug-match approach rather than hybrid search, to
// avoid an embeddings round-trip for every keystroke.

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { entities } from "../db/schema";

// ─── Per-file cache (30s TTL) ──────────────────────────────────────
// The advisor hook spawns a fresh tsx process per Edit/Write, so an
// in-memory cache is useless across invocations. A small JSON file in
// the OS temp dir survives between processes and amortizes the DB-query
// portion of the cost (~100-200ms) when the same file is edited
// repeatedly within a 30s window.
//
// The tsx cold start (~200-300ms) is fixed and unavoidable. So
// expected speedup on cache hit: ~30-40% wall-clock.
//
// Cache key: SHA-256(filePath). Cache value: the full FileContext +
// expiresAt timestamp.

const CACHE_TTL_MS = 30_000;
const CACHE_DIR = path.join(os.tmpdir(), "roushi-advisor-cache");

function cacheKey(filePath: string): string {
  return crypto.createHash("sha256").update(filePath).digest("hex");
}

async function readCache(filePath: string): Promise<FileContext | null> {
  try {
    const cachePath = path.join(CACHE_DIR, `${cacheKey(filePath)}.json`);
    const raw = await fs.readFile(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as { ctx: FileContext; expiresAt: number };
    if (parsed.expiresAt < Date.now()) return null;
    return parsed.ctx;
  } catch {
    return null;
  }
}

async function writeCache(filePath: string, ctx: FileContext): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cachePath = path.join(CACHE_DIR, `${cacheKey(filePath)}.json`);
    await fs.writeFile(
      cachePath,
      JSON.stringify({ ctx, expiresAt: Date.now() + CACHE_TTL_MS }),
      "utf-8",
    );
  } catch {
    // Cache writes never block the hook — silently swallow.
  }
}

// File-type classification: regex → keyword(s) that match relevant
// lessons/decisions/skills in the brain. Keep narrow — over-matching is
// worse than under-matching here (noise > silence).
//
// Order matters: first match wins. Put more-specific patterns (cron
// route) before more-general ones (api route).
const CLASSIFICATIONS: Array<{
  pattern: RegExp;
  label: string;
  keywords: string[];
}> = [
  {
    pattern: /\/app\/api\/cron\/.+\/route\.tsx?$/,
    label: "Vercel Cron route",
    keywords: ["cron", "CRON_SECRET", "Vercel cron"],
  },
  {
    pattern: /\/app\/api\/.+\/route\.tsx?$/,
    label: "Next.js API route",
    keywords: ["API route", "route handler", "Zod validation", "auth check"],
  },
  {
    pattern: /\/actions(\.tsx?|\/[^/]+\.tsx?)$/,
    label: "Server Action",
    keywords: ["Server Action", "formData", "revalidatePath"],
  },
  {
    pattern: /\/middleware\.tsx?$/,
    label: "Next.js middleware",
    keywords: ["middleware", "trustHost", "matcher"],
  },
  {
    pattern: /\/proxy\.tsx?$/,
    label: "Routing proxy/middleware",
    keywords: ["proxy", "middleware", "Auth.js trustHost"],
  },
  {
    pattern: /\/auth\.(config\.)?tsx?$/,
    label: "Auth.js configuration",
    keywords: ["Auth.js", "trustHost", "JWT session", "Drizzle adapter"],
  },
  {
    pattern: /\/db\/schema\.tsx?$/,
    label: "Drizzle schema",
    keywords: ["Drizzle", "pgvector", "HNSW", "ANY array literal"],
  },
  {
    pattern: /drizzle\.config\.tsx?$/,
    label: "Drizzle config",
    keywords: ["Drizzle", "drizzle-kit"],
  },
  {
    pattern: /\/lib\/embeddings\.tsx?$/,
    label: "Embeddings pipeline",
    keywords: ["embeddings", "OpenAI text-embedding"],
  },
  // SEO-related surfaces — explicitly carved out so seo-optimizer
  // surfaces automatically when editing them. These are tiny files but
  // the skill is non-obvious.
  {
    pattern: /\/app\/(sitemap|robots|manifest)\.tsx?$/,
    label: "SEO surface (sitemap/robots/manifest)",
    keywords: ["SEO", "sitemap", "robots", "metadata", "Open Graph", "schema.org"],
  },
  // Marketing / landing / brand-led pages — files that buyers see.
  // Catches both the App Router conventions (root page.tsx, (marketing)
  // route group) and common "landing page" naming patterns.
  {
    pattern: /\/app\/\(marketing\)\/.+\.tsx?$/,
    label: "Marketing page (in (marketing) route group)",
    keywords: ["landing page", "marketing site", "design", "hero", "brand", "SEO", "metadata", "Open Graph"],
  },
  {
    pattern: /\/app\/(landing|marketing|home)\/.+\.tsx?$/,
    label: "Marketing/landing page",
    keywords: ["landing page", "marketing site", "design", "hero", "brand", "SEO"],
  },
  {
    pattern: /\/app\/page\.tsx?$/,
    label: "App router root page (likely a homepage / landing)",
    keywords: ["landing page", "marketing site", "hero", "design", "brand", "homepage"],
  },
  {
    pattern: /\/app\/layout\.tsx?$/,
    label: "App router root layout (font, metadata defaults, top nav)",
    keywords: ["font", "metadata", "Open Graph", "metadataBase", "brand"],
  },
];

interface Classification {
  label: string;
  keywords: string[];
}

function classifyFile(filePath: string): Classification | null {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  for (const c of CLASSIFICATIONS) {
    if (c.pattern.test(normalized)) {
      return { label: c.label, keywords: c.keywords };
    }
  }
  return null;
}

interface ProductMatch {
  slug: string;
  name: string;
  description: string;
}

/**
 * Find the product entity whose source_path is an ancestor of the file
 * being edited. Match is longest-prefix-wins so nested workspaces
 * resolve to the most specific product.
 */
async function findProductForPath(filePath: string): Promise<ProductMatch | null> {
  const abs = path.resolve(filePath).toLowerCase().replace(/\\/g, "/");
  const rows = await db.execute<{ slug: string; name: string; description: string; source_path: string }>(sql`
    SELECT slug, name, description, source_path
    FROM ${entities}
    WHERE type = 'product'
      AND source_path IS NOT NULL
      AND lower(replace(source_path, '\\', '/')) = ANY(
        SELECT lower(replace(source_path, '\\', '/'))
        FROM ${entities}
        WHERE type = 'product' AND source_path IS NOT NULL
      )
    ORDER BY length(source_path) DESC
  `);
  for (const r of rows.rows) {
    const sp = r.source_path.toLowerCase().replace(/\\/g, "/").replace(/\/$/, "");
    if (abs === sp || abs.startsWith(`${sp}/`)) {
      return { slug: r.slug, name: r.name, description: r.description };
    }
  }
  return null;
}

interface RelevantEntity {
  slug: string;
  name: string;
  type: string;
  description: string;
}

interface RecommendedSkill {
  slug: string;
  name: string;
  /** First paragraph (trigger description) — what we'll show in context. */
  trigger: string;
}

/**
 * Find entities whose name or description contains any of the keywords.
 * Limited to lessons, decisions, patterns, rules — the entity types
 * that produce actionable just-in-time guidance.
 *
 * Skills are queried separately (see findRelevantSkills) because they
 * render as "consider invoking /<slug>" rather than "here's prior
 * knowledge."
 */
async function findRelevantEntities(
  keywords: string[],
  limit = 4,
): Promise<RelevantEntity[]> {
  if (keywords.length === 0) return [];
  const conditions = keywords
    .map((k) => k.replace(/[%_\\]/g, "\\$&"))
    .map((k) => sql`(${entities.name} ILIKE ${`%${k}%`} OR ${entities.description} ILIKE ${`%${k}%`})`);
  const orChain = conditions.reduce((acc, c, i) => (i === 0 ? c : sql`${acc} OR ${c}`));

  const rows = await db.execute<{ slug: string; name: string; type: string; description: string }>(sql`
    SELECT slug, name, type::text AS type, description
    FROM ${entities}
    WHERE type IN ('lesson', 'decision', 'pattern', 'rule')
      AND (${orChain})
    ORDER BY last_validated_at DESC
    LIMIT ${limit}
  `);
  return rows.rows;
}

/**
 * Find skills whose name or trigger description matches any of the
 * keywords. We surface these separately from entities because the
 * agent's response should be "invoke /<slug>", not "here's prior
 * knowledge."
 *
 * Skill `description` in our entities table holds the trigger text +
 * body separated by "\n\n---\n\n" (see src/lib/skills.ts:ingestSkills).
 * We only need the trigger half for context injection.
 */
async function findRelevantSkills(
  keywords: string[],
  limit = 3,
): Promise<RecommendedSkill[]> {
  if (keywords.length === 0) return [];
  const conditions = keywords
    .map((k) => k.replace(/[%_\\]/g, "\\$&"))
    .map((k) => sql`(${entities.name} ILIKE ${`%${k}%`} OR ${entities.description} ILIKE ${`%${k}%`})`);
  const orChain = conditions.reduce((acc, c, i) => (i === 0 ? c : sql`${acc} OR ${c}`));

  const rows = await db.execute<{ slug: string; name: string; description: string }>(sql`
    SELECT slug, name, description
    FROM ${entities}
    WHERE type = 'skill'
      AND (${orChain})
    ORDER BY last_validated_at DESC
    LIMIT ${limit}
  `);
  return rows.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    trigger: (r.description ?? "").split("\n\n---\n\n")[0]?.trim() ?? "",
  }));
}

export interface FileContext {
  filePath: string;
  product: ProductMatch | null;
  classification: Classification | null;
  relevant: RelevantEntity[];
  skills: RecommendedSkill[];
}

export async function contextForFile(filePath: string): Promise<FileContext> {
  // Cache hit — return immediately, skipping the DB round trips.
  const cached = await readCache(filePath);
  if (cached) return cached;

  const [product, classification] = await Promise.all([
    findProductForPath(filePath),
    Promise.resolve(classifyFile(filePath)),
  ]);
  let result: FileContext;
  if (!classification) {
    result = { filePath, product, classification: null, relevant: [], skills: [] };
  } else {
    const [relevant, skills] = await Promise.all([
      findRelevantEntities(classification.keywords),
      findRelevantSkills(classification.keywords),
    ]);
    result = { filePath, product, classification, relevant, skills };
  }

  // Await the write — the script wrapper calls process.exit(0) after this
  // returns, which would kill any pending detached promise. ~5-10ms cost
  // on the cold path to guarantee the next invocation sees the cache.
  await writeCache(filePath, result);
  return result;
}

/**
 * Render the FileContext as a compact markdown block suitable for
 * injection as PreToolUse additionalContext.
 *
 * Gating: we only emit when there's something *actionable* — either a
 * file-type classification matched OR the brain found relevant entities
 * OR skills. Knowing "you're in product X" alone isn't worth a system
 * reminder because the SessionStart hook already loads product context.
 */
export function renderFileContext(ctx: FileContext): string | null {
  if (!ctx.classification && ctx.relevant.length === 0 && ctx.skills.length === 0) {
    return null;
  }

  const lines: string[] = [];

  if (ctx.product && ctx.classification) {
    lines.push(
      `📚 Roushi context · **${ctx.product.name}** (\`${ctx.product.slug}\`) · ${ctx.classification.label}`,
    );
  } else if (ctx.classification) {
    lines.push(`📚 Roushi context · ${ctx.classification.label}`);
  } else if (ctx.product) {
    lines.push(`📚 Roushi context · **${ctx.product.name}** (\`${ctx.product.slug}\`)`);
  }

  if (ctx.skills.length > 0) {
    lines.push("");
    lines.push("**🛠️ Recommended skills for this file** — consider invoking:");
    for (const s of ctx.skills) {
      lines.push(`- \`/${s.slug}\` — ${s.trigger.slice(0, 200)}${s.trigger.length > 200 ? "…" : ""}`);
    }
  }

  if (ctx.relevant.length > 0) {
    lines.push("");
    lines.push("**Relevant from the brain:**");
    for (const r of ctx.relevant) {
      const snippet = r.description.replace(/\s+/g, " ").slice(0, 180).trim();
      lines.push(`- \`[${r.type}]\` **${r.name}** (\`${r.slug}\`)`);
      if (snippet) lines.push(`    ${snippet}${r.description.length > 180 ? "…" : ""}`);
    }
  }

  lines.push("");
  lines.push(
    "_Query Roushi for more via `mcp__roushi__roushi_search` or `mcp__roushi__roushi_think`._",
  );

  return lines.join("\n");
}
