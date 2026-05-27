"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addProjectAction, type AddProjectFormState } from "../actions";
import { FolderPicker } from "./FolderPicker";

const INITIAL: AddProjectFormState = { ok: false, message: "" };

export function AddProjectForm() {
  const [state, formAction, pending] = useActionState(addProjectAction, INITIAL);
  const [isClient, setIsClient] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelect = (selected: string) => {
    setProjectPath(selected);
    setPickerOpen(false);
  };

  // The picker should start in the parent of whatever's typed (so the user sees
  // the typed dir as one option), else fall back to c:/Users/samws/ on Windows
  // or the homedir on other platforms (server resolves the default).
  const initialPickerPath = projectPath
    ? safeParentDir(projectPath)
    : "C:/Users/samws";

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="path-input" className="block text-sm text-zinc-300">
          Project path
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="path-input"
            type="text"
            name="path"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder="C:/Users/samws/some-project"
            required
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            {pickerOpen ? "Close ✕" : "Browse 📁"}
          </button>
        </div>
        <span className="mt-1 block text-xs text-zinc-500">
          Type the absolute path or click Browse to pick from your filesystem.
        </span>
        {pickerOpen ? (
          <FolderPicker
            initialPath={initialPickerPath}
            onSelect={handleSelect}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Brand name (optional)"
          hint="Defaults to package.json.name or directory basename."
          name="name"
          placeholder="e.g. Kasuri"
        />
        <Field
          label="Slug (optional)"
          hint="Defaults to kebab-cased dir basename. Must be unique."
          name="slug"
          placeholder="e.g. kasuri"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          name="clientWork"
          checked={isClient}
          onChange={(e) => setIsClient(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500"
        />
        This is KumoKodo Studio client work (not a KumoKodo product)
      </label>

      {isClient ? (
        <div className="grid grid-cols-2 gap-4 rounded-md border border-amber-900/40 bg-amber-950/20 p-4">
          <Field label="Client (immediate counterparty)" name="client" placeholder="e.g. Navioniq" />
          <Field label="End-customer" name="endClient" placeholder="e.g. Clint" />
        </div>
      ) : null}

      <details className="text-sm text-zinc-400">
        <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Advanced options</summary>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="skipExtraction" className="h-4 w-4 rounded border-zinc-700 bg-zinc-900" />
            Skip LLM extraction (faster, but no sub-entities or edges)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="skipAutoMemory" className="h-4 w-4 rounded border-zinc-700 bg-zinc-900" />
            Skip per-project Claude auto-memory ingest
          </label>
        </div>
      </details>

      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">← Cancel</Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-900/60 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to brain"}
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
            <Link href={`/entities/${state.slug}`} className="ml-2 underline">
              View
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.ok && state.matchingPlaybooks && state.matchingPlaybooks.length > 0 ? (
        <div className="rounded-md border border-cyan-900 bg-cyan-950/30 p-4 text-sm">
          <p className="mb-3 text-cyan-200">
            <strong>{state.matchingPlaybooks.length} playbook(s)</strong> match this{" "}
            <code className="rounded bg-cyan-950 px-1 text-cyan-300">
              {state.wasNew ? "project_created" : "project_updated"}
            </code>{" "}
            event:
          </p>
          <ul className="space-y-3">
            {state.matchingPlaybooks.map((pb) => (
              <li key={pb.invocationId ?? pb.slug} className="rounded border border-cyan-900/60 bg-zinc-950 p-3">
                <div className="mb-2 flex items-baseline gap-2">
                  <Link
                    href={`/playbooks/${pb.slug}`}
                    className="text-zinc-100 hover:text-emerald-400"
                  >
                    {pb.name}
                  </Link>
                  <code className="text-xs text-zinc-600">{pb.slug}</code>
                  {pb.invocationId ? (
                    <Link
                      href={`/playbooks/runs/${pb.invocationId}`}
                      className="ml-auto rounded border border-cyan-900 bg-cyan-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-950/70"
                    >
                      open run →
                    </Link>
                  ) : null}
                </div>
                <ol className="space-y-0.5 text-xs text-zinc-300">
                  {pb.actions.map((a, i) => (
                    <li key={i}>
                      <span className="text-zinc-600">{i + 1}.</span> {a}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-cyan-300">
            Each playbook firing was recorded as a tracked run.{" "}
            <Link href="/playbooks/runs" className="underline hover:text-cyan-200">
              See all runs →
            </Link>
          </p>
        </div>
      ) : null}
    </form>
  );
}

function safeParentDir(p: string): string {
  // Browser-safe parent-dir: strip trailing slashes, then everything after the last separator.
  const trimmed = p.replace(/[\\/]+$/, "");
  const lastSep = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (lastSep <= 2) return trimmed; // e.g. "C:/" — don't go above the drive
  return trimmed.slice(0, lastSep);
}

function Field({
  label,
  name,
  placeholder,
  hint,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type="text"
        name={name}
        placeholder={placeholder}
        required={required}
        className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
      />
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}
