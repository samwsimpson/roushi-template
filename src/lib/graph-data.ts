// Graph data shaping for the /graph visual explorer. Reads every entity
// and every edge from the brain and renders them as cytoscape-compatible
// node + edge arrays.
//
// Server-side only — pulls from the DB. The client component receives
// the already-shaped arrays as props.

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { edges, entities } from "../db/schema";

export interface GraphNode {
  id: string;        // entity uuid
  slug: string;
  name: string;
  type: string;      // entity type (product, tech, lesson, etc.)
}

export interface GraphEdge {
  id: string;
  source: string;    // entity uuid (from)
  target: string;    // entity uuid (to)
  relation: string;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Counts per type — used by the legend / filter UI. */
  typeCounts: Record<string, number>;
}

export async function loadGraphSnapshot(): Promise<GraphSnapshot> {
  const [entityRows, edgeRows] = await Promise.all([
    db
      .select({
        id: entities.id,
        slug: entities.slug,
        name: entities.name,
        type: entities.type,
      })
      .from(entities),
    db.execute<{ id: string; from_id: string; to_id: string; relation: string }>(sql`
      SELECT id, from_entity_id AS from_id, to_entity_id AS to_id, relation::text AS relation
      FROM ${edges}
    `),
  ]);

  const nodes: GraphNode[] = entityRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
  }));

  const graphEdges: GraphEdge[] = edgeRows.rows.map((r) => ({
    id: r.id,
    source: r.from_id,
    target: r.to_id,
    relation: r.relation,
  }));

  const typeCounts: Record<string, number> = {};
  for (const n of nodes) typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;

  return { nodes, edges: graphEdges, typeCounts };
}
