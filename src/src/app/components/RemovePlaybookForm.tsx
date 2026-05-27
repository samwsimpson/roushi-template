"use client";

import { useTransition } from "react";
import { removePlaybookAction } from "../actions";

export function RemovePlaybookForm({ slug, name }: { slug: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        if (!window.confirm(`Remove playbook "${name}" (${slug})?\n\nCannot be undone.`)) return;
        startTransition(() => {
          removePlaybookAction(formData);
        });
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-zinc-500 transition hover:text-red-400 disabled:opacity-50"
      >
        {pending ? "removing…" : "remove"}
      </button>
    </form>
  );
}
