// Pattern registry — single source of truth for all available patterns.
// Each pattern is explicitly imported here so static bundling works
// (CLI ships as a tsx-run script, no dynamic FS scanning at runtime).
//
// To add a new pattern:
//   1. Create src/patterns/<slug>.ts exporting `pattern: Pattern`
//   2. Add the import + entry below
//   3. The CLI auto-picks it up

import type { Pattern } from "./_types.js";
import { isPattern } from "./_types.js";

// ─── Pattern imports ──────────────────────────────────────
import { pattern as kumokodoFooter } from "./kumokodo-footer.js";
import { pattern as vercelAnalytics } from "./vercel-analytics.js";
import { pattern as googleAnalytics } from "./google-analytics.js";

const ALL: Pattern[] = [kumokodoFooter, vercelAnalytics, googleAnalytics];

// ─── Validation at load time ──────────────────────────────
// Catches typos in pattern definitions before the CLI ships them.
for (const p of ALL) {
  if (!isPattern(p)) {
    throw new Error(
      `Invalid pattern export — failed shape check: ${JSON.stringify(p).slice(0, 200)}`,
    );
  }
}

// ─── Catch duplicate slugs ─────────────────────────────────
{
  const seen = new Set<string>();
  for (const p of ALL) {
    if (seen.has(p.slug)) {
      throw new Error(`Duplicate pattern slug: ${p.slug}`);
    }
    seen.add(p.slug);
  }
}

export function listPatterns(): Pattern[] {
  return ALL.slice();
}

export function getPattern(slug: string): Pattern | null {
  return ALL.find((p) => p.slug === slug) ?? null;
}
