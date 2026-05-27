// Retrieval evals — capture real queries against the brain and replay
// them after code changes. Pure recall/precision-at-K against an
// expected-slugs baseline. No LLM, no judge — just "did the entities
// we expected still come back in the top K."
//
// Inspired by gbrain's `gbrain eval export/replay` pattern. Keep it
// minimal: queries live in `evals/queries.json` so they're versioned in
// git, easy to read, easy to hand-edit when adding a new expectation.

import { promises as fs } from "node:fs";
import path from "node:path";
import { hybridSearch, type SearchOptions } from "./search";

export interface EvalQuery {
  /** Short identifier, shown in replay output. */
  name: string;
  /** Natural-language query passed to hybridSearch. */
  query: string;
  /** Slugs that should appear in the top K hits. Order doesn't matter. */
  expected: string[];
  /** Free-form why-this-matters notes for humans. Not used by the runner. */
  notes?: string;
}

export interface EvalResultPerQuery {
  name: string;
  query: string;
  expected: string[];
  actual: string[];
  recallAtK: number;
  precisionAtK: number;
  missingFromTopK: string[];
  /** Optional surprises — slugs that ranked top-K but weren't expected. */
  unexpectedInTopK: string[];
  /** Helps spot regressions: which expected slugs ranked WORSE than position K. */
  expectedRankedBelowK: Array<{ slug: string; rank: number | null }>;
}

export interface EvalSummary {
  k: number;
  totalQueries: number;
  avgRecall: number;
  avgPrecision: number;
  perQuery: EvalResultPerQuery[];
  failingQueries: EvalResultPerQuery[];
  generatedAt: string;
}

const DEFAULT_QUERIES_PATH = "evals/queries.json";
const DEFAULT_K = 5;
/** Pull more than K so we can report where expected hits ranked if outside top K. */
const PROBE_LIMIT = 25;

export async function loadEvalQueries(filePath = DEFAULT_QUERIES_PATH): Promise<EvalQuery[]> {
  const absPath = path.resolve(filePath);
  const raw = await fs.readFile(absPath, "utf-8");
  const parsed = JSON.parse(raw) as EvalQuery[];
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array at ${absPath}, got ${typeof parsed}`);
  }
  return parsed;
}

export async function saveEvalQueries(
  queries: EvalQuery[],
  filePath = DEFAULT_QUERIES_PATH,
): Promise<void> {
  const absPath = path.resolve(filePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, JSON.stringify(queries, null, 2) + "\n", "utf-8");
}

/**
 * Run hybridSearch against `query.query`, take top `k` slugs, compute
 * recall@K (how many expected slugs appear in the top K) and precision@K
 * (how many top-K slugs are in the expected set). Pass searchOverrides
 * (e.g. `{ rerank: true }`) to A/B retrieval configurations.
 */
export async function runOneEval(
  query: EvalQuery,
  k = DEFAULT_K,
  searchOverrides: Partial<SearchOptions> = {},
): Promise<EvalResultPerQuery> {
  const hits = await hybridSearch(query.query, { limit: PROBE_LIMIT, ...searchOverrides });
  const actualSlugsAll = hits.map((h) => h.entity.slug);
  const actualTopK = actualSlugsAll.slice(0, k);
  const expectedSet = new Set(query.expected);
  const actualSet = new Set(actualTopK);

  const matched = query.expected.filter((s) => actualSet.has(s));
  const recallAtK = query.expected.length === 0 ? 1 : matched.length / query.expected.length;
  const precisionAtK = actualTopK.length === 0 ? 0 : matched.length / actualTopK.length;

  const missingFromTopK = query.expected.filter((s) => !actualSet.has(s));
  const unexpectedInTopK = actualTopK.filter((s) => !expectedSet.has(s));
  const expectedRankedBelowK = missingFromTopK.map((slug) => {
    const idx = actualSlugsAll.indexOf(slug);
    return { slug, rank: idx === -1 ? null : idx + 1 };
  });

  return {
    name: query.name,
    query: query.query,
    expected: query.expected,
    actual: actualTopK,
    recallAtK,
    precisionAtK,
    missingFromTopK,
    unexpectedInTopK,
    expectedRankedBelowK,
  };
}

export async function runAllEvals(
  filePath = DEFAULT_QUERIES_PATH,
  k = DEFAULT_K,
  searchOverrides: Partial<SearchOptions> = {},
): Promise<EvalSummary> {
  const queries = await loadEvalQueries(filePath);
  const perQuery: EvalResultPerQuery[] = [];
  for (const q of queries) {
    perQuery.push(await runOneEval(q, k, searchOverrides));
  }
  const totalQueries = perQuery.length;
  const avgRecall =
    totalQueries === 0 ? 0 : perQuery.reduce((s, r) => s + r.recallAtK, 0) / totalQueries;
  const avgPrecision =
    totalQueries === 0 ? 0 : perQuery.reduce((s, r) => s + r.precisionAtK, 0) / totalQueries;
  // A query "fails" if any expected slug is missing from top-K.
  const failingQueries = perQuery.filter((r) => r.missingFromTopK.length > 0);
  return {
    k,
    totalQueries,
    avgRecall,
    avgPrecision,
    perQuery,
    failingQueries,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build an eval query from a live search — useful for `roushi eval capture`.
 * Runs the query against the current code and seeds the expected list with
 * the current top-K slugs. The human is meant to review/prune the result
 * before saving (it's a baseline, not an oracle).
 */
export async function captureEvalQuery(
  name: string,
  query: string,
  k = DEFAULT_K,
  notes?: string,
): Promise<EvalQuery> {
  const hits = await hybridSearch(query, { limit: k });
  return {
    name,
    query,
    expected: hits.map((h) => h.entity.slug),
    ...(notes ? { notes } : {}),
  };
}
