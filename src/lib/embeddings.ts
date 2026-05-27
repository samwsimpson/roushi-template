// OpenAI text-embedding-3-small (1536 dims).
// Roushi uses OpenAI directly for embeddings (the AI Gateway env is for LLM calls).
// Dimensions must match the `vector(1536)` column in `entities.embedding`.

import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

const EMBEDDING_MODEL = process.env.ROUSHI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export const EMBEDDING_DIMENSIONS = Number(
  process.env.ROUSHI_EMBEDDING_DIMENSIONS ?? "1536",
);

const model = openai.embedding(EMBEDDING_MODEL);

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("embedText: refusing to embed empty string");
  }
  const { embedding } = await embed({ model, value: trimmed });
  return embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const cleaned = texts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleaned.length === 0) return [];
  const { embeddings } = await embedMany({ model, values: cleaned });
  return embeddings;
}
