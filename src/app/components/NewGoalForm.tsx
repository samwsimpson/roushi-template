"use client";

import { useActionState } from "react";
import { createGoalAction, type CreateGoalFormState } from "../goals/actions";

const INITIAL: CreateGoalFormState = { ok: false, message: "" };

export function NewGoalForm() {
  const [state, formAction, pending] = useActionState(createGoalAction, INITIAL);

  return (
    <form action={formAction} className="mb-10 space-y-3 rounded-md border border-zinc-900 bg-zinc-950 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <input
          type="text"
          name="title"
          required
          placeholder="What's the goal? (e.g. Ship Roushi v0.5 — agent-side rule writer)"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
        <input
          type="date"
          name="targetDate"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
        />
      </div>
      <textarea
        name="description"
        rows={2}
        placeholder="Optional: more context — why this goal matters, success criteria, blockers"
        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
      />
      <input
        type="text"
        name="relatedSlugs"
        placeholder="Optional: comma-separated entity slugs this goal touches (e.g. roushi, kodori)"
        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
      />
      {state.message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-900 bg-emerald-950/40 text-emerald-200"
              : "border-rose-900 bg-rose-950/40 text-rose-200"
          }`}
        >
          {state.message}
        </p>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-600">
          Goals are searchable in the brain and surface on the homepage. CLI: <code className="text-zinc-500">pnpm roushi goal add</code>.
        </span>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-100 transition hover:bg-emerald-900/60 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add goal"}
        </button>
      </div>
    </form>
  );
}
