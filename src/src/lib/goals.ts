// Goals — durable multi-week objectives that agents can work toward.
// Goals reference entities via relatedEntityIds, so a "ship Roushi v0.1"
// goal can be linked to the roushi product entity, related decisions, etc.

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Goal, NewGoal } from "../db/schema";
import { entities, goals } from "../db/schema";

export interface CreateGoalInput {
  title: string;
  description?: string;
  targetDate?: Date;
  relatedEntitySlugs?: string[];
}

export type GoalStatus = "active" | "completed" | "abandoned" | "blocked";

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const relatedEntityIds = input.relatedEntitySlugs?.length
    ? await resolveSlugsToIds(input.relatedEntitySlugs)
    : [];

  const newGoal: NewGoal = {
    title: input.title,
    description: input.description ?? "",
    targetDate: input.targetDate ?? null,
    status: "active",
    relatedEntityIds,
  };

  const [row] = await db.insert(goals).values(newGoal).returning();
  if (!row) throw new Error("createGoal: insert returned no row");
  return row;
}

export async function updateGoalStatus(id: string, status: GoalStatus): Promise<Goal | null> {
  const [row] = await db
    .update(goals)
    .set({ status, updatedAt: new Date() })
    .where(sql`${goals.id} = ${id}`)
    .returning();
  return row ?? null;
}

export interface ListGoalsOptions {
  status?: GoalStatus;
  limit?: number;
}

export async function listGoals(options: ListGoalsOptions = {}): Promise<Goal[]> {
  const limit = options.limit ?? 50;
  const query = options.status
    ? db
        .select()
        .from(goals)
        .where(sql`${goals.status} = ${options.status}`)
        .orderBy(sql`${goals.targetDate} NULLS LAST, ${goals.createdAt} DESC`)
        .limit(limit)
    : db
        .select()
        .from(goals)
        .orderBy(sql`${goals.targetDate} NULLS LAST, ${goals.createdAt} DESC`)
        .limit(limit);
  return await query;
}

export async function linkEntitiesToGoal(goalId: string, entitySlugs: string[]): Promise<Goal | null> {
  const newIds = await resolveSlugsToIds(entitySlugs);
  if (newIds.length === 0) return null;

  const newIdsLiteral = `{${newIds.join(",")}}`;
  const [row] = await db
    .update(goals)
    .set({
      relatedEntityIds: sql`(
        SELECT ARRAY(SELECT DISTINCT unnest(related_entity_ids || ${newIdsLiteral}::uuid[]))
      )`,
      updatedAt: new Date(),
    })
    .where(sql`${goals.id} = ${goalId}`)
    .returning();
  return row ?? null;
}

async function resolveSlugsToIds(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const slugsLiteral = `{${slugs.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",")}}`;
  const res = await db.execute<{ id: string }>(sql`
    SELECT id FROM ${entities} WHERE slug = ANY(${slugsLiteral}::text[])
  `);
  return res.rows.map((r) => r.id);
}
