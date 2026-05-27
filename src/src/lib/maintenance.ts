// Maintenance scans — cron-invokable health checks against the brain.
// Each scan returns a structured findings object; a shared helper
// (`upsertSystemGoal`) turns findings into a system goal that surfaces
// on /goals as "[system] Maintenance: …" so Sam (or any operator) sees
// pending work without having to remember to run the audit manually.
//
// This closes the loop on the cron decls that v0.3.11 removed from
// vercel.ts because the routes didn't exist. They exist now; routes at
// src/app/api/cron/*.

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { goals, maintenanceRuns } from "../db/schema";
import { auditEdges, type EdgeAuditFinding } from "./audit";
import {
  runContradictionScan,
  type ContradictionFinding,
  type ContradictionScanOptions,
  DEFAULT_CONTRADICTION_TYPES,
} from "./contradictions";
import { listStaleEntities, type StaleEntity, DEFAULT_STALE_DAYS } from "./decay";
import { findDuplicateGroups, type DuplicateGroup } from "./dedupe";

export type ScanKind = "decay" | "dedupe" | "audit-edges" | "contradictions";

export interface ScanResult<T> {
  kind: ScanKind;
  title: string;
  findings: T[];
  threshold: number;
  exceededThreshold: boolean;
  /** Optional pre-rendered description body for the system goal. */
  goalDescription: string;
}

const SYSTEM_GOAL_PREFIX = "[system] Maintenance:";

function systemGoalTitle(kind: ScanKind, count: number): string {
  switch (kind) {
    case "decay":
      return `${SYSTEM_GOAL_PREFIX} ${count} stale entit${count === 1 ? "y" : "ies"} need validation`;
    case "dedupe":
      return `${SYSTEM_GOAL_PREFIX} ${count} probable duplicate group${count === 1 ? "" : "s"} to review`;
    case "audit-edges":
      return `${SYSTEM_GOAL_PREFIX} ${count} edge${count === 1 ? "" : "s"} flagged by audit`;
    case "contradictions":
      return `${SYSTEM_GOAL_PREFIX} ${count} contradiction${count === 1 ? "" : "s"} between brain entities`;
  }
}

/**
 * Find every existing system goal whose title starts with our prefix and
 * matches this scan kind. Used for upsert + cleanup.
 */
async function findExistingSystemGoals(kind: ScanKind): Promise<Array<{ id: string; title: string; status: string }>> {
  const tag = systemGoalKindTag(kind);
  const res = await db.execute<{ id: string; title: string; status: string }>(sql`
    SELECT id, title, status::text AS status
    FROM ${goals}
    WHERE title LIKE ${`${SYSTEM_GOAL_PREFIX}%${tag}%`}
      AND status = 'active'
  `);
  return res.rows;
}

function systemGoalKindTag(kind: ScanKind): string {
  switch (kind) {
    case "decay":
      return "stale";
    case "dedupe":
      return "duplicate";
    case "audit-edges":
      return "edge";
    case "contradictions":
      return "contradiction";
  }
}

/**
 * Idempotent upsert. If findings exceeded threshold, ensure exactly one
 * active goal exists with the latest title + description. If they didn't,
 * close all matching active goals as completed.
 */
// Intentionally takes the *erased* shape — we only need title, kind,
// description, exceededThreshold. Keeps the runner switch typing simple.
type ScanUpsertable = Pick<ScanResult<unknown>, "kind" | "title" | "goalDescription" | "exceededThreshold"> & {
  findings: { length: number };
};

