"use server";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { entities } from "../db/schema";
import { applyAllSuggestedFixes, applyEdgeFix } from "../lib/audit";
import { touchEntity as touchEntityImpl } from "../lib/decay";
import { mergeEntities as mergeEntitiesImpl } from "../lib/dedupe";
import { addProject as addProjectImpl } from "../lib/discovery";
import {
  abandonInvocation as abandonInvocationImpl,
  updateActionStatus as updateActionStatusImpl,
  type ActionStatus,
} from "../lib/invocations";
import {
  createPlaybook as createPlaybookImpl,
  deletePlaybook as deletePlaybookImpl,
  PLAYBOOK_TRIGGERS,
  type PlaybookTrigger,
} from "../lib/playbooks";

export interface MatchingPlaybookSummary {
  slug: string;
  name: string;
  actions: string[];
  /** Invocation id created for this playbook firing — links to /playbooks/runs/<id>. */
  invocationId?: string;
}

export interface AddProjectFormState {
  ok: boolean;
  message: string;
  slug?: string;
  matchingPlaybooks?: MatchingPlaybookSummary[];
  wasNew?: boolean;
}

export async function addProjectAction(
  _prev: AddProjectFormState,
  formData: FormData,
): Promise<AddProjectFormState> {
  const path = String(formData.get("path") ?? "").trim();
  if (!path) return { ok: false, message: "Path is required." };

  const name = String(formData.get("name") ?? "").trim() || undefined;
  const slug = String(formData.get("slug") ?? "").trim() || undefined;
  const isClientWork = formData.get("clientWork") === "on";
  const client = String(formData.get("client") ?? "").trim() || undefined;
  const endClient = String(formData.get("endClient") ?? "").trim() || undefined;
  const skipExtraction = formData.get("skipExtraction") === "on";
  const skipAutoMemory = formData.get("skipAutoMemory") === "on";

  try {
    const result = await addProjectImpl({
      path,
      name,
      slug,
      isClientWork,
      client,
      endClient,
      skipExtraction,
      skipAutoMemory,
    });
    revalidatePath("/");
    revalidatePath(`/entities/${result.entity.slug}`);
    return {
      ok: true,
      message: `${result.wasNew ? "Added" : "Refreshed"} ${result.entity.name} (${result.entity.slug}). ${result.extractedEntities} sub-entities, ${result.extractedEdges} edges, ${result.ingestedMemoryFiles} memory files.`,
      slug: result.entity.slug,
      wasNew: result.wasNew,
      matchingPlaybooks: result.matchingPlaybooks.map((p, idx) => ({
        slug: p.slug,
        name: p.name,
        actions: p.actions,
        invocationId: result.invocations[idx]?.id,
      })),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Playbook server actions ──────────────────────────────────────

export interface PlaybookFormState {
  ok: boolean;
  message: string;
  slug?: string;
}

export async function createPlaybookAction(
  _prev: PlaybookFormState,
  formData: FormData,
): Promise<PlaybookFormState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const trigger = String(formData.get("trigger") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || undefined;
  const filterRaw = String(formData.get("filter") ?? "").trim();
  const appliesToSlugsRaw = String(formData.get("appliesToSlugs") ?? "").trim();
  const active = formData.get("active") === "on";
  const actionsRaw = String(formData.get("actions") ?? "").trim();

  if (!slug) return { ok: false, message: "Slug is required." };
  if (!name) return { ok: false, message: "Name is required." };
  if (!(PLAYBOOK_TRIGGERS as readonly string[]).includes(trigger)) {
    return { ok: false, message: `Trigger must be one of: ${PLAYBOOK_TRIGGERS.join(", ")}` };
  }

  // Actions are one per line. Blank lines stripped.
  const actions = actionsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (actions.length === 0) return { ok: false, message: "At least one action is required." };

  let filter: Record<string, unknown> = {};
  if (filterRaw) {
    try {
      filter = JSON.parse(filterRaw);
    } catch {
      return { ok: false, message: "Filter must be valid JSON or empty." };
    }
  }
  const appliesToSlugs = appliesToSlugsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const row = await createPlaybookImpl({
      slug,
      name,
      trigger: trigger as PlaybookTrigger,
      actions,
      description,
      filter,
      appliesToSlugs,
      active,
    });
    revalidatePath("/playbooks");
    revalidatePath(`/playbooks/${row.slug}`);
    return { ok: true, message: `Saved ${row.name} (${row.slug}).`, slug: row.slug };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function removePlaybookAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  await deletePlaybookImpl(slug);
  revalidatePath("/playbooks");
  revalidatePath(`/playbooks/${slug}`);
}

// ─── optimize server actions ──────────────────────────────────────

export async function applyAllAuditFixesAction(): Promise<{ applied: number; skipped: number }> {
  const r = await applyAllSuggestedFixes();
  revalidatePath("/optimize");
  return r;
}

export async function runContradictionScanAction(): Promise<{
  scan: { findingsCount: number; threshold: number; exceededThreshold: boolean };
  goal: { action: "created" | "updated" | "completed" | "noop"; goalId: string | null };
}> {
  const { runMaintenance } = await import("../lib/maintenance");
  const result = await runMaintenance("contradictions");
  revalidatePath("/optimize");
  revalidatePath("/goals");
  return result;
}

export async function applyEdgeFixAction(formData: FormData): Promise<void> {
  const edgeId = String(formData.get("edgeId") ?? "").trim();
  const newRelation = String(formData.get("newRelation") ?? "").trim();
  if (!edgeId || !newRelation) return;
  await applyEdgeFix(edgeId, newRelation as never);
  revalidatePath("/optimize");
}

export async function mergeEntitiesAction(formData: FormData): Promise<void> {
  const canonicalId = String(formData.get("canonicalId") ?? "").trim();
  const duplicateId = String(formData.get("duplicateId") ?? "").trim();
  if (!canonicalId || !duplicateId) return;
  await mergeEntitiesImpl(canonicalId, duplicateId);
  revalidatePath("/optimize");
  revalidatePath("/");
}

export async function touchEntityAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  await touchEntityImpl(slug);
  revalidatePath("/optimize");
  revalidatePath(`/entities/${slug}`);
}

// ─── invocation actions ───────────────────────────────────────────

export async function setActionStatusAction(formData: FormData): Promise<void> {
  const invocationId = String(formData.get("invocationId") ?? "").trim();
  const actionIndex = Number(formData.get("actionIndex") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  if (!invocationId || Number.isNaN(actionIndex) || !status) return;
  await updateActionStatusImpl({
    invocationId,
    actionIndex,
    status: status as ActionStatus,
    notes,
    completedBy: "web",
  });
  revalidatePath("/playbooks/runs");
  revalidatePath(`/playbooks/runs/${invocationId}`);
}

export async function abandonInvocationAction(formData: FormData): Promise<void> {
  const invocationId = String(formData.get("invocationId") ?? "").trim();
  if (!invocationId) return;
  await abandonInvocationImpl(invocationId);
  revalidatePath("/playbooks/runs");
  revalidatePath(`/playbooks/runs/${invocationId}`);
}

export async function removeEntityAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  await db.delete(entities).where(sql`${entities.slug} = ${slug}`);
  revalidatePath("/");
  revalidatePath(`/entities/${slug}`);
}

export interface DirEntry {
  name: string;
  path: string;
  hasProjectSignals: boolean;
}

export interface ListDirectoryResult {
  ok: boolean;
  path: string;
  parent: string | null;
  entries: DirEntry[];
  error?: string;
}

const SKIP_DIRS_PICKER = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".pnpm-store",
  "dist",
  "build",
  ".cache",
]);

