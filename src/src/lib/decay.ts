// Decay — find entities that haven't been re-validated in a while.
//
// listStaleEntities() returns rows whose lastValidatedAt is older than the
// threshold (default 90 days). Useful as a "review queue" the operator
// works through manually OR as the input to a scheduled cleanup job later.
//
// touchEntity() bumps lastValidatedAt to now — call after a human review
// confirms the entity is still accurate.

import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Entity } from "../db/schema";
import { entities } from "../db/schema";

export const DEFAULT_STALE_DAYS = 90;

export interface StaleEntity {
  id: string;
  slug: string;
  name: string;
  type: string;
  lastValidatedAt: Date;
  daysSinceValidation: number;
}

export async function listStaleEntities(staleAfterDays: number = DEFAULT_STALE_DAYS): Promise<StaleEntity[]> {
  const rows = await db.execute<{
    id: string;
    slug: string;
    name: string;
    type: string;
    last_validated_at: string;
    days_old: number;
  } & Record<string, unknown>>(sql`
    SELECT
      id, slug, name, type::text AS type,
      last_validated_at::text AS last_validated_at,
      EXTRACT(EPOCH FROM (now() - last_validated_at))::int / 86400 AS days_old
    FROM entities
    WHERE last_validated_at < now() - (${staleAfterDays} || ' days')::interval
    ORDER BY last_validated_at ASC
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
    lastValidatedAt: new Date(r.last_validated_at),
    daysSinceValidation: Number(r.days_old),
  }));
}

/** Bump lastValidatedAt to now — call after a human confirms the entity is still accurate. */
export async function touchEntity(slug: string): Promise<Entity | null> {
  const [row] = await db
    .update(entities)
    .set({ lastValidatedAt: new Date() })
    .where(eq(entities.slug, slug))
    .returning();
  return row ?? null;
}

/** Bump lastValidatedAt for many entities in one call. Returns how many got touched. */
export async function touchAll(slugs: string[]): Promise<number> {
  if (slugs.length === 0) return 0;
  const slugsLiteral = `{${slugs.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",")}}`;
  const res = await db.execute<{ count: number } & Record<string, unknown>>(sql`
    WITH touched AS (
      UPDATE entities
      SET last_validated_at = now()
      WHERE slug = ANY(${slugsLiteral}::text[])
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM touched
  `);
  return Number(res.rows[0]?.count ?? 0);
}
