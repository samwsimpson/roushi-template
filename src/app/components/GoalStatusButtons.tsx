"use client";

// Status-transition buttons on each goal row. Each button submits a tiny
// form to `updateGoalStatusAction` (defined in src/app/goals/actions.ts).
// Destructive moves (abandon) prompt for confirmation; reversible ones
// (complete, block, reopen) don't.

import { useTransition } from "react";
import { updateGoalStatusAction } from "../goals/actions";

type Status = "active" | "completed" | "blocked" | "abandoned";

interface Props {
  goalId: string;
  current: Status;
  /** Hide buttons for system-managed goals — the cron owns those. */
  systemManaged?: boolean;
}

export function GoalStatusButtons({ goalId, current, systemManaged }: Props) {
  const [pending, startTransition] = useTransition();

  if (systemManaged) {
    return (
      <span className="text-[10px] uppercase tracking-wide text-zinc-600" title="The maintenance cron closes this goal automatically when the next scan finds zero issues.">
        cron-managed
      </span>
    );
  }

  const submit = (next: Status, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    const fd = new FormData();
    fd.set("id", goalId);
    fd.set("status", next);
    startTransition(() => {
      updateGoalStatusAction(fd);
    });
  };

  const btn = "rounded border px-2 py-0.5 text-[11px] transition disabled:opacity-50";

  return (
    <div className="flex items-center gap-1.5">
      {current !== "completed" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("completed")}
          className={`${btn} border-emerald-900 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/70`}
        >
          {pending ? "…" : "✓ done"}
        </button>
      ) : null}
      {current === "active" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("blocked")}
          className={`${btn} border-amber-900 bg-amber-950/40 text-amber-300 hover:bg-amber-950/70`}
        >
          {pending ? "…" : "block"}
        </button>
      ) : null}
      {current === "blocked" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("active")}
          className={`${btn} border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800`}
        >
          {pending ? "…" : "unblock"}
        </button>
      ) : null}
      {current === "completed" || current === "abandoned" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("active")}
          className={`${btn} border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800`}
        >
          {pending ? "…" : "reopen"}
        </button>
      ) : null}
      {current !== "abandoned" && current !== "completed" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("abandoned", "Abandon this goal? It stays in the DB but won't surface unless you toggle 'Show abandoned'.")}
          className={`${btn} border-zinc-900 bg-zinc-950 text-zinc-500 hover:text-zinc-300`}
        >
          {pending ? "…" : "abandon"}
        </button>
      ) : null}
    </div>
  );
}
