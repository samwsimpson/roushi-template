// Hybrid search: HNSW cosine-similarity vector search + tsvector keyword search,
// fused with Reciprocal Rank Fusion (RRF). RRF is parameter-free w.r.t. score
// distributions, which matters because vector cosine distances and ts_rank
// values are on completely different scales.
//
// RRF formula: score(e) = Σ over rankings r: 1 / (k + rank(e, r))
//   - k controls how much later ranks are punished (60 is the canonical default)
//   - rank is 1-indexed

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Entity } from "../db/schema";
import { entities } from "../db/schema";
import { embedText } from "./embeddings";
import { rerankWithLLM } from "./rerank";

const DEFAULT_LIMIT = 10;
const DEFAULT_RRF_K = 60;
// Pull this many candidates from each ranker before fusion. Wider than the
// final limit so RRF has overlap to work with.
const CANDIDATE_POOL = 50;
/**
 * When rerank is enabled, we hand this many top-RRF candidates to the LLM
 * for re-ordering before slicing to the final limit. Wider than the
 * caller's limit so the reranker has room to promote things.
 */
const RERANK_POOL = 20;

export interface SearchOptions {
  limit?: number;
  /** RRF constant — higher values reduce the impact of high ranks. Default 60. */
  rrfK?: number;
  /**
   * If true, run an LLM rerank stage after RRF. Adds ~1-2s + ~$0.0005 per
   * search. Default false (opt-in). Callers that already pass results to
   * an LLM (`think`) shouldn't enable this — it's redundant.
   */
  rerank?: boolean;
}

export interface SearchHit {
  entity: Entity;
  score: number;
  source: "vector" | "keyword" | "both";
  /**
   * Per-stage attribution, populated by `hybridSearchWithExplain`. Plain
   * `hybridSearch` leaves these undefined to keep the call shape narrow.
   */
  explain?: {
    vectorRank: number | null;
    keywordRank: number | null;
    vectorContribution: number;
    keywordContribution: number;
    rrfK: number;
  };
}

export async function hybridSearch(
  query: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  return runSearch(query, options, false);
}

/**
 * Same as hybridSearch but every hit carries an `explain` field with
 * per-stage attribution: where it ranked in vector + keyword retrieval,
 * what each ranker contributed to the fused score, and the RRF k that
 * was applied. Use this when debugging why a hit ranked where it did.
 */
export async function hybridSearchWithExplain(
  query: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  return runSearch(query, options, true);
}

async function runSearch(
  query: string,
  options: SearchOptions,
  explain: boolean,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? DEFAULT_LIMIT;
  const k = options.rrfK ?? DEFAULT_RRF_K;
  const rerank = options.rerank === true;
  // When reranking, materialize a wider pool so the reranker has room to
  // promote a hit from rank-15 into top-5. After rerank we slice back to limit.
  const fetchLimit = rerank ? Math.max(limit, RERANK_POOL) : limit;

  const embedding = await embedText(trimmed);
  const embeddingLiteral = `[${embedding.join(",")}]`;

  const [vectorRes, keywordRes] = await Promise.all([
    db.execute<{ id: string; rank: number }>(sql`
      SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> ${embeddingLiteral}::vector) AS rank
      FROM ${entities}
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingLiteral}::vector
      LIMIT ${CANDIDATE_POOL}
    `),
    db.execute<{ id: string; rank: number }>(sql`
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${trimmed})) DESC
      ) AS rank
      FROM ${entities}
      WHERE search_vector @@ plainto_tsquery('english', ${trimmed})
      LIMIT ${CANDIDATE_POOL}
    `),
  ]);

  const vectorRanks = new Map<string, number>();
  for (const row of vectorRes.rows) vectorRanks.set(row.id, Number(row.rank));

  const keywordRanks = new Map<string, number>();
  for (const row of keywordRes.rows) keywordRanks.set(row.id, Number(row.rank));

  const allIds = new Set<string>([...vectorRanks.keys(), ...keywordRanks.keys()]);
  if (allIds.size === 0) return [];

  interface FusedRow {
    id: string;
    score: number;
    source: SearchHit["source"];
    vRank: number | null;
    kRank: number | null;
    vContrib: number;
    kContrib: number;
  }

  const fused: FusedRow[] = [];
  for (const id of allIds) {
    const vRank = vectorRanks.get(id);
    const kRank = keywordRanks.get(id);
    const vContrib = vRank !== undefined ? 1 / (k + vRank) : 0;
    const kContrib = kRank !== undefined ? 1 / (k + kRank) : 0;
    const score = vContrib + kContrib;
    const source: SearchHit["source"] =
      vRank !== undefined && kRank !== undefined
        ? "both"
        : vRank !== undefined
          ? "vector"
          : "keyword";
    fused.push({
      id,
      score,
      source,
      vRank: vRank ?? null,
      kRank: kRank ?? null,
      vContrib,
      kContrib,
    });
  }

  fused.sort((a, b) => b.score - a.score);
  const topIds = fused.slice(0, fetchLimit).map((h) => h.id);
  if (topIds.length === 0) return [];

  const topIdsLiteral = `{${topIds.join(",")}}`;
  const res = await db.execute<Entity>(sql`
    SELECT * FROM ${entities} WHERE id = ANY(${topIdsLiteral}::uuid[])
  `);

  const byId = new Map<string, Entity>();
  for (const row of res.rows) byId.set(row.id, row);

  const hits: SearchHit[] = [];
  for (const f of fused.slice(0, fetchLimit)) {
    const entity = byId.get(f.id);
    if (!entity) continue;
    const hit: SearchHit = { entity, score: f.score, source: f.source };
    if (explain) {
      hit.explain = {
        vectorRank: f.vRank,
        keywordRank: f.kRank,
        vectorContribution: f.vContrib,
        keywordContribution: f.kContrib,
        rrfK: k,
      };
    }
    hits.push(hit);
  }

  if (!rerank) return hits;

  // LLM rerank stage. Operates on the wider pool then slices to limit.
  // Failures fall back to RRF order (rerankWithLLM is failSoft by default).
  const reranked = await rerankWithLLM(trimmed, hits);
  return reranked.slice(0, limit);
}
