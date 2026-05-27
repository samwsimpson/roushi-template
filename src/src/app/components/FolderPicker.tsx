"use client";

import { useEffect, useState, useTransition } from "react";
import { listDirectoryAction, type ListDirectoryResult } from "../actions";

interface Props {
  /** Initial directory to open. Defaults to home if empty. */
  initialPath?: string;
  /** Called when user clicks "Select" on a directory. */
  onSelect: (path: string) => void;
  /** Called when user closes the picker without selecting. */
  onClose?: () => void;
}

export function FolderPicker({ initialPath, onSelect, onClose }: Props) {
  const [result, setResult] = useState<ListDirectoryResult | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (path: string) => {
    startTransition(async () => {
      const r = await listDirectoryAction(path);
      setResult(r);
    });
  };

  useEffect(() => {
    load(initialPath ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => result?.parent && load(result.parent)}
          disabled={!result?.parent || pending}
          className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
        >
          ↑ Up
        </button>
        <span className="font-mono text-zinc-400 truncate flex-1" title={result?.path}>
          {result?.path ?? "loading…"}
        </span>
        <button
          type="button"
          onClick={() => result?.path && onSelect(result.path)}
          disabled={!result?.path}
          className="rounded border border-emerald-700 bg-emerald-900/40 px-2 py-0.5 text-emerald-100 transition hover:bg-emerald-900/60"
        >
          Select this folder
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            ×
          </button>
        ) : null}
      </div>

      {result?.error ? (
        <div className="p-3 text-sm text-red-400">{result.error}</div>
      ) : null}

      <div className="max-h-80 overflow-y-auto">
        {pending && !result ? (
          <div className="p-3 text-sm text-zinc-500">Loading…</div>
        ) : !result || result.entries.length === 0 ? (
          <div className="p-3 text-sm text-zinc-500">No subdirectories.</div>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {result.entries.map((entry) => (
              <li
                key={entry.path}
                className="flex items-center gap-3 px-3 py-1.5 transition hover:bg-zinc-900/50"
              >
                <button
                  type="button"
                  onClick={() => load(entry.path)}
                  className="flex-1 truncate text-left text-sm text-zinc-200 transition hover:text-emerald-400"
                  title={entry.path}
                >
                  <span className="text-zinc-600">📁</span> {entry.name}
                </button>
                {entry.hasProjectSignals ? (
                  <span className="rounded bg-emerald-950/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                    project
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelect(entry.path)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-200 transition hover:border-zinc-500"
                >
                  select
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-[11px] text-zinc-500">
        Click a folder name to navigate in. Click "select" to use it as the project path.
      </div>
    </div>
  );
}
