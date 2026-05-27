"use client";

// Beta request form — the marketing site's primary conversion surface.
//
// Visually restrained to fit the "scholar's scroll meets terminal" tone:
// thin zinc-bordered inputs, mono labels in the gutter, the vermilion
// seal as the submit button. Validation errors render in vermilion
// (same accent — error and CTA share the visual semantics of "look
// here, this matters").

import { useActionState } from "react";
import { requestBetaAccessAction, type BetaRequestState } from "../actions/beta";

const INITIAL: BetaRequestState = { ok: false, message: "" };

export function BetaRequestForm() {
  const [state, formAction, pending] = useActionState(requestBetaAccessAction, INITIAL);

  return (
    <form action={formAction} className="mt-10 grid gap-4">
      <label className="grid gap-1.5">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
          01 · Name
        </span>
        <input
          type="text"
          name="name"
          required
          maxLength={120}
          disabled={pending || state.ok}
          autoComplete="name"
          className="w-full border-b border-zinc-700 bg-transparent py-2 text-zinc-100 placeholder:text-zinc-700 focus:border-vermilion focus:outline-none disabled:opacity-50"
          placeholder="Your name"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
          02 · Email
        </span>
        <input
          type="email"
          name="email"
          required
          disabled={pending || state.ok}
          autoComplete="email"
          className="w-full border-b border-zinc-700 bg-transparent py-2 text-zinc-100 placeholder:text-zinc-700 focus:border-vermilion focus:outline-none disabled:opacity-50"
          placeholder="you@example.com"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
          03 · What are you building? <span className="text-zinc-700">(optional)</span>
        </span>
        <textarea
          name="message"
          rows={3}
          maxLength={2000}
          disabled={pending || state.ok}
          className="w-full resize-none border-b border-zinc-700 bg-transparent py-2 text-zinc-100 placeholder:text-zinc-700 focus:border-vermilion focus:outline-none disabled:opacity-50"
          placeholder="One sentence on your portfolio / agents / use case."
        />
      </label>

      <div className="flex items-center justify-between gap-6 pt-3">
        {state.message ? (
          <p
            className={`font-mono text-xs ${
              state.ok ? "text-emerald-400" : "text-vermilion"
            }`}
            role={state.ok ? "status" : "alert"}
          >
            {state.message}
          </p>
        ) : (
          <span className="text-xs text-zinc-600">
            Manually triaged. No marketing list, no automated drip.
          </span>
        )}
        <button
          type="submit"
          disabled={pending || state.ok}
          className="inline-flex items-center gap-2 border-2 border-vermilion bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-vermilion transition-all duration-300 hover:rotate-0 hover:scale-[1.02] hover:bg-vermilion hover:text-zinc-50 disabled:opacity-40"
          style={{ transform: "rotate(-2deg)" }}
        >
          {pending ? "Submitting…" : state.ok ? "Received ✓" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
