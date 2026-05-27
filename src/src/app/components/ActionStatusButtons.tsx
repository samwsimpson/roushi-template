"use client";

import { useTransition } from "react";
import { abandonInvocationAction, setActionStatusAction } from "../actions";

const STATUS_LABELS: Record<string, string> = {
  completed: "✓ done",
  rejected: "skip",
  failed: "✗ failed",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "border-emerald-700 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60",
  rejected: "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
  failed: "border-red-900 bg-red-950/40 text-red-200 hover:bg-red-950/70",
};

export function SetActionStatusButton({
  invocationId,
  actionIndex,
  status,
  disabled,
}: {
  invocationId: string;
  actionIndex: number;
  status: "completed" | "rejected" | "failed";
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        startTransition(() => {
          setActionStatusAction(formData);
        });
      }}
    >
      <input type="hidden" name="invocationId" value={invocationId} />
      <input type="hidden" name="actionIndex" value={String(actionIndex)} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={pending || disabled}
        className={`rounded border px-2 py-0.5 text-xs transition disabled:opacity-40 ${STATUS_COLORS[status]}`}
      >
        {pending ? "…" : STATUS_LABELS[status]}
      </button>
    </form>
  );
}

export function AbandonInvocationButton({ invocationId, playbookName }: { invocationId: string; playbookName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        if (!window.confirm(`Abandon this invocation of "${playbookName}"?\n\nRemaining actions won't be acted on.`)) return;
        startTransition(() => {
          abandonInvocationAction(formData);
        });
      }}
    >
      <input type="hidden" name="invocationId" value={invocationId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-zinc-500 transition hover:text-red-400 disabled:opacity-40"
      >
        {pending ? "abandoning…" : "abandon"}
      </button>
    </form>
  );
}
