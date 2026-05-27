// Synthesis layer — "ask the master."
//
// `think(query)` runs hybrid search, takes the top hits, and asks an LLM
// to compose an answer with inline citations to source entity slugs PLUS
// an explicit gap analysis ("what the brain doesn't know yet"). This is
// the difference between search (here are 10 chunks) and a brain (here
// is the answer + here's what would make it more complete).
//
// Inspired by gbrain's `gbrain think` command.

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { hybridSearch, type SearchHit } from "./search";

const SYNTHESIS_MODEL = process.env.ROUSHI_OPENAI_SYNTHESIS_MODEL ?? "gpt-4o";
const DEFAULT_RETRIEVAL_LIMIT = 12;
const DESCRIPTION_CAP_CHARS = 1200;

const AnswerSchema = z.object({
  answer: z
    .string()
    .min(1)
    .describe(
      "The synthesized answer to the question, using ONLY facts present in the retrieved entities. Cite source entities inline using [slug] format. Each major claim should have a citation. If retrieval has nothing relevant, say so honestly here.",
    ),
  citations: z
    .array(
      z.object({
        slug: z.string().describe("Entity slug cited in the answer"),
        why: z.string().describe("One short sentence on why this entity was cited"),
      }),
    )
    .describe("List of entities actually cited in the answer. Every slug here must appear in [slug] format somewhere in `answer`."),
  gaps: z
    .array(z.string())
    .describe(
      "1-4 specific things the brain doesn't know that would make the answer more complete, current, or contradiction-free. Be honest — empty array if the answer is genuinely complete. Examples: 'No entity describes the deployment topology', 'Most recent entry is from 2026-05-01; may be stale', 'Two entities conflict on whether X uses Y'.",
    ),
});

export type ThinkAnswer = z.infer<typeof AnswerSchema>;

export interface ThinkResult {
  query: string;
  hits: SearchHit[];
  answer: ThinkAnswer;
  modelUsed: string;
}

export interface ThinkOptions {
  /** How many hits to ground the synthesis on. Default 12. */
  retrievalLimit?: number;
  /** Override the synthesis model. Default gpt-4o (env: ROUSHI_OPENAI_SYNTHESIS_MODEL). */
  model?: string;
}

export async function think(query: string, options: ThinkOptions = {}): Promise<ThinkResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      query: trimmed,
      hits: [],
      answer: { answer: "(empty query)", citations: [], gaps: [] },
      modelUsed: "(none)",
    };
  }

  const limit = options.retrievalLimit ?? DEFAULT_RETRIEVAL_LIMIT;
  const hits = await hybridSearch(trimmed, { limit });

  if (hits.length === 0) {
    return {
      query: trimmed,
      hits: [],
      answer: {
        answer:
          "Nothing in the brain matches that query. Either the topic isn't ingested yet, or the wording is too different from what's stored. Try a different phrasing, or add the relevant project/document via `pnpm roushi add-project` or `pnpm roushi ingest`.",
        citations: [],
        gaps: ["The brain has no entities matching this query."],
      },
      modelUsed: "(no retrieval)",
    };
  }

  const model = options.model ?? SYNTHESIS_MODEL;
  const corpus = formatHitsForPrompt(hits);
  const prompt = buildPrompt(trimmed, corpus);

  const { object } = await generateObject({
    model: openai(model),
    schema: AnswerSchema,
    prompt,
    temperature: 0.2,
  });

  return {
    query: trimmed,
    hits,
    answer: object,
    modelUsed: model,
  };
}

function formatHitsForPrompt(hits: SearchHit[]): string {
  return hits
    .map((h, i) => {
      const desc = (h.entity.description ?? "").slice(0, DESCRIPTION_CAP_CHARS);
      return `[${i + 1}] [${h.entity.type}] ${h.entity.name} (slug: ${h.entity.slug})\n    score=${h.score.toFixed(4)} source=${h.source}\n    ${desc.replace(/\n/g, "\n    ")}`;
    })
    .join("\n\n");
}

function buildPrompt(query: string, corpus: string): string {
  return `You are the Roushi brain answering a question from a portfolio operator. Use ONLY the facts in the retrieved entities below — do not invent details, do not draw on general world knowledge, do not speculate. Every claim in your answer must trace back to a retrieved entity.

QUESTION:
${query}

RETRIEVED ENTITIES (top hits from hybrid search across the brain):
${corpus}

YOUR TASK:
1. Compose a clear, direct answer to the question. Cite source entities inline using [slug] format (e.g. "Kodori uses [drizzle-orm] for its database layer and [inngest] for durable workflows"). Every major claim needs a citation.
2. Identify 1-4 specific gaps — things the brain doesn't know that would make the answer more complete, current, or trustworthy. Be honest. Empty gaps list is fine if the answer is genuinely complete. Examples of useful gaps: "no entity describes the current deployment region," "most recent entity touched 2026-05-01 — may be stale," "two entities conflict on whether X depends on Y."

STYLE:
- Direct and concrete. Skip throat-clearing.
- If retrieval is thin or off-topic, say so in the answer rather than padding.
- Citations are slugs in square brackets, not numbered references.`;
}