async function upsertSystemGoal(scan: ScanUpsertable): Promise<{
  action: "created" | "updated" | "completed" | "noop";
  goalId: string | null;
}> {
  const existing = await findExistingSystemGoals(scan.kind);

  if (!scan.exceededThreshold) {
    if (existing.length === 0) return { action: "noop", goalId: null };
    // Findings cleared — close stale goals.
    for (const g of existing) {
      await db
        .update(goals)
        .set({ status: "completed", updatedAt: new Date() })
        .where(sql`${goals.id} = ${g.id}`);
    }
    return { action: "completed", goalId: existing[0]?.id ?? null };
  }

  const newTitle = systemGoalTitle(scan.kind, scan.findings.length);
  const newDescription = scan.goalDescription;

  if (existing.length === 0) {
    const [row] = await db
      .insert(goals)
      .values({
        title: newTitle,
        description: newDescription,
        status: "active",
        relatedEntityIds: [],
      })
      .returning();
    return { action: "created", goalId: row?.id ?? null };
  }

  // Update the most recent existing goal; close any extras.
  const [primary, ...extras] = existing;
  if (!primary) return { action: "noop", goalId: null };
  await db
    .update(goals)
    .set({ title: newTitle, description: newDescription, updatedAt: new Date() })
    .where(sql`${goals.id} = ${primary.id}`);
  for (const extra of extras) {
    await db
      .update(goals)
      .set({ status: "completed", updatedAt: new Date() })
      .where(sql`${goals.id} = ${extra.id}`);
  }
  return { action: "updated", goalId: primary.id };
}

// ─── decay ─────────────────────────────────────────────────────────

export interface DecayScanOptions {
  /** Entities older than this many days are stale. Default 90 (matches lib/decay). */
  daysThreshold?: number;
  /** Minimum findings count before creating a goal. Default 5. */
  goalThreshold?: number;
}

export async function scanDecay(options: DecayScanOptions = {}): Promise<ScanResult<StaleEntity>> {
  const days = options.daysThreshold ?? DEFAULT_STALE_DAYS;
  const goalThreshold = options.goalThreshold ?? 5;
  const findings = await listStaleEntities(days);
  const exceededThreshold = findings.length >= goalThreshold;
  const lines = [
    `${findings.length} entit${findings.length === 1 ? "y has" : "ies have"} not been validated in ≥${days} days.`,
    "",
    "Review at /optimize and either touch the entity (if still accurate) or update its description to reflect current state.",
    "",
    "Top 10 oldest:",
    ...findings.slice(0, 10).map(
      (f) =>
        `- [${f.type}] ${f.name} (${f.slug}) — last validated ${f.lastValidatedAt.toISOString().slice(0, 10)} (${f.daysSinceValidation} days ago)`,
    ),
  ];
  return {
    kind: "decay",
    title: systemGoalTitle("decay", findings.length),
    findings,
    threshold: goalThreshold,
    exceededThreshold,
    goalDescription: lines.join("\n"),
  };
}

// ─── dedupe ────────────────────────────────────────────────────────

export interface DedupeScanOptions {
  /** Minimum duplicate-group count before creating a goal. Default 1. */
  goalThreshold?: number;
}

export async function scanDuplicates(options: DedupeScanOptions = {}): Promise<ScanResult<DuplicateGroup>> {
  const goalThreshold = options.goalThreshold ?? 1;
  const findings = await findDuplicateGroups();
  const exceededThreshold = findings.length >= goalThreshold;
  const lines = [
    `${findings.length} probable duplicate group${findings.length === 1 ? "" : "s"} detected (string + embedding similarity within the same type).`,
    "",
    "Review at /optimize and merge or rename. Each merge re-points incoming + outgoing edges to the canonical entity and deletes the duplicate.",
    "",
    "Groups (top 10):",
    ...findings.slice(0, 10).map((g, i) => {
      const top = g.candidates[0];
      const conf = top ? `${(top.confidence * 100).toFixed(0)}%` : "?";
      const cands = g.candidates.map((c) => `${c.entity.name} (${c.entity.slug})`).join(" + ");
      return `${i + 1}. [${g.canonical.type}] canonical=${g.canonical.name} (${g.canonical.slug}) — top candidate confidence ${conf} — ${cands}`;
    }),
  ];
  return {
    kind: "dedupe",
    title: systemGoalTitle("dedupe", findings.length),
    findings,
    threshold: goalThreshold,
    exceededThreshold,
    goalDescription: lines.join("\n"),
  };
}

