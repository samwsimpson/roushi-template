"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createPlaybookAction, type PlaybookFormState } from "../actions";
import { PLAYBOOK_TRIGGERS } from "../../lib/playbooks";

const INITIAL: PlaybookFormState = { ok: false, message: "" };

interface Defaults {
  slug?: string;
  name?: string;
  description?: string;
  trigger?: string;
  actions?: string[];
  filter?: Record<string, unknown>;
  appliesToSlugs?: string[];
  active?: boolean;
}

export function PlaybookForm({ defaults }: { defaults?: Defaults }) {
  const [state, formAction, pending] = useActionState(createPlaybookAction, INITIAL);

  const initialActions = defaults?.actions?.join("\n") ?? "";
  const initialFilter =
    defaults?.filter && Object.keys(defaults.filter).length > 0
      ? JSON.stringify(defaults.filter, null, 2)
      : "";

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Slug"
          name="slug"
          required
          defaultValue={defaults?.slug ?? ""}
          placeholder="e.g. scaffold-project-docs"
          hint="kebab-case, unique. Used in URLs and CLI."
        />
        <Field
          label="Name"
          name="name"
          required
          defaultValue={defaults?.name ?? ""}
          placeholder="e.g. Scaffold project docs"
          hint="Human-readable label shown everywhere."
        />
      </div>

      <label className="block">
        <span className="text-sm text-zinc-300">Trigger event</span>
        <select
          name="trigger"
          required
          defaultValue={defaults?.trigger ?? "project_created"}
          className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          {PLAYBOOK_TRIGGERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm text-zinc-300">Description (optional)</span>
        <textarea
          name="description"
          defaultValue={defaults?.description ?? ""}
          rows={2}
          placeholder="What this playbook is for, when you'd want it to fire."
          className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </label>

      <label className="block">
        <span className="text-sm text-zinc-300">
          Actions <span className="text-zinc-500">(one per line, in order)</span>
        </span>
        <textarea
          name="actions"
          required
          rows={6}
          defaultValue={initialActions}
          placeholder={"Create STACK.md if it doesn't exist\nCreate PROJECT_SCOPE.md from the template\nAdd the project to the public /changelog page"}
          className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <span className="mt-1 block text-xs text-zinc-500">
          Each line is one step the agent (or you) should perform when this fires.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-zinc-300">Applies to slugs (optional)</span>
          <input
            type="text"
            name="appliesToSlugs"
            defaultValue={defaults?.appliesToSlugs?.join(",") ?? ""}
            placeholder="e.g. kodori,zoningai"
            className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Comma-separated. Leave empty to apply to all.
          </span>
        </label>
        <label className="block">
          <span className="text-sm text-zinc-300">Filter JSON (optional)</span>
          <input
            type="text"
            name="filter"
            defaultValue={initialFilter}
            placeholder='e.g. {"clientWork":false}'
            className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Keys checked against event context (entityType, entitySlug, or meta keys).
          </span>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          name="active"
          defaultChecked={defaults?.active ?? true}
          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500"
        />
        Active (uncheck to save as draft — playbook won't fire until activated)
      </label>

      <div className="flex items-center justify-between">
        <Link href="/playbooks" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-900/60 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save playbook"}
        </button>
      </div>

      {state.message ? (
        <div
          className={`rounded-md border p-3 text-sm ${
            state.ok
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
              : "border-red-900 bg-red-950/40 text-red-200"
          }`}
        >
          {state.message}
          {state.ok && state.slug ? (
            <Link href={`/playbooks/${state.slug}`} className="ml-2 underline">
              View
            </Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function Field({
  label,
  name,
  required,
  defaultValue,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type="text"
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
      />
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}
