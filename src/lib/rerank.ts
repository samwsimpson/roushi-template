// LLM-based reranker — opt-in stage after RRF that asks an LLM to
// re-score the candidate set by query-relevance. We use gpt-4o-mini
// because it's cheap (~$0.0005/query) and uses the OpenAI key we
// already have wired. Designed to be feature-flagged via env so we
// can swap in a dedicated reranker (ZeroEntropy, Voyage, Cohere)
// later without touching call sites.
//
// The reranker doesn't replace RRF — it operates ON RRF's candidate
// pool. RRF gives us a wide net pulled from both keyword and vector;
// the reranker re-orders the top of that net using the query's
// actual semantics. For terms RRF can't disambiguate (e.g. "akiko
// memory" pulls hits about both Akiko-the-product and Claude-Code-
// memory-files), the reranker is what picks the right ones.

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import type { SearchHit } from "./search";

const RERANK_MODEL = process.env.ROUSHI_OPENAI_RERANK_MODEL ?? "gpt-4o-mini";
// Bumped from 600 → 1500 after v0.7.1 A/B showed the LLM was missing
// connections that lived past the first paragraph of a description (e.g.
// the next-vercel-type-module lesson opens with the symptom and only
// later mentions auth.js as the discovery context).
const DEFAULT_DESC_CAP = 1500;

// NB: OpenAI structured output requires every property to be in `required`,
// so we don't use .optional() here. The LLM can return an empty string for
// `notes` if it has nothing to say.
const RerankSchema = z.object({
  ranking: z
    .array(z.number().int().min(1))
    .describe(
      "1-indexed candidate numbers in the new order — most relevant first. Each candidate from the input must appear exactly once. Length must equal the input candidate count.",
    ),
  notes: z
    .string()
    .describe(
      "1-sentence rationale on the top-1 pick (empty string OK if it's obvious). Surfaces in --explain output.",
    ),
});

export interface RerankOptions {
  /** Override the reranker model (defaults to gpt-4o-mini / env override). */
  model?: string;
  /** Truncate each candidate's description to this many chars before sending. */
  descriptionCap?: number;
  /**
   * If true, missing or malformed ranking from the LLM is allowed —
   * we fall back to the original RRF order. Default true (resilient).
   * Set false in tests where you want to surface judge errors.
   */
  failSoft?: boolean;
}

export interface RerankedHit extends SearchHit {
  /** New rank after rerank (1-indexed). */
  rerankedRank: number;
  /** Original RRF rank (1-indexed) — useful to see how much the reranker moved things. */
  originalRank: number;
}

/**
 * Re-order `hits` by LLM-judged relevance to `query`. Hits with no
 * description are kept at their original RRF position to avoid asking the
 * LLM to guess. If the LLM call fails or returns malformed output,
 * returns the original order (failSoft default).
 */
export async function rerankWithLLM(
  query: string,
  hits: SearchHit[],
  options: RerankOptions = {},
): Promise<RerankedHit[]> {
  const failSoft = options.failSoft ?? true;
  if (hits.length === 0) return [];
  if (hits.length === 1) {
    return hits.map((h) => ({ ...h, rerankedRank: 1, originalRank: 1 }));
  }

  const cap = options.descriptionCap ?? DEFAULT_DESC_CAP;
  const model = options.model ?? RERANK_MODEL;

  const candidates = hits.map((h, i) => {
    const desc = (h.entity.description ?? "").slice(0, cap).replace(/\s+/g, " ").trim();
    return `[${i + 1}] (${h.entity.type}) ${h.entity.name} — slug: ${h.entity.slug}\n    ${desc || "(no description)"}`;
  });

  const prompt = `You are re-ranking ${hits.length} candidate entities by their relevance to a search query about an engineering knowledge base. The candidates were pulled by hybrid retrieval (vector + keyword); your job is to re-order so the most useful answer is first.

QUERY: ${query}

CANDIDATES:
${candidates.join("\n\n")}

How to judge relevance:
- The user wants an ANSWER, not just topic adjacency. The top hit should be the entity whose content most directly addresses the query.
- Type (tech / vendor / product / lesson / decision / rule / pattern) is NOT a tie-breaker. Promote whatever entity is on-topic. A lesson is great IF it's about the query topic; a tech entity is great IF it's the subject the query is asking about. Don't reward a lesson entity for being a lesson when its content is about a different topic.
- Read each candidate's WHOLE description before deciding. The connection to the query is often in the second paragraph or in a "Why" / "How to apply" section — not the opening line. A lesson about ESM and Vercel functions can still be the answer to a query about Auth.js edge runtime if the lesson explains that they're the same underlying problem.
- Demote candidates that only share surface vocabulary with the query when more on-topic candidates exist.
- Demote candidates that mention the query terms only in passing or as context for a different topic.
- If two candidates are genuinely equivalent for this query, keep them in their original order.

Return JSON: "ranking" is the candidate numbers (1-indexed) in your preferred order, most relevant first. Every candidate must appear exactly once.`;

  try {
    const { object } = await generateObject({
      model: openai(model),
      schema: RerankSchema,
      prompt,
      temperature: 0,
    });

    const ranking = validateRanking(object.ranking, hits.length);
    if (!ranking) {
      if (!failSoft) {
        throw new Error(
          `rerankWithLLM: LLM returned malformed ranking (length=${object.ranking.length} expected ${hits.length})`,
        );
      }
      return identityOrder(hits);
    }

    return ranking.map((origIdx, newPos) => {
      const hit = hits[origIdx - 1]!;
      return { ...hit, rerankedRank: newPos + 1, originalRank: origIdx };
    });
  } catch (err) {
    if (!failSoft) throw err;
    console.error(
      `[rerank] LLM rerank failed — keeping RRF order. err=${err instanceof Error ? err.message : String(err)}`,
    );
    return identityOrder(hits);
  }
}

function identityOrder(hits: SearchHit[]): RerankedHit[] {
  return hits.map((h, i) => ({ ...h, rerankedRank: i + 1, originalRank: i + 1 }));
}

/**
 * Sanity-check the LLM's ranking: every original index appears exactly once,
 * length matches, all in range. Returns null on any violation.
 */
function validateRanking(ranking: number[], expectedLength: number): number[] | null {
  if (ranking.length !== expectedLength) return null;
  const seen = new Set<number>();
  for (const n of ranking) {
    if (!Number.isInteger(n) || n < 1 || n > expectedLength) return null;
    if (seen.has(n)) return null;
    seen.add(n);
  }
  return ranking;
}
