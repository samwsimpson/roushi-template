// Scratchpad — per-agent ephemeral working memory.
// Agents (one MCP client = one "agentId") get their own keyspace partitioned
// by sessionId. Optional TTL via expiresAt; reads filter out expired entries.

import { and, sql } from "drizzle-orm";
import { db } from "../db/client";
import type { ScratchpadEntry } from "../db/schema";
import { scratchpad } from "../db/schema";

export interface ScratchpadKey {
  agentId: string;
  sessionId: string;
  key: string;
}

export interface WriteScratchpadInput extends ScratchpadKey {
  value: unknown;
  ttlSeconds?: number;
}

export async function writeScratchpad(input: WriteScratchpadInput): Promise<ScratchpadEntry> {
  const expiresAt = input.ttlSeconds
    ? new Date(Date.now() + input.ttlSeconds * 1000)
    : null;

  const [row] = await db
    .insert(scratchpad)
    .values({
      agentId: input.agentId,
      sessionId: input.sessionId,
      key: input.key,
      value: input.value,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [scratchpad.agentId, scratchpad.sessionId, scratchpad.key],
      set: {
        value: input.value,
        expiresAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error("writeScratchpad: insert returned no row");
  return row;
}

export async function readScratchpad(key: ScratchpadKey): Promise<ScratchpadEntry | null> {
  const rows = await db
    .select()
    .from(scratchpad)
    .where(
      and(
        sql`${scratchpad.agentId} = ${key.agentId}`,
        sql`${scratchpad.sessionId} = ${key.sessionId}`,
        sql`${scratchpad.key} = ${key.key}`,
        sql`(${scratchpad.expiresAt} IS NULL OR ${scratchpad.expiresAt} > now())`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface ListScratchpadOptions {
  agentId: string;
  sessionId?: string;
  limit?: number;
}

export async function listScratchpad(options: ListScratchpadOptions): Promise<ScratchpadEntry[]> {
  const limit = options.limit ?? 50;
  const conditions = [sql`${scratchpad.agentId} = ${options.agentId}`];
  if (options.sessionId) {
    conditions.push(sql`${scratchpad.sessionId} = ${options.sessionId}`);
  }
  conditions.push(sql`(${scratchpad.expiresAt} IS NULL OR ${scratchpad.expiresAt} > now())`);

  return await db
    .select()
    .from(scratchpad)
    .where(and(...conditions))
    .orderBy(sql`${scratchpad.updatedAt} DESC`)
    .limit(limit);
}

export async function deleteScratchpad(key: ScratchpadKey): Promise<boolean> {
  const result = await db
    .delete(scratchpad)
    .where(
      and(
        sql`${scratchpad.agentId} = ${key.agentId}`,
        sql`${scratchpad.sessionId} = ${key.sessionId}`,
        sql`${scratchpad.key} = ${key.key}`,
      ),
    )
    .returning({ id: scratchpad.id });
  return result.length > 0;
}

/** Sweep expired entries. Intended for the decay cron in v0.5+. */
export async function purgeExpired(): Promise<number> {
  const result = await db
    .delete(scratchpad)
    .where(sql`${scratchpad.expiresAt} IS NOT NULL AND ${scratchpad.expiresAt} <= now()`)
    .returning({ id: scratchpad.id });
  return result.length;
}
