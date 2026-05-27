// Contradiction detection — finds entity pairs whose content directly
// disagrees. Two-phase:
//
//   1. Use pgvector cosine distance to find pairs of entities (within the
//      same type) whose embeddings are close enough that they COULD be
//      saying contradictory things about the same topic. Far-apart pairs
//      can't meaningfully contradict — they're about different things.
//   2. Ask an LLM judge to decide whether each candidate pair actually
//      contradicts. Returns severity (major | minor) + a one-sentence
//      explanation.
//
// Inspired by gbrain's `eval suspected-contradictions`. Wired into the
// /optimize page and into the cron schedule (weekly) via scanContradictions
// in maintenance.ts.

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";

const JUDGE_MODEL = process.env.ROUSHI_OPENAI_JUDGE_MODEL ?? "gpt-4o-mini";

/** Cosine distance threshold for "close enough to potentially contradict." */
const DEFAULT_DISTANCE_THRESHOLD = 0.25;
/** Hard cap on candidate pairs the judge sees — keeps cost predictable. */
const DEFAULT_MAX_PAIRS = 100;
/** Per-entity description cap — protects the prompt from giant pages. */
const DESC_CAP_CHARS = 1500;
/**
 * Types we audit by default. Rules + decisions are explicit claims; lessons
 * encode operational know-how. Patterns / products are descriptive — pair
 * closeness usually means "related" not "contradicting" — so skip them.
 */
export const DEFAULT_CONTRADICTION_TYPES = ["rule", "decision", "lesson"] as const;
export type ContradictionType = (typeof DEFAULT_CONTRADICTION_TYPES)[number];

export interface ContradictionCandidate {
  a: { id: string; slug: string; name: string; type: string; description: string };
  b: { id: string; slug: string; name: string; type: string; description: string };
  cosineDistance: number;
}

export interface ContradictionFinding {
  pair: { aSlug: string; aName: string; bSlug: string; bName: string; type: string };
  contradicts: boolean;
  severity: "major" | "minor" | "none";
  explanation: string;
  cosineDistance: number;
}

export interface ContradictionScanOptions {
  /** Restrict to these types. Default: rule, decision, lesson. */
  types?: ReadonlyArray<ContradictionType | string>;
  /** Cosine distance ≤ this counts as a candidate pair. Default 0.25. */
  distanceThreshold?: number;
  /** Hard cap on pairs the LLM judges. Default 100. */
  maxPairs?: number;
  /** Override judge model. */
  model?: string;
}

const JudgeSchema = z.object({
  contradicts: z.boolean().describe("True iff the two entities make claims that directly conflict (one says X is true, the other says X is false / the opposite is true / they require incompatible behavior). Mere overlap or different scope is NOT a contradiction."),
  severity: z
    .enum(["major", "minor", "none"])
    .describe(
      "major = the conflict is on a load-bearing claim (architecture, rule that determines behavior, decision that locks a choice). minor = a stylistic, naming, or low-impact disagreement. none = if contradicts is false.",
    ),
  explanation: z
    .string()
    .min(1)
    .describe(
      "One sentence: what specifically conflicts? Quote the contradicting claims (paraphrase OK). If contradicts is false, briefly say why the pair looked similar but doesn't actually conflict.",
    ),
});

/**
 * Find pairs of entities (within each requested type) whose embeddings are
 * cosine-close — semantic candidates for contradiction. Pure SQL, no LLM.
 */
