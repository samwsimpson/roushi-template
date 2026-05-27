// Vermilion seal stamp — the signature CTA + accent component.
//
// Treated like a scholar's red seal on a scroll: rare, intentional,
// always semantically meaningful. NOT a second brand color used freely.
//
// Two modes:
//   - "link":   wraps a Next <Link> or external <a>. Use as the primary CTA.
//   - "static": renders as an unclickable decorative stamp (e.g., next to
//                a signature, or as a "PRIVATE BETA" marker on /pricing).
//
// The visual: small vermilion border-rectangle with mono uppercase text
// inside, slightly rotated to suggest hand-stamp imperfection. On hover
// (link variant), the rotation settles to 0deg and the background fills
// in vermilion.

import Link from "next/link";
import type { ReactNode } from "react";

interface SealStampLinkProps {
  variant?: "link";
  href: string;
  external?: boolean;
  rotate?: number;
  children: ReactNode;
}

interface SealStampStaticProps {
  variant: "static";
  rotate?: number;
  children: ReactNode;
}

type SealStampProps = SealStampLinkProps | SealStampStaticProps;

const SHARED_CLASS =
  "inline-flex items-center gap-2 border-2 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.18em] transition-all duration-300";

const COLORS = "border-vermilion text-vermilion";

export function SealStamp(props: SealStampProps) {
  const rotate = props.rotate ?? -2;
  const style: React.CSSProperties = {
    transform: `rotate(${rotate}deg)`,
  };

  if (props.variant === "static") {
    return (
      <span
        className={`${SHARED_CLASS} ${COLORS} cursor-default select-none`}
        style={style}
        aria-hidden="true"
      >
        {props.children}
      </span>
    );
  }

  // Link variant: hover settles rotation to 0 and fills background.
  const hover =
    "hover:rotate-0 hover:bg-vermilion hover:text-zinc-50 hover:scale-[1.02]";

  if (props.external) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer noopener"
        className={`${SHARED_CLASS} ${COLORS} ${hover}`}
        style={style}
      >
        {props.children}
      </a>
    );
  }

  return (
    <Link href={props.href} className={`${SHARED_CLASS} ${COLORS} ${hover}`} style={style}>
      {props.children}
    </Link>
  );
}