// ─── audit edges ───────────────────────────────────────────────────

export interface EdgeAuditScanOptions {
  /** Minimum flagged-edge count before creating a goal. Default 10. */
  goalThreshold?: number;
}

export async function scanWrongEdges(
  options: EdgeAuditScanOptions = {},
): Promise<ScanResult<EdgeAuditFinding>> {
  const goalThreshold = options.goalThreshold ?? 10;
  const findings = await auditEdges();
  const wrong = findings.filter((f) => f.severity === "wrong");
  const suspect = findings.filter((f) => f.severity === "suspect");
  const exceededThreshold = findings.length >= goalThreshold;
  const lines = [
    `${findings.length} edge${findings.length === 1 ? "" : "s"} flagged: ${wrong.length} WRONG (incompatible source-type), ${suspect.length} SUSPECT (non-canonical relation).`,
    "",
    "Review at /optimize. Suspect edges have suggested fixes that can be auto-applied; wrong edges need manual decisions.",
    "",
    "Sample (first 10):",
    ...findings.slice(0, 10).map(
      (f) =>
        `- ${f.severity.toUpperCase()}  [${f.from.type}] ${f.from.slug} --[${f.edge.relation}]--> [${f.to.type}] ${f.to.slug}${f.suggestion ? ` (suggest: ${f.suggestion})` : ""}`,
    ),
  ];
  return {
    kind: "audit-edges",
    title: systemGoalTitle("audit-edges", findings.length),
    findings,
    threshold: goalThreshold,
    exceededThreshold,
    goalDescription: lines.join("\n"),
  };
}

// ─── contradictions ────────────────────────────────────────────────

export interface ContradictionScanWrapOptions {
  /** Minimum contradiction count before creating a goal. Default 1 — even one is worth surfacing. */
  goalThreshold?: number;
  /** Types to audit. Default rule + decision + lesson. */
  types?: ReadonlyArray<string>;
  /** Pgvector candidate-pair distance cap. Default 0.25. */
  distanceThreshold?: number;
  /** Hard cap on pairs the LLM judges. Default 100. */
  maxPairs?: number;
}

export async function scanContradictions(
  options: ContradictionScanWrapOptions = {},
): Promise<ScanResult<ContradictionFinding>> {
  const goalThreshold = options.goalThreshold ?? 1;
  const scanOpts: ContradictionScanOptions = {
    types: options.types ?? DEFAULT_CONTRADICTION_TYPES,
  };
  if (options.distanceThreshold !== undefined) scanOpts.distanceThreshold = options.distanceThreshold;
  if (options.maxPairs !== undefined) scanOpts.maxPairs = options.maxPairs;
  const scan = await runContradictionScan(scanOpts);
  const findings = scan.contradictions;
  const exceededThreshold = findings.length >= goalThreshold;
  const major = findings.filter((f) => f.severity === "major");
  const minor = findings.filter((f) => f.severity === "minor");
  const lines = [
    `${findings.length} contradiction${findings.length === 1 ? "" : "s"} found across ${scan.candidatesEvaluated} candidate pair${scan.candidatesEvaluated === 1 ? "" : "s"}.`,
    `  Major: ${major.length}  ·  Minor: ${minor.length}`,
    "",
    "Review at /optimize. Each contradiction shows the two conflicting entities + a one-sentence explanation; resolve by editing one or both.",
    "",
    "Top 10:",
    ...findings
      .slice(0, 10)
      .map(
        (f, i) =>
          `${i + 1}. ${f.severity.toUpperCase()}  [${f.pair.type}]  ${f.pair.aSlug} ↔ ${f.pair.bSlug}\n   ${f.explanation}`,
      ),
  ];
  return {
    kind: "contradictions",
    title: systemGoalTitle("contradictions", findings.length),
    findings,
    threshold: goalThreshold,
    exceededThreshold,
    goalDescription: lines.join("\n"),
  };
}