export async function findContradictionCandidates(
  options: ContradictionScanOptions = {},
): Promise<ContradictionCandidate[]> {
  const types = options.types ?? DEFAULT_CONTRADICTION_TYPES;
  const distance = options.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;
  const maxPairs = options.maxPairs ?? DEFAULT_MAX_PAIRS;
  const typeLiteral = `{${types.map((t) => `"${t}"`).join(",")}}`;

  // Self-join via pgvector cosine distance (<=> operator). a.id < b.id to
  // get each unordered pair once. Filter to small distance to keep the
  // result set bounded — most pairs are unrelated.
  const rows = await db.execute<{
    a_id: string;
    a_slug: string;
    a_name: string;
    a_type: string;
    a_description: string;
    b_id: string;
    b_slug: string;
    b_name: string;
    b_type: string;
    b_description: string;
    cosine_distance: number;
  }>(sql`
    SELECT
      a.id   AS a_id,   a.slug AS a_slug, a.name AS a_name,
      a.type::text AS a_type, a.description AS a_description,
      b.id   AS b_id,   b.slug AS b_slug, b.name AS b_name,
      b.type::text AS b_type, b.description AS b_description,
      (a.embedding <=> b.embedding) AS cosine_distance
    FROM entities a
    JOIN entities b
      ON a.id < b.id
     AND a.type = b.type
    WHERE a.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND a.type::text = ANY(${typeLiteral}::text[])
      AND (a.embedding <=> b.embedding) <= ${distance}
    ORDER BY cosine_distance ASC
    LIMIT ${maxPairs}
  `);

  return rows.rows.map((r) => ({
    a: {
      id: r.a_id,
      slug: r.a_slug,
      name: r.a_name,
      type: r.a_type,
      description: (r.a_description ?? "").slice(0, DESC_CAP_CHARS),
    },
    b: {
      id: r.b_id,
      slug: r.b_slug,
      name: r.b_name,
      type: r.b_type,
      description: (r.b_description ?? "").slice(0, DESC_CAP_CHARS),
    },
    cosineDistance: Number(r.cosine_distance),
  }));
}

/**
 * Ask an LLM whether two specific entities contradict. One pair, one call.
 */
export async function judgePair(
  candidate: ContradictionCandidate,
  model = JUDGE_MODEL,
): Promise<ContradictionFinding> {
  const prompt = `You are auditing a knowledge brain for contradictions. Two entities below were retrieved as semantically close (cosine distance ${candidate.cosineDistance.toFixed(3)}) — close enough that they might be making contradictory claims about the same topic.

Your job: decide whether they actually CONTRADICT. Most close pairs don't — they're often complementary, or talking about the same thing from different angles, or one is a generalization of the other. A contradiction means one entity asserts a claim the other denies, OR they prescribe incompatible behavior.

ENTITY A: [${candidate.a.type}] ${candidate.a.name} (slug: ${candidate.a.slug})
${candidate.a.description}

---

ENTITY B: [${candidate.b.type}] ${candidate.b.name} (slug: ${candidate.b.slug})
${candidate.b.description}

---

Return JSON matching the schema. Be conservative — if you're unsure, lean false. Spurious contradiction flags create noise and erode trust.`;

  const { object } = await generateObject({
    model: openai(model),
    schema: JudgeSchema,
    prompt,
    temperature: 0.1,
  });

  return {
    pair: {
      aSlug: candidate.a.slug,
      aName: candidate.a.name,
      bSlug: candidate.b.slug,
      bName: candidate.b.name,
      type: candidate.a.type,
    },
    contradicts: object.contradicts,
    severity: object.severity,
    explanation: object.explanation,
    cosineDistance: candidate.cosineDistance,
  };
}

export interface ContradictionScanResult {
  candidatesEvaluated: number;
  findings: ContradictionFinding[];
  /** Just the findings where contradicts === true, sorted major→minor. */
  contradictions: ContradictionFinding[];
}

/**
 * End-to-end scan: find candidates, judge each, return all findings +
 * the subset that are actual contradictions.
 */
export async function runContradictionScan(
  options: ContradictionScanOptions = {},
): Promise<ContradictionScanResult> {
  const candidates = await findContradictionCandidates(options);
  if (candidates.length === 0) {
    return { candidatesEvaluated: 0, findings: [], contradictions: [] };
  }

  // Sequential — could parallelize but the cost is mostly bounded by
  // maxPairs (100) × a small-model call, ~$0.01 worst case.
  const findings: ContradictionFinding[] = [];
  for (const c of candidates) {
    try {
      findings.push(await judgePair(c, options.model));
    } catch (err) {
      // One bad judge shouldn't tank the scan — record + move on.
      findings.push({
        pair: {
          aSlug: c.a.slug,
          aName: c.a.name,
          bSlug: c.b.slug,
          bName: c.b.name,
          type: c.a.type,
        },
        contradicts: false,
        severity: "none",
        explanation: `judge failed: ${err instanceof Error ? err.message : String(err)}`,
        cosineDistance: c.cosineDistance,
      });
    }
  }

  const contradictions = findings
    .filter((f) => f.contradicts)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return {
    candidatesEvaluated: candidates.length,
    findings,
    contradictions,
  };
}

function severityRank(s: ContradictionFinding["severity"]): number {
  switch (s) {
    case "major":
      return 2;
    case "minor":
      return 1;
    case "none":
      return 0;
  }
}
