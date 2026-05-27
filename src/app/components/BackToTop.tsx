"use client";

// Back-to-top floating button.
//
// Appears after the user has scrolled past one viewport height; fades
// out when near the top. Click → smooth-scroll to top.
//
// Styled as a tiny vermilion seal stamp to match the marketing site's
// scholarly-seal visual language. Same `transform: rotate(-2deg)`
// settling on hover that the primary CTA uses, so the whole site
// reads as one design vocabulary.
//
// Lives in the layout so it works on every page (marketing AND app
// surfaces), not just the long marketing scrolls.

import { useEffect, useState } from "react";

export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handle = () => {
      // Threshold: one viewport height. Captures "below the fold" without
      // surfacing on short pages where it'd just be visual noise.
      setShow(window.scrollY > window.innerHeight);
    };
    handle();
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  const onClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={show ? 0 : -1}
      className={`fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 border-2 border-vermilion bg-zinc-950/85 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-vermilion backdrop-blur transition-all duration-300 hover:rotate-0 hover:scale-[1.04] hover:bg-vermilion hover:text-zinc-50 ${
        show
          ? "pointer-events-auto opacity-100 translate-y-0"
          : "pointer-events-none opacity-0 translate-y-3"
      }`}
      style={{ transform: show ? "rotate(-2deg)" : "rotate(-2deg) translateY(0.75rem)" }}
    >
      ↑ Top
    </button>
  );
}