// ─── runner ────────────────────────────────────────────────────────

export interface MaintenanceRunResult {
  scan: { kind: ScanKind; findingsCount: number; threshold: number; exceededThreshold: boolean };
  goal: { action: "created" | "updated" | "completed" | "noop"; goalId: string | null };
}

/**
 * Run a scan and upsert its system goal in one shot. Used by every cron
 * route — they're thin wrappers that pick a scan and serialize the
 * result back as JSON.
 *
 * Every invocation logs to the maintenance_runs table so /goals can show
 * "Decay: last ran 6h ago, 0 findings" even when no goal was created.
 */
export async function runMaintenance(kind: ScanKind): Promise<MaintenanceRunResult> {
  const startedAt = Date.now();
  const scan =
    kind === "decay"
      ? await scanDecay()
      : kind === "dedupe"
        ? await scanDuplicates()
        : kind === "audit-edges"
          ? await scanWrongEdges()
          : await scanContradictions();
  const goal = await upsertSystemGoal(scan);
  const durationMs = Date.now() - startedAt;

  // Log the run regardless of outcome — zero-finding runs are the whole
  // reason this table exists.
  try {
    await db.insert(maintenanceRuns).values({
      kind: scan.kind,
      findingsCount: scan.findings.length,
      threshold: scan.threshold,
      exceededThreshold: scan.exceededThreshold,
      goalAction: goal.action,
      goalId: goal.goalId,
      durationMs,
    });
  } catch (err) {
    // Don't let logging failure mask a successful scan.
    console.error(`[maintenance] failed to log run for ${kind}:`, err);
  }

  return {
    scan: {
      kind: scan.kind,
      findingsCount: scan.findings.length,
      threshold: scan.threshold,
      exceededThreshold: scan.exceededThreshold,
    },
    goal,
  };
}

export interface RecentRun {
  id: string;
  kind: ScanKind;
  ranAt: Date;
  findingsCount: number;
  exceededThreshold: boolean;
  goalAction: "created" | "updated" | "completed" | "noop";
  durationMs: number;
}

/**
 * Returns the N most recent maintenance runs (default 20). Used by the
 * /goals page to render a "Recent cron activity" panel.
 */
export async function listRecentRuns(limit = 20): Promise<RecentRun[]> {
  const rows = await db
    .select()
    .from(maintenanceRuns)
    .orderBy(sql`${maintenanceRuns.ranAt} DESC`)
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ScanKind,
    ranAt: new Date(r.ranAt),
    findingsCount: r.findingsCount,
    exceededThreshold: r.exceededThreshold,
    goalAction: r.goalAction as RecentRun["goalAction"],
    durationMs: r.durationMs,
  }));
}

/**
 * Returns the most recent run for each kind. If a kind has never run,
 * it's absent from the result.
 */
export async function lastRunByKind(): Promise<Record<string, RecentRun | undefined>> {
  const res = await db.execute<{
    id: string;
    kind: string;
    ran_at: string;
    findings_count: number;
    exceeded_threshold: boolean;
    goal_action: string;
    duration_ms: number;
  }>(sql`
    SELECT DISTINCT ON (kind)
      id, kind::text AS kind, ran_at::text AS ran_at,
      findings_count, exceeded_threshold,
      goal_action, duration_ms
    FROM ${maintenanceRuns}
    ORDER BY kind, ran_at DESC
  `);
  const out: Record<string, RecentRun | undefined> = {};
  for (const r of res.rows) {
    out[r.kind] = {
      id: r.id,
      kind: r.kind as ScanKind,
      ranAt: new Date(r.ran_at),
      findingsCount: r.findings_count,
      exceededThreshold: r.exceeded_threshold,
      goalAction: r.goal_action as RecentRun["goalAction"],
      durationMs: r.duration_ms,
    };
  }
  return out;
}
