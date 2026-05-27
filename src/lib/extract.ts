// LLM-based extraction — turn a freeform product description into typed
// sub-entities (tech, vendor, decision, pattern, lesson) and the edges from
// the source product to each.
//
// Uses OpenAI gpt-4o-mini via Vercel AI SDK's generateObject for structured
// output. Slugs from an "existing entities" hint list are reused when
// applicable so the same tech (e.g. "drizzle-orm") doesn't get spelled five
// different ways across products.

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const EXTRACTION_MODEL = process.env.ROUSHI_OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini";

export const EXTRACTABLE_TYPES = ["tech", "vendor", "decision", "pattern", "lesson"] as const;
export type ExtractableType = (typeof EXTRACTABLE_TYPES)[number];

export const EXTRACTABLE_RELATIONS = [
  "uses",
  "hosted_on",
  "applies_to",
  "led_to",
  "defined_by",
  "depends_on",
  "mentions",
] as const;
export type ExtractableRelation = (typeof EXTRACTABLE_RELATIONS)[number];

const ExtractedEntitySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "kebab-case ascii only")
    .describe("kebab-case unique slug (e.g. 'drizzle-orm', 'cloudflare-r2', 'hash-chained-audit')"),
  type: z.enum(EXTRACTABLE_TYPES),
  name: z.string().min(1).max(120).describe("Human-readable name"),
  description: z.string().min(1).max(500).describe("1-3 sentence description from the source text"),
});

const ExtractedEdgeSchema = z.object({
  toSlug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .describe("Target slug — must match a slug in this batch's entities OR an existing slug"),
  relation: z.enum(EXTRACTABLE_RELATIONS),
  context: z
    .string()
    .max(200)
    .nullable()
    .describe("Short snippet supporting this edge, or null"),
});

const ExtractionResultSchema = z.object({
  entities: z.array(ExtractedEntitySchema).max(50),
  edges: z.array(ExtractedEdgeSchema).max(80),
});

export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;
export type ExtractedEdge = z.infer<typeof ExtractedEdgeSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export interface ExtractInput {
  /** The slug of the entity we're extracting FROM (e.g. the product). All extracted edges originate from this. */
  sourceSlug: string;
  sourceName: string;
  sourceText: string;
  /** Existing slugs the LLM should reuse when appropriate (avoids "drizzle-orm" vs "drizzle" duplicates). */
  existingSlugs?: string[];
}

const SYSTEM_PROMPT = `You are extracting structured knowledge from a product description for a knowledge graph.

For each call, extract:
1. **tech**: databases, frameworks, libraries, languages (e.g. "drizzle-orm", "neon-postgres", "react", "tailwindcss")
2. **vendor**: hosting providers, paid services, platforms (e.g. "vercel", "cloudflare-r2", "stripe", "openai-platform")
3. **decision**: explicit architectural decisions with reasoning (e.g. "neon-over-mongodb", "github-oauth-not-magic-links")
4. **pattern**: reusable architectural patterns (e.g. "hash-chained-audit", "hybrid-search-rrf", "two-phase-ingest")
5. **lesson**: painful gotchas / things learned the hard way (e.g. "drizzle-strict-breaks-non-tty")

For each extracted entity, also emit an edge from the source to that entity:
- source --uses--> tech
- source --hosted_on--> vendor
- source --led_to--> decision
- source --defined_by--> pattern (or applies_to for cross-cutting)
- source --depends_on--> lesson (or mentions for soft references)

RULES:
- Use the existing slugs list when the same concept appears — reuse "drizzle-orm" rather than coining "drizzle".
- Be conservative — only extract things EXPLICITLY mentioned in the source text. Do not invent or infer.
- Slugs are lowercase kebab-case, max 64 chars, [a-z0-9-] only.
- Skip generic words ("api", "database", "frontend") that aren't products or named things.
- Skip the source entity itself.
- Names are human-readable ("Drizzle ORM" not "drizzle-orm").
- Descriptions are 1-3 sentences quoting or paraphrasing the source — no fabrication.
- Cap at ~15-25 entities per call. Quality over quantity.`;

export async function extractEntities(input: ExtractInput): Promise<ExtractionResult> {
  const userPrompt = buildUserPrompt(input);

  const { object } = await generateObject({
    model: openai(EXTRACTION_MODEL),
    schema: ExtractionResultSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  // Post-filter: drop self-edges and any edge whose toSlug doesn't resolve to
  // either an extracted entity OR an existingSlug. (LLM occasionally invents
  // a slug for the to-side that doesn't appear in entities[]; we drop those.)
  const validToSlugs = new Set<string>([
    ...object.entities.map((e) => e.slug),
    ...(input.existingSlugs ?? []),
  ]);

  const filteredEdges = object.edges.filter((e) => {
    if (e.toSlug === input.sourceSlug) return false;
    return validToSlugs.has(e.toSlug);
  });

  return {
    entities: object.entities,
    edges: filteredEdges,
  };
}

function buildUserPrompt(input: ExtractInput): string {
  const lines = [
    `Source entity: ${input.sourceSlug} ("${input.sourceName}")`,
    "",
    "Source text:",
    input.sourceText,
  ];

  if (input.existingSlugs && input.existingSlugs.length > 0) {
    lines.push("", "Existing slugs you can reference (reuse when appropriate):");
    lines.push(input.existingSlugs.sort().join(", "));
  }

  lines.push("", `Extract entities and edges that connect from "${input.sourceSlug}" to each.`);
  return lines.join("\n");
}
