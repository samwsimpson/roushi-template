// Playbook invocations — tracks each time a playbook fires.
//
// recordInvocation() creates one invocation + N action rows (one per playbook
// action). Actions start as `pending`. The agent (or human) marks each one
// complete/rejected/failed as they work through it. When all actions resolve
// the invocation rolls up to `completed` automatically.
//
// This is NOT true auto-execution — Roushi doesn't interpret action text and
// run it. Actions are still free-text instructions the human or agent
// performs. What this layer adds: visibility ("which playbooks fired?"),
// tracking ("did anyone handle them?"), and a review queue for things that
// shouldn't slip through.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import type {
  InvocationAction,
  NewInvocationAction,
  NewPlaybookInvocation,
  Playbook,
  PlaybookInvocation,
} from "../db/schema";
import {
  invocationActions,
  playbookInvocations,
  playbooks as playbooksTable,
  entities as entitiesTable,
} from "../db/schema";
import type { PlaybookTrigger } from "./playbooks";

export type InvocationStatus = "pending" | "in_progress" | "completed" | "abandoned";
export type ActionStatus = "pending" | "completed" | "rejected" | "failed";

export const INVOCATION_STATUSES: InvocationStatus[] = ["pending", "in_progress", "completed", "abandoned"];
export const ACTION_STATUSES: ActionStatus[] = ["pending", "completed", "rejected", "failed"];

export interface RecordInvocationInput {
  playbook: Playbook;
  eventTrigger: PlaybookTrigger;
  eventContext: Record<string, unknown>;
  /** Optional entity the event was about (e.g. the project that was created). */
  entityId?: string;
}

export async function recordInvocation(input: RecordInvocationInput): Promise<{
  invocation: PlaybookInvocation;
  actions: InvocationAction[];
}> {
  const invocationValues: NewPlaybookInvocation = {
    playbookId: input.playbook.id,
    eventTrigger: input.eventTrigger,
    eventContext: input.eventContext,
    entityId: input.entityId ?? null,
    status: "pending",
  };

  const [invocation] = await db.insert(playbookInvocations).values(invocationValues).returning();
  if (!invocation) throw new Error("recordInvocation: insert returned no row");

  const actionRows: NewInvocationAction[] = input.playbook.actions.map((text, idx) => ({
    invocationId: invocation.id,
    actionIndex: idx,
    actionText: text,
    status: "pending",
  }));

  const actions = actionRows.length > 0
    ? await db.insert(invocationActions).values(actionRows).returning()
    : [];

  return { invocation, actions };
}

export interface InvocationWithContext {
  invocation: PlaybookInvocation;
  playbook: { id: string; slug: string; name: string; trigger: string };
  entity: { id: string; slug: string; name: string; type: string } | null;
  actions: InvocationAction[];
  pendingActionCount: number;
  completedActionCount: number;
}

export interface ListInvocationsOptions {
  status?: InvocationStatus;
  playbookSlug?: string;
  limit?: number;
}

export async function listInvocations(options: ListInvocationsOptions = {}): Promise<InvocationWithContext[]> {
  // Step 1: fetch invocations with their playbook + entity in one shot.
  const conditions = [];
  if (options.status) conditions.push(eq(playbookInvocations.status, options.status));
  if (options.playbookSlug) conditions.push(eq(playbooksTable.slug, options.playbookSlug));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      invocation: playbookInvocations,
      playbook: {
        id: playbooksTable.id,
        slug: playbooksTable.slug,
        name: playbooksTable.name,
        trigger: playbooksTable.trigger,
      },
      entity: {
        id: entitiesTable.id,
        slug: entitiesTable.slug,
        name: entitiesTable.name,
        type: entitiesTable.type,
      },
    })
    .from(playbookInvocations)
    .innerJoin(playbooksTable, eq(playbooksTable.id, playbookInvocations.playbookId))
    .leftJoin(entitiesTable, eq(entitiesTable.id, playbookInvocations.entityId))
    .where(where)
    .orderBy(sql`${playbookInvocations.createdAt} DESC`)
    .limit(options.limit ?? 50);

  if (rows.length === 0) return [];

  // Step 2: fetch all actions for these invocations in one query.
  const invocationIds = rows.map((r) => r.invocation.id);
  const actions = await db
    .select()
    .from(invocationActions)
    .where(inArray(invocationActions.invocationId, invocationIds))
    .orderBy(invocationActions.actionIndex);

  const actionsByInvocation = new Map<string, InvocationAction[]>();
  for (const a of actions) {
    const list = actionsByInvocation.get(a.invocationId) ?? [];
    list.push(a);
    actionsByInvocation.set(a.invocationId, list);
  }

  return rows.map((r) => {
    const acts = actionsByInvocation.get(r.invocation.id) ?? [];
    return {
      invocation: r.invocation,
      playbook: r.playbook,
      entity: r.entity?.id
        ? { id: r.entity.id, slug: r.entity.slug!, name: r.entity.name!, type: r.entity.type! }
        : null,
      actions: acts,
      pendingActionCount: acts.filter((a) => a.status === "pending").length,
      completedActionCount: acts.filter((a) => a.status === "completed").length,
    };
  });
}

export async function getInvocation(id: string): Promise<InvocationWithContext | null> {
  const list = await listInvocations({});
  return list.find((i) => i.invocation.id === id) ?? null;
}

export interface UpdateActionInput {
  invocationId: string;
  actionIndex: number;
  status: ActionStatus;
  notes?: string;
  completedBy?: string;
}

export async function updateActionStatus(input: UpdateActionInput): Promise<InvocationAction | null> {
  const completedAt = input.status === "completed" || input.status === "failed" ? new Date() : null;

  const [row] = await db
    .update(invocationActions)
    .set({
      status: input.status,
      notes: input.notes ?? null,
      completedAt,
      completedBy: input.completedBy ?? null,
    })
    .where(
      and(
        eq(invocationActions.invocationId, input.invocationId),
        eq(invocationActions.actionIndex, input.actionIndex),
      ),
    )
    .returning();

  if (row) {
    // Roll up: if no actions are pending anymore, mark the invocation completed.
    await rollupInvocationStatus(input.invocationId);
  }
  return row ?? null;
}

async function rollupInvocationStatus(invocationId: string): Promise<void> {
  const acts = await db
    .select({ status: invocationActions.status })
    .from(invocationActions)
    .where(eq(invocationActions.invocationId, invocationId));

  if (acts.length === 0) return;

  const pending = acts.filter((a) => a.status === "pending").length;
  const completed = acts.filter((a) => a.status === "completed").length;

  let newStatus: InvocationStatus;
  if (pending === 0) {
    newStatus = "completed";
  } else if (completed > 0 || pending < acts.length) {
    newStatus = "in_progress";
  } else {
    newStatus = "pending";
  }

  await db
    .update(playbookInvocations)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(playbookInvocations.id, invocationId));
}

export async function abandonInvocation(id: string): Promise<PlaybookInvocation | null> {
  const [row] = await db
    .update(playbookInvocations)
    .set({ status: "abandoned", updatedAt: new Date() })
    .where(eq(playbookInvocations.id, id))
    .returning();
  return row ?? null;
}
