// Playbooks — recurring standing instructions that fire on events.
//
// Each playbook has a `trigger` event, an optional structured `filter`, an
// ordered list of `actions` (free-text steps the agent should perform), and
// an optional `appliesToSlugs` list to restrict it to specific entities.
//
// v0.2.0: storage + surfacing only. When an event fires (e.g. addProject),
// the caller fetches matching playbooks via `getMatchingPlaybooks(...)` and
// shows them to the user/agent. Auto-execution is v0.3+ work.

import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import type { NewPlaybook, Playbook } from "../db/schema";
import { playbooks } from "../db/schema";

export type PlaybookTrigger =
  | "project_created"
  | "project_updated"
  | "scope_changed"
  | "tech_stack_changed"
  | "significant_change"
  | "entity_added"
  | "manual";

export const PLAYBOOK_TRIGGERS: PlaybookTrigger[] = [
  "project_created",
  "project_updated",
  "scope_changed",
  "tech_stack_changed",
  "significant_change",
  "entity_added",
  "manual",
];

export interface CreatePlaybookInput {
  slug: string;
  name: string;
  description?: string;
  trigger: PlaybookTrigger;
  filter?: Record<string, unknown>;
  actions: string[];
  appliesToSlugs?: string[];
  active?: boolean;
}

export interface UpdatePlaybookInput {
  name?: string;
  description?: string;
  trigger?: PlaybookTrigger;
  filter?: Record<string, unknown>;
  actions?: string[];
  appliesToSlugs?: string[];
  active?: boolean;
}

export interface PlaybookEventContext {
  trigger: PlaybookTrigger;
  /** Slug of the entity the event is about (e.g. the product just created). */
  entitySlug?: string;
  /** Type of that entity, if applicable. */
  entityType?: string;
  /** Whatever else the caller wants to pass for filter matching. */
  meta?: Record<string, unknown>;
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function createPlaybook(input: CreatePlaybookInput): Promise<Playbook> {
  if (input.actions.length === 0) {
    throw new Error("createPlaybook: actions must be non-empty");
  }

  const values: NewPlaybook = {
    slug: input.slug,
    name: input.name,
    description: input.description ?? "",
    trigger: input.trigger,
    filter: input.filter ?? {},
    actions: input.actions,
    appliesToSlugs: input.appliesToSlugs ?? [],
    active: input.active ?? true,
  };

  const [row] = await db
    .insert(playbooks)
    .values(values)
    .onConflictDoUpdate({
      target: playbooks.slug,
      set: {
        name: values.name,
        description: values.description,
        trigger: values.trigger,
        filter: values.filter,
        actions: values.actions,
        appliesToSlugs: values.appliesToSlugs,
        active: values.active,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error(`createPlaybook: insert returned no row for ${input.slug}`);
  return row;
}

export async function updatePlaybook(
  slug: string,
  input: UpdatePlaybookInput,
): Promise<Playbook | null> {
  const patch: Partial<NewPlaybook> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.trigger !== undefined) patch.trigger = input.trigger;
  if (input.filter !== undefined) patch.filter = input.filter;
  if (input.actions !== undefined) patch.actions = input.actions;
  if (input.appliesToSlugs !== undefined) patch.appliesToSlugs = input.appliesToSlugs;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db
    .update(playbooks)
    .set(patch)
    .where(eq(playbooks.slug, slug))
    .returning();
  return row ?? null;
}

export async function deletePlaybook(slug: string): Promise<boolean> {
  const result = await db.delete(playbooks).where(eq(playbooks.slug, slug)).returning({ id: playbooks.id });
  return result.length > 0;
}

export async function getPlaybookBySlug(slug: string): Promise<Playbook | null> {
  const rows = await db.select().from(playbooks).where(eq(playbooks.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export interface ListPlaybooksOptions {
  trigger?: PlaybookTrigger;
  activeOnly?: boolean;
  limit?: number;
}

export async function listPlaybooks(options: ListPlaybooksOptions = {}): Promise<Playbook[]> {
  const conditions = [];
  if (options.trigger) conditions.push(eq(playbooks.trigger, options.trigger));
  if (options.activeOnly) conditions.push(eq(playbooks.active, true));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return await db
    .select()
    .from(playbooks)
    .where(where)
    .orderBy(sql`${playbooks.trigger}, ${playbooks.name}`)
    .limit(options.limit ?? 100);
}

// ─── Event matching ──────────────────────────────────────────────

/**
 * Return all active playbooks that match the given event context.
 *
 * Matching rules:
 *   1. Playbook is active
 *   2. Playbook trigger matches context.trigger
 *   3. If playbook has appliesToSlugs, context.entitySlug must be in it
 *      (empty list means "applies to all")
 *   4. If playbook has filter keys, every key must match a corresponding
 *      key in context.meta or context.entityType (filter.entityType matches
 *      context.entityType)
 */
export async function getMatchingPlaybooks(context: PlaybookEventContext): Promise<Playbook[]> {
  // Pull all active playbooks for this trigger (DB does the cheap part),
  // then filter in JS for the structured filter checks.
  const candidates = await db
    .select()
    .from(playbooks)
    .where(and(eq(playbooks.trigger, context.trigger), eq(playbooks.active, true)));

  return candidates.filter((p) => playbookMatches(p, context));
}

function playbookMatches(p: Playbook, ctx: PlaybookEventContext): boolean {
  // applies-to check
  if (p.appliesToSlugs.length > 0) {
    if (!ctx.entitySlug || !p.appliesToSlugs.includes(ctx.entitySlug)) return false;
  }

  const filter = p.filter as Record<string, unknown>;
  if (filter && Object.keys(filter).length > 0) {
    for (const [key, expected] of Object.entries(filter)) {
      const actual = lookupFilterValue(key, ctx);
      if (!matchesFilterValue(actual, expected)) return false;
    }
  }

  return true;
}

function lookupFilterValue(key: string, ctx: PlaybookEventContext): unknown {
  if (key === "entityType") return ctx.entityType;
  if (key === "entitySlug") return ctx.entitySlug;
  return ctx.meta?.[key];
}

function matchesFilterValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}
