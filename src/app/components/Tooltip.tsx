// CSS-only tooltip — no JS, no third-party lib. Renders an absolutely-
// positioned bubble below the trigger on hover/focus. Group-based variant
// styling is gated by the `group` class on the wrapper.

import type { ReactNode } from "react";

interface Props {
  /** Tooltip body. */
  text: ReactNode;
  /** Element the tooltip is attached to. */
  children: ReactNode;
  /** "below" (default) or "above". */
  position?: "below" | "above";
  className?: string;
}

export function Tooltip({ text, children, position = "below", className = "" }: Props) {
  const posClass =
    position === "above"
      ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
      : "top-full mt-2 left-1/2 -translate-x-1/2";

  return (
    <span className={`group relative inline-block ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-20 ${posClass} whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 opacity-0 shadow-lg shadow-black/60 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
}

// A small ⓘ icon that, on hover, reveals an explanatory tooltip. Useful next to
// labels/controls where the meaning isn't obvious.
export function InfoChip({ text }: { text: ReactNode }) {
  return (
    <Tooltip text={text}>
      <span
        tabIndex={0}
        aria-label="More info"
        className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-[10px] font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
      >
        ?
      </span>
    </Tooltip>
  );
}
