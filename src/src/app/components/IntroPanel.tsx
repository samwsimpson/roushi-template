"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

interface Props {
  /** Unique storage key — different per page. */
  storageKey: string;
  title: string;
  children: ReactNode;
  /** Optional link to the relevant /help anchor for "Learn more". */
  helpAnchor?: string;
}

export function IntroPanel({ storageKey, title, children, helpAnchor }: Props) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    // Read localStorage once on mount. Defaults to "not dismissed" so first-time
    // viewers always see the panel.
    try {
      setDismissed(localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  // Avoid SSR/hydration flash — return null until we know the dismissed state.
  if (dismissed === null || dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // localStorage disabled (privacy mode); just hide for this view.
    }
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <h2 className="font-medium text-zinc-100">{title}</h2>
          <div className="leading-relaxed text-zinc-400">{children}</div>
          {helpAnchor ? (
            <p className="pt-1">
              <Link
                href={`/help${helpAnchor}`}
                className="text-xs text-emerald-400 hover:underline"
              >
                Learn more in Help →
              </Link>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 text-xs text-zinc-500 transition hover:text-zinc-200"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
