"use client";

import { useTransition } from "react";
import { removeEntityAction } from "../actions";

interface Props {
  slug: string;
  name: string;
}

export function RemoveEntityForm({ slug, name }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        const confirmed = window.confirm(
          `Remove "${name}" (${slug}) from the brain?\n\nThis also removes all edges to/from it. Cannot be undone.`,
        );
        if (!confirmed) return;
        startTransition(() => {
          removeEntityAction(formData);
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
