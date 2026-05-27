"use client";

import { useState, useTransition } from "react";
import {
  applyAllAuditFixesAction,
  applyEdgeFixAction,
  mergeEntitiesAction,
  runContradictionScanAction,
  touchEntityAction,
} from "../actions";

export function ApplyAllFixesButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  if (count === 0) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Apply ${count} suggested edge-relation fix(es)?`)) return;
        startTransition(async () => {
          await applyAllAuditFixesAction();
        });
      }}
      className="rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-100 transition hover:bg-emerald-900/60 disabled:opacity-50"
    >
      {pending ? "Applying…" : `Apply all ${count} fixes`}
    </button>
  );
}

export function FixEdgeButton({
  edgeId,
  newRelation,
}: {
  edgeId: string;
  newRelation: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        startTransition(() => {
          applyEdgeFixAction(formData);
        });
      }}
    >
      <input type="hidden" name="edgeId" value={edgeId} />
      <input type="hidden" name="newRelation" value={newRelation} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-emerald-400 transition hover:text-emerald-200 disabled:opacity-50"
      >
        {pending ? "…" : `→ ${newRelation}`}
      </button>
    </form>
  );
}

export function MergeButton({
  canonicalId,
  duplicateId,
  canonicalName,
  duplicateName,
}: {
  canonicalId: string;
  duplicateId: string;
  canonicalName: string;
  duplicateName: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        if (!window.confirm(`Merge "${duplicateName}" INTO "${canonicalName}"?\n\nAll edges re-pointed, then "${duplicateName}" deleted. Cannot be undone.`)) return;
        startTransition(() => {
          mergeEntitiesAction(formData);
        });
      }}
    >
      <input type="hidden" name="canonicalId" value={canonicalId} />
      <input type="hidden" name="duplicateId" value={duplicateId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-900 bg-red-950/40 px-2 py-0.5 text-xs text-red-200 transition hover:bg-red-950/70 disabled:opacity-50"
      >
        {pending ? "merging…" : "merge"}
      </button>
    </form>
  );
}

export function TouchButton({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        startTransition(() => {
          touchEntityAction(formData);
        });
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-zinc-400 transition hover:text-emerald-400 disabled:opacity-50"
      >
        {pending ? "touching…" : "mark validated"}
      </button>
    </form>
  );
}

interface ScanResult {
  findingsCount: number;
  threshold: number;
  exceededThreshold: boolean;
  goalAction: "created" | "updated" | "completed" | "noop";
}

export function RunContradictionScanButton() {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<ScanResult | null>(null);

  const goalLabel: Record<ScanResult["goalAction"], string> = {
    created: "system goal created",
    updated: "system goal updated",
    completed: "system goal completed (no contradictions remain)",
    noop: "no changes — nothing to surface",
  };

  return (
    <div className="flex items-baseline gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const r = await runContradictionScanAction();
            setLast({
              findingsCount: r.scan.findingsCount,
              threshold: r.scan.threshold,
              exceededThreshold: r.scan.exceededThreshold,
              goalAction: r.goal.action,
            });
          });
        }}
        className="rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-100 transition hover:bg-emerald-900/60 disabled:opacity-50"
      >
        {pending ? "Scanning… (30–60s)" : "Run contradiction scan now"}
      </button>
      {last ? (
        <span className="text-xs text-zinc-500">
          last run: <strong className="text-zinc-300">{last.findingsCount}</strong> contradiction
          {last.findingsCount === 1 ? "" : "s"} found · {goalLabel[last.goalAction]}
        </span>
      ) : null}
    </div>
  );
}
