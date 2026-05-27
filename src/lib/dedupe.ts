// Fuzzy-merge near-duplicate entity slugs.
//
// Detection runs two signals in parallel:
//   1. String similarity — normalized Levenshtein over slug + name
//   2. Embedding similarity — pgvector cosine distance, when both have embeddings
//
// findDuplicateGroups() returns clusters of entities that are likely the same
// concept under different slugs (e.g. "kumokodo" vs "kumikodo", "drizzle-orm"
// vs "drizzle"). The caller picks a canonical and calls mergeEntities() to
// re-point all edges from the duplicate to the canonical and delete the duplicate.

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Entity } from "../db/schema";
import { edges, entities } from "../db/schema";

// Tunables — keep the bar high to avoid false positives. Users see noise faster
// than they see misses, and merging is destructive.
const STRING_SIM_THRESHOLD = 0.82;
const EMBEDDING_DIST_THRESHOLD = 0.12; // cosine distance; lower = more similar

export interface DuplicateCandidate {
  entity: { id: string; slug: string; name: string; type: string };
  stringSimilarity: number; // 0–1, 1 = identical
  embeddingDistance: number | null; // null if either entity has no embedding
  /** Aggregate score 0–1. Higher = more likely the same thing. */
  confidence: number;
}

export interface DuplicateGroup {
  canonical: { id: string; slug: string; name: string; type: string };
  candidates: DuplicateCandidate[];
}

interface EntityRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  hasEmbedding: boolean;
}

export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  // Pull all entities with light metadata, not embeddings — we'll fetch
  // distances via SQL for pairs we care about.
  const rows = await db.execute<EntityRow & Record<string, unknown>>(sql`
    SELECT id, slug, name, type::text AS type, (embedding IS NOT NULL) AS "hasEmbedding"
    FROM entities
    ORDER BY type, slug
  `);
  const all = rows.rows as EntityRow[];

  // Group by type first — only consider candidates within the same type.
  // "drizzle-orm" (tech) shouldn't dedupe against "drizzle-orm" (decision)
  // even though such collisions are rare.
  const byType = new Map<string, EntityRow[]>();
  for (const r of all) {
    const list = byType.get(r.type) ?? [];
    list.push(r);
    byType.set(r.type, list);
  }

  // For each candidate pair, compute string similarity. If above threshold,
  // they're a pair worth keeping. Embedding distance is a tie-breaker /
  // confidence boost computed in a follow-up batch.
  type Pair = { a: EntityRow; b: EntityRow; stringSim: number };
  const pairs: Pair[] = [];

  for (const list of byType.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const slugSim = normalizedLevenshtein(a.slug, b.slug);
        const nameSim = normalizedLevenshtein(a.name.toLowerCase(), b.name.toLowerCase());
        const stringSim = Math.max(slugSim, nameSim);
        if (stringSim >= STRING_SIM_THRESHOLD) {
          pairs.push({ a, b, stringSim });
        }
      }
    }
  }

  if (pairs.length === 0) return [];

  // Batch-fetch cosine distances for pairs where both have embeddings.
  const distanceLookup = new Map<string, number>();
  const distancePairs = pairs.filter((p) => p.a.hasEmbedding && p.b.hasEmbedding);
  if (distancePairs.length > 0) {
    const idAList = distancePairs.map((p) => p.a.id);
    const idBList = distancePairs.map((p) => p.b.id);
    const idAsLiteral = `{${idAList.join(",")}}`;
    const idBsLiteral = `{${idBList.join(",")}}`;

    const distRows = await db.execute<{ a_id: string; b_id: string; dist: number } & Record<string, unknown>>(sql`
      WITH pairs AS (
        SELECT
          UNNEST(${idAsLiteral}::uuid[]) AS a_id,
          UNNEST(${idBsLiteral}::uuid[]) AS b_id
      )
      SELECT p.a_id, p.b_id, (ea.embedding <=> eb.embedding) AS dist
      FROM pairs p
      JOIN entities ea ON ea.id = p.a_id
      JOIN entities eb ON eb.id = p.b_id
      WHERE ea.embedding IS NOT NULL AND eb.embedding IS NOT NULL
    `);

    for (const d of distRows.rows) {
      const key = `${d.a_id}|${d.b_id}`;
      distanceLookup.set(key, Number(d.dist));
    }
  }

  // Build a union-find to cluster transitively-similar entities.
  const parent = new Map<string, string>();
  for (const e of all) parent.set(e.id, e.id);
  const find = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, parent.get(next) ?? next);
      cur = parent.get(cur)!;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Track per-pair confidence for output.
  const pairConfidence: Array<{ a: EntityRow; b: EntityRow; confidence: number; embeddingDistance: number | null }> = [];
  for (const p of pairs) {
    const dist = distanceLookup.get(`${p.a.id}|${p.b.id}`) ?? null;
    // Confidence: string-only → ~0.7. With embedding agreement → up to 0.95.
    let confidence = p.stringSim * 0.7;
    if (dist !== null && dist <= EMBEDDING_DIST_THRESHOLD) {
      confidence = Math.min(0.95, p.stringSim * 0.5 + (1 - dist) * 0.5);
    } else if (dist !== null) {
      // Embedding says they're NOT similar — penalize despite string match.
      confidence = p.stringSim * 0.4;
    }
    if (confidence < 0.55) continue;

    pairConfidence.push({ a: p.a, b: p.b, confidence, embeddingDistance: dist });
    union(p.a.id, p.b.id);
  }

  // Materialize groups: members are entities whose union-find root is the same.
  const groupsByRoot = new Map<string, EntityRow[]>();
  for (const e of all) {
    const root = find(e.id);
    const list = groupsByRoot.get(root) ?? [];
    list.push(e);
    groupsByRoot.set(root, list);
  }

  const result: DuplicateGroup[] = [];
  for (const [, members] of groupsByRoot) {
    if (members.length < 2) continue;
    // Canonical = oldest entity by slug-lexicographic (stable, deterministic).
    members.sort((a, b) => a.slug.localeCompare(b.slug));
    const canonical = members[0]!;
    const candidates: DuplicateCandidate[] = members.slice(1).map((m) => {
      const pair = pairConfidence.find(
        (pc) =>
          (pc.a.id === canonical.id && pc.b.id === m.id) ||
          (pc.a.id === m.id && pc.b.id === canonical.id),
      );
      return {
        entity: { id: m.id, slug: m.slug, name: m.name, type: m.type },
        stringSimilarity: Math.max(
          normalizedLevenshtein(canonical.slug, m.slug),
          normalizedLevenshtein(canonical.name.toLowerCase(), m.name.toLowerCase()),
        ),
        embeddingDistance: pair?.embeddingDistance ?? null,
        confidence: pair?.confidence ?? 0,
      };
    });

    result.push({
      canonical: { id: canonical.id, slug: canonical.slug, name: canonical.name, type: canonical.type },
      candidates,
    });
  }

  result.sort((a, b) => {
    const aMax = Math.max(...a.candidates.map((c) => c.confidence));
    const bMax = Math.max(...b.candidates.map((c) => c.confidence));
    return bMax - aMax;
  });

  return result;
}

