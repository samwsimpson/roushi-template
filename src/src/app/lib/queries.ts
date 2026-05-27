// Server-side query helpers used by the UI's RSC pages.
// Kept separate from the brain libs so view-shape changes don't churn the core.

import "server-only";
import { and, sql } from "drizzle-orm";
import { db } from "../../db/client";
import type { Edge, Entity } from "../../db/schema";
import { edges, entities } from "../../db/schema";

export interface EntityListFilters {
  type?: string;
  q?: string;
  clientWork?: "yes" | "no";
}

export async function listEntities(filters: EntityListFilters = {}): Promise<Entity[]> {
  const conditions = [];
  if (filters.type) {
    conditions.push(sql`${entities.type}::text = ${filters.type}`);
  }
  if (filters.q && filters.q.trim().length > 0) {
    const pattern = `%${filters.q.trim().toLowerCase()}%`;
    conditions.push(
      sql`(lower(${entities.name}) LIKE ${pattern} OR lower(${entities.slug}) LIKE ${pattern} OR lower(${entities.description}) LIKE ${pattern})`,
    );
  }
  if (filters.clientWork === "yes") {
    conditions.push(sql`${entities.frontmatter}->>'client_work' = 'true'`);
  } else if (filters.clientWork === "no") {
    conditions.push(sql`(${entities.frontmatter}->>'client_work' IS NULL OR ${entities.frontmatter}->>'client_work' != 'true')`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return await db
    .select()
    .from(entities)
    .where(where)
    .orderBy(sql`${entities.type}, ${entities.name}`)
    .limit(500);
}

export async function recentEntities(limit = 8): Promise<Entity[]> {
  return await db
    .select()
    .from(entities)
    .orderBy(sql`${entities.createdAt} DESC`)
    .limit(limit);
}

export interface EntityTypeCount {
  type: string;
  n: number;
}

export async function entityTypeCounts(): Promise<EntityTypeCount[]> {
  const rows = await db.execute<{ type: string; n: number }>(sql`
    SELECT type::text AS type, COUNT(*)::int AS n
    FROM entities
    GROUP BY type
    ORDER BY type
  `);
  return rows.rows.map((r) => ({ type: r.type, n: Number(r.n) }));
}

export async function getEntityBySlug(slug: string): Promise<Entity | null> {
  const rows = await db.select().from(entities).where(sql`${entities.slug} = ${slug}`).limit(1);
  return rows[0] ?? null;
}

export interface EdgeWithEntity {
  edge: Edge;
  other: Entity;
  /** "outgoing" if from this entity, "incoming" if to it. */
  direction: "outgoing" | "incoming";
}

export async function getEdgesForEntity(entityId: string): Promise<EdgeWithEntity[]> {
  const rows = await db.execute<{
    edge_id: string;
    from_id: string;
    to_id: string;
    relation: string;
    context: string | null;
    edge_created_at: string;
    other_id: string;
    other_slug: string;
    other_name: string;
    other_type: string;
    other_description: string;
    other_frontmatter: Record<string, unknown>;
    other_source_path: string | null;
    other_created_at: string;
    other_updated_at: string;
    other_last_validated_at: string;
    direction: "outgoing" | "incoming";
  }>(sql`
    SELECT
      e.id AS edge_id, e.from_entity_id AS from_id, e.to_entity_id AS to_id,
      e.relation::text AS relation, e.context, e.created_at::text AS edge_created_at,
      other.id AS other_id, other.slug AS other_slug, other.name AS other_name,
      other.type::text AS other_type, other.description AS other_description,
      other.frontmatter AS other_frontmatter, other.source_path AS other_source_path,
      other.created_at::text AS other_created_at, other.updated_at::text AS other_updated_at,
      other.last_validated_at::text AS other_last_validated_at,
      CASE WHEN e.from_entity_id = ${entityId}::uuid THEN 'outgoing' ELSE 'incoming' END AS direction
    FROM edges e
    JOIN entities other ON other.id = CASE
      WHEN e.from_entity_id = ${entityId}::uuid THEN e.to_entity_id
      ELSE e.from_entity_id
    END
    WHERE e.from_entity_id = ${entityId}::uuid OR e.to_entity_id = ${entityId}::uuid
    ORDER BY direction, relation, other_name
  `);

  return rows.rows.map((r) => ({
    edge: {
      id: r.edge_id,
      fromEntityId: r.from_id,
      toEntityId: r.to_id,
      relation: r.relation as Edge["relation"],
      declaredByEntityId: null,
      context: r.context,
      createdAt: new Date(r.edge_created_at),
    },
    other: {
      id: r.other_id,
      slug: r.other_slug,
      name: r.other_name,
      type: r.other_type as Entity["type"],
      description: r.other_description,
      frontmatter: r.other_frontmatter,
      sourcePath: r.other_source_path,
      embedding: null,
      searchVector: null,
      createdAt: new Date(r.other_created_at),
      updatedAt: new Date(r.other_updated_at),
      lastValidatedAt: new Date(r.other_last_validated_at),
      createdBy: null,
    },
    direction: r.direction,
  }));
}
