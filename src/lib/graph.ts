// Graph traversal — multi-hop walks over the typed edge graph.
// Uses a recursive CTE so we push the walk into Postgres rather than round-tripping per hop.
// Cycle protection: tracks visited entity ids in the recursion frame.

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Edge, Entity } from "../db/schema";
import { entities } from "../db/schema";

const DEFAULT_MAX_HOPS = 2;

export interface TraversalOptions {
  /** Maximum hops from the starting entity. Default 2. */
  maxHops?: number;
  /** Restrict traversal to these relation types. Empty/undefined = all. */
  relations?: Edge["relation"][];
  /** If true, walk edges in both directions (incoming + outgoing). Default true. */
  bidirectional?: boolean;
}

export interface TraversalNode {
  entity: Entity;
  depth: number;
  /** Edges traversed to reach this node, in order. */
  pathEdges: Edge[];
}

export async function traverseFrom(
  slug: string,
  options: TraversalOptions = {},
): Promise<TraversalNode[]> {
  const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
  const relations = options.relations ?? [];
  const bidirectional = options.bidirectional ?? true;

  if (maxHops < 1) return [];

  const startRows = await db
    .select()
    .from(entities)
    .where(sql`${entities.slug} = ${slug}`)
    .limit(1);

  const start = startRows[0];
  if (!start) return [];

  const relationsLiteral = relations.length > 0 ? `{${relations.join(",")}}` : null;
  const relationFilter = relationsLiteral
    ? sql`AND e.relation = ANY(${relationsLiteral}::edge_relation[])`
    : sql``;

  const directionJoin = bidirectional
    ? sql`(e.from_entity_id = w.entity_id OR e.to_entity_id = w.entity_id)`
    : sql`e.from_entity_id = w.entity_id`;

  const nextEntity = bidirectional
    ? sql`CASE WHEN e.from_entity_id = w.entity_id THEN e.to_entity_id ELSE e.from_entity_id END`
    : sql`e.to_entity_id`;

  const walkRes = await db.execute<{
    entity_id: string;
    depth: number;
    path_edge_ids: string[];
  }>(sql`
    WITH RECURSIVE walk AS (
      SELECT
        ${start.id}::uuid AS entity_id,
        0 AS depth,
        ARRAY[${start.id}::uuid] AS visited,
        ARRAY[]::uuid[] AS path_edge_ids
      UNION ALL
      SELECT
        ${nextEntity} AS entity_id,
        w.depth + 1 AS depth,
        w.visited || (${nextEntity}) AS visited,
        w.path_edge_ids || e.id AS path_edge_ids
      FROM walk w
      JOIN edges e ON ${directionJoin}
      WHERE w.depth < ${maxHops}
        AND NOT ((${nextEntity}) = ANY(w.visited))
        ${relationFilter}
    )
    SELECT entity_id, depth, path_edge_ids
    FROM walk
    WHERE depth > 0
    ORDER BY depth, entity_id
  `);

  const walkRows = walkRes.rows;
  if (walkRows.length === 0) {
    return [{ entity: start, depth: 0, pathEdges: [] }];
  }

  const entityIds = new Set<string>([start.id]);
  const edgeIds = new Set<string>();
  for (const row of walkRows) {
    entityIds.add(row.entity_id);
    for (const eid of row.path_edge_ids) edgeIds.add(eid);
  }

  const entityIdsLiteral = `{${[...entityIds].join(",")}}`;
  const edgeIdsLiteral = `{${[...edgeIds].join(",")}}`;

  const [entityRes, edgeRes] = await Promise.all([
    db.execute<Entity>(sql`
      SELECT * FROM entities WHERE id = ANY(${entityIdsLiteral}::uuid[])
    `),
    edgeIds.size > 0
      ? db.execute<Edge>(sql`
          SELECT * FROM edges WHERE id = ANY(${edgeIdsLiteral}::uuid[])
        `)
      : Promise.resolve({ rows: [] as Edge[] }),
  ]);

  const entityById = new Map<string, Entity>();
  for (const e of entityRes.rows) entityById.set(e.id, e);
  const edgeById = new Map<string, Edge>();
  for (const e of edgeRes.rows) edgeById.set(e.id, e);

  const result: TraversalNode[] = [{ entity: start, depth: 0, pathEdges: [] }];
  // Deduplicate to the shortest path per entity (recursive CTE may visit
  // the same node via multiple paths at the same depth).
  const bestByEntity = new Map<string, { depth: number; pathEdgeIds: string[] }>();
  for (const row of walkRows) {
    const existing = bestByEntity.get(row.entity_id);
    if (!existing || row.depth < existing.depth) {
      bestByEntity.set(row.entity_id, { depth: row.depth, pathEdgeIds: row.path_edge_ids });
    }
  }

  for (const [entityId, info] of bestByEntity) {
    const entity = entityById.get(entityId);
    if (!entity) continue;
    const pathEdges: Edge[] = [];
    for (const eid of info.pathEdgeIds) {
      const edge = edgeById.get(eid);
      if (edge) pathEdges.push(edge);
    }
    result.push({ entity, depth: info.depth, pathEdges });
  }

  result.sort((a, b) => a.depth - b.depth);
  return result;
}