/**
 * Merge `duplicateId` into `canonicalId`:
 *   1. Re-point all outgoing edges of duplicate → canonical (collapse dupes)
 *   2. Re-point all incoming edges of duplicate → canonical (collapse dupes)
 *   3. Delete the duplicate
 *
 * Idempotent — edges that would create unique-constraint violations are dropped.
 */
export async function mergeEntities(canonicalId: string, duplicateId: string): Promise<{
  outgoingMerged: number;
  incomingMerged: number;
  duplicatesDropped: number;
  deleted: boolean;
}> {
  if (canonicalId === duplicateId) {
    throw new Error("mergeEntities: cannot merge an entity into itself");
  }

  // Outgoing edges from the duplicate. Re-point if the canonical doesn't
  // already have the same (to, relation) edge.
  const outgoingRes = await db.execute<{ id: string } & Record<string, unknown>>(sql`
    WITH redirected AS (
      UPDATE edges
      SET from_entity_id = ${canonicalId}::uuid
      WHERE from_entity_id = ${duplicateId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM edges e2
          WHERE e2.from_entity_id = ${canonicalId}::uuid
            AND e2.to_entity_id = edges.to_entity_id
            AND e2.relation = edges.relation
        )
      RETURNING id
    )
    SELECT id FROM redirected
  `);
  const outgoingMerged = outgoingRes.rows.length;

  // Same for incoming.
  const incomingRes = await db.execute<{ id: string } & Record<string, unknown>>(sql`
    WITH redirected AS (
      UPDATE edges
      SET to_entity_id = ${canonicalId}::uuid
      WHERE to_entity_id = ${duplicateId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM edges e2
          WHERE e2.to_entity_id = ${canonicalId}::uuid
            AND e2.from_entity_id = edges.from_entity_id
            AND e2.relation = edges.relation
        )
      RETURNING id
    )
    SELECT id FROM redirected
  `);
  const incomingMerged = incomingRes.rows.length;

  // Count what got dropped (any edges still pointing at duplicate are exact dupes
  // of edges on canonical — drop them so the duplicate can be deleted).
  const dropRes = await db.execute<{ id: string } & Record<string, unknown>>(sql`
    WITH dropped AS (
      DELETE FROM edges
      WHERE from_entity_id = ${duplicateId}::uuid OR to_entity_id = ${duplicateId}::uuid
      RETURNING id
    )
    SELECT id FROM dropped
  `);
  const duplicatesDropped = dropRes.rows.length;

  // Now safe to delete the duplicate entity.
  const deleted = await db.delete(entities).where(sql`${entities.id} = ${duplicateId}::uuid`).returning({ id: entities.id });

  return {
    outgoingMerged,
    incomingMerged,
    duplicatesDropped,
    deleted: deleted.length > 0,
  };
}

// ─── string similarity ────────────────────────────────────────────

/** Normalized Levenshtein: 0 = no overlap, 1 = identical. */
function normalizedLevenshtein(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

// Suppress unused-export TS warning for Entity (kept for callers that need it).
export type { Entity };
