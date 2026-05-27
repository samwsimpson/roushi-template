"use client";

// Ask-the-master form with a visible Submit button and a "Thinking…"
// indicator that surfaces while we wait for the LLM round-trip (5-15s).
// Without this, hitting Enter felt like nothing was happening — the URL
// changed but the page sat blank during synthesis.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  /** Pre-filled query (used on the results page). */
  initialQuery?: string;
  /** Style variant — hero is the big homepage form; inline is the reuse on results pages. */
  variant?: "hero" | "inline";
}

export function AskForm({ initialQuery = "", variant = "hero" }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  const isHero = variant === "hero";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) return;
        startTransition(() => {
          router.push(`/?q=${encodeURIComponent(trimmed)}`);
        });
      }}
      className={isHero ? "mx-auto mt-8 max-w-xl" : "mb-2"}
    >
      <div className="flex items-stretch gap-2">
        <input
          type="search"
          name="q"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={pending}
          placeholder={isHero ? "Ask anything about the portfolio…" : ""}
          className={`flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-4 ${isHero ? "py-3 text-base" : "py-3 text-base"} text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-60`}
        />
        <button
          type="submit"
          disabled={pending || query.trim() === ""}
          className="shrink-0 rounded-md border border-emerald-700 bg-emerald-900/40 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-900/60 disabled:opacity-50"
        >
          {pending ? "Thinking…" : "Ask"}
        </button>
      </div>
      {pending ? (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-500">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span>
            Searching the brain and composing an answer with citations — usually 5–15 seconds.
          </span>
        </div>
      ) : null}
    </form>
  );
}