export async function listDirectoryAction(rawPath: string): Promise<ListDirectoryResult> {
  // Default to the user's home dir when no path is provided.
  const target = rawPath?.trim() ? path.resolve(rawPath.trim()) : os.homedir();

  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) {
      return { ok: false, path: target, parent: null, entries: [], error: "Not a directory" };
    }

    const dirents = await fs.readdir(target, { withFileTypes: true });
    const entries: DirEntry[] = [];
    for (const ent of dirents) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith(".") && ent.name !== ".claude") continue;
      if (SKIP_DIRS_PICKER.has(ent.name)) continue;
      const childPath = path.join(target, ent.name);
      const hasProjectSignals = await hasAnyProjectSignal(childPath);
      entries.push({ name: ent.name, path: childPath, hasProjectSignals });
    }

    // Sort: project candidates first (alpha), then everything else (alpha).
    entries.sort((a, b) => {
      if (a.hasProjectSignals !== b.hasProjectSignals) return a.hasProjectSignals ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const parent = path.dirname(target);
    return {
      ok: true,
      path: target,
      parent: parent !== target ? parent : null,
      entries: entries.slice(0, 500),
    };
  } catch (err) {
    return {
      ok: false,
      path: target,
      parent: null,
      entries: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function hasAnyProjectSignal(dir: string): Promise<boolean> {
  for (const marker of ["CLAUDE.md", "package.json", ".git"]) {
    try {
      await fs.access(path.join(dir, marker));
      return true;
    } catch {
      // Not present — try next marker.
    }
  }
  return false;
}

export async function refreshProjectAction(formData: FormData): Promise<void> {
  const path = String(formData.get("path") ?? "").trim();
  if (!path) return;
  await addProjectImpl({ path });
  revalidatePath("/");
  const slug = String(formData.get("slug") ?? "").trim();
  if (slug) {
    revalidatePath(`/entities/${slug}`);
    redirect(`/entities/${slug}`);
  }
}
