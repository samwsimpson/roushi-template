// The 老師 mark — Roushi's central visual asset.
//
// Two render modes:
//   - "hero":     large display version with a brush-style entrance
//                 (fade + slight scale, capped at one motion moment per page).
//   - "watermark":small fixed-position seal in the viewport corner.
//   - "inline":   compact inline mark for use in body copy or section heads.
//
// Note on the SVG plan: a true stroke-dasharray brush draw would need
// actual SVG path data for each character, which we don't have yet. The
// current render is text-based via the display serif (Fraunces falls
// back to system CJK fonts for the Chinese glyphs). When we have SVG
// path data, swap the inner element here without changing the API.

import type { ReactNode } from "react";

interface MasterMarkProps {
  variant?: "hero" | "watermark" | "inline";
  className?: string;
  children?: ReactNode;
}

export function MasterMark({ variant = "inline", className = "", children = "老師" }: MasterMarkProps) {
  if (variant === "watermark") {
    return (
      <div className="master-watermark" aria-hidden="true">
        {children}
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className={`relative ${className}`}>
        <div
          className="font-serif leading-none tracking-tighter text-zinc-50 char-rise"
          style={{ fontSize: "clamp(7rem, 28vh, 16rem)" }}
        >
          {String(children)
            .split("")
            .map((char, i) => (
              <span
                key={i}
                style={{ ["--i" as never]: i } as React.CSSProperties}
                aria-hidden={i === 1 ? "true" : undefined}
              >
                {char}
              </span>
            ))}
        </div>
        <div className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-600">
          rōshi · 老師 · old master
        </div>
      </div>
    );
  }

  return <span className={`font-serif ${className}`}>{children}</span>;
}
