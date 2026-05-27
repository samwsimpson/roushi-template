"use client";

import { useActionState, useState } from "react";
import { createRuleAction, type CreateRuleFormState } from "../rules/actions";

const INITIAL: CreateRuleFormState = { ok: false, message: "" };

type ScopeKind = "slug" | "type" | "portfolio";

export function NewRuleForm() {
  const [state, formAction, pending] = useActionState(createRuleAction, INITIAL);
  const [scopeKind, setScopeKind] = useState<ScopeKind>("slug");

  return (
    <form action={formAction} className="space-y-5">
      <Field label="Slug" hint="lowercase, dashes only — used in URLs and filenames" required>
        <input
          type="text"
          name="slug"
          required
          placeholder="e.g. roushi-shipment-sweep"
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
      </Field>

      <Field label="Name" hint="human-readable title shown in lists and headers" required>
        <input
          type="text"
          name="name"
          required
          placeholder="e.g. Roushi shipment sweep"
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
      </Field>

      <Field label="Scope" hint="which workspaces this rule applies to">
        <input type="hidden" name="scopeKind" value={scopeKind} />
        <div className="space-y-2">
          <ScopeRadio
            kind="slug"
            selected={scopeKind}
            onChange={setScopeKind}
            label="A specific product"
          />
          <ScopeRadio
            kind="type"
            selected={scopeKind}
            onChange={setScopeKind}
            label="Every entity of a type"
          />
          <ScopeRadio
            kind="portfolio"
            selected={scopeKind}
            onChange={setScopeKind}
            label="Entire KumoKodo portfolio"
          />
        </div>
        {scopeKind === "slug" ? (
          <input
            type="text"
            name="scopeValue"
            required
            placeholder="product slug — e.g. roushi"
            className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        ) : scopeKind === "type" ? (
          <input
            type="text"
            name="scopeValue"
            required
            defaultValue="product"
            placeholder="entity type — typically: product"
            className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        ) : null}
      </Field>

      <Field label="Priority" hint="high rules flag visually; doesn't change behavior yet">
        <select
          name="priority"
          defaultValue="normal"
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
        >
          <option value="high">high</option>
          <option value="normal">normal</option>
          <option value="low">low</option>
        </select>
      </Field>

      <Field
        label="Body (markdown)"
        hint="the rule itself — write it for the agent that will read it"
        required
      >
        <textarea
          name="body"
          required
          rows={18}
          placeholder={`## When this rule applies\n\n…\n\n## How to apply\n\n…\n\n## Why\n\n…`}
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-700 focus:border-zinc-500 focus:outline-none"
        />
      </Field>

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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-900/60 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Create rule"}
        </button>
        <a href="/rules" className="text-sm text-zinc-500 transition hover:text-zinc-200">
          cancel
        </a>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-zinc-200">
          {label}
          {required ? <span className="ml-1 text-rose-400">*</span> : null}
        </span>
        {hint ? <span className="text-xs text-zinc-600">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ScopeRadio({
  kind,
  selected,
  onChange,
  label,
}: {
  kind: ScopeKind;
  selected: ScopeKind;
  onChange: (k: ScopeKind) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-zinc-300">
      <input
        type="radio"
        name="__scopeRadio"
        value={kind}
        checked={selected === kind}
        onChange={() => onChange(kind)}
        className="accent-emerald-500"
      />
      {label}
    </label>
  );
}
