"use client";

// Path-aware top navigation.
//
// Two variants — chosen by current pathname:
//   - MarketingNav: on /, /features, /how-it-works, /use-cases, /pricing,
//                   /about, /blog, /blog/*. Visitors and curious operators.
//   - AppNav:       everywhere else (Browse, Graph, Goals, Rules, Skills,
//                   Optimize, etc.). The product surfaces.
//
// Exception: signed-in users on `/` see the Ask interface (the product),
// not the marketing homepage. So `/ + signed-in` gets the AppNav.
//
// Each variant has a bridge link so users can jump between contexts:
//   - Marketing: "Open Roushi →" (signed-in) or "Sign in" (signed-out)
//   - App:       "← Public site" (always visible, links to /features)
//
// Build-time note: `useSearchParams()` opts a component into Client-Side
// Rendering. Next.js refuses to statically prerender any route whose
// layout/page tree pulls it in without a `<Suspense>` boundary above.
// The wrapper here is what lets `/_not-found` and other static routes
// build cleanly while still letting the inner component read `?view=`.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signOutAction } from "../auth-actions";
import { SealStamp } from "./SealStamp";

interface SimpleSession {
  user?: { name?: string | null; email?: string | null } | null;
}

interface TopNavProps {
  session: SimpleSession | null;
  authEnabled: boolean;
}

const MARKETING_PATHS = new Set([
  "/",
  "/features",
  "/how-it-works",
  "/use-cases",
  "/pricing",
  "/install",
  "/about",
  "/blog",
]);

function isMarketingPath(pathname: string): boolean {
  if (MARKETING_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/blog/")) return true;
  return false;
}

export function TopNav(props: TopNavProps) {
  // Suspense around the inner component so static prerender doesn't try
  // to call useSearchParams() at build time. Fallback is a minimal
  // header shell with just the brand — prevents layout shift on hydrate
  // and gives the user something to look at during the brief CSR step.
  return (
    <Suspense fallback={<NavShell />}>
      <TopNavInner {...props} />
    </Suspense>
  );
}

function TopNavInner({ session, authEnabled }: TopNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSignedIn = Boolean(authEnabled && session?.user);
  const onMarketingPath = isMarketingPath(pathname);
  // Signed-in users on `/` see Ask by default — but they can opt into the
  // marketing homepage with `?view=marketing` (the "Public site" bridge
  // link in the app nav uses this so they actually can land on marketing).
  const forceMarketing = searchParams.get("view") === "marketing";
  const showMarketing =
    onMarketingPath && (!(pathname === "/" && isSignedIn) || forceMarketing);

  if (showMarketing) return <MarketingNav isSignedIn={isSignedIn} />;
  return <AppNav session={session} authEnabled={authEnabled} />;
}

// Minimal header shell rendered during static prerender + the brief
// moment between SSR and client hydration. Just the brand — no
// path-aware nav, no session-aware controls.
function NavShell() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-serif text-2xl text-zinc-50">老師</span>
          <span className="text-sm font-light tracking-wide text-zinc-400">Roushi</span>
        </Link>
        <div className="h-6" />
      </div>
    </header>
  );
}

// ─── Marketing nav (public-facing) ───────────────────────────────────

function MarketingNav({ isSignedIn }: { isSignedIn: boolean }) {
  // Brand link: signed-in users need `?view=marketing` so the homepage
  // stays in marketing mode instead of flipping to the Ask interface.
  // Signed-out users land on the marketing homepage by default.
  const brandHref = isSignedIn ? "/?view=marketing" : "/";

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href={brandHref} className="flex items-baseline gap-3">
          <span className="font-serif text-2xl text-zinc-50">老師</span>
          <span className="text-sm font-light tracking-wide text-zinc-400">Roushi</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm md:flex">
          <Link href="/features" className="text-zinc-400 transition hover:text-zinc-100">
            Features
          </Link>
          <Link href="/how-it-works" className="text-zinc-400 transition hover:text-zinc-100">
            How it works
          </Link>
          <Link href="/use-cases" className="text-zinc-400 transition hover:text-zinc-100">
            Use cases
          </Link>
          <Link href="/pricing" className="text-zinc-400 transition hover:text-zinc-100">
            Pricing
          </Link>
          <Link href="/install" className="text-zinc-400 transition hover:text-zinc-100">
            Install
          </Link>
          <Link href="/about" className="text-zinc-400 transition hover:text-zinc-100">
            About
          </Link>
          <Link href="/blog" className="text-zinc-400 transition hover:text-zinc-100">
            Blog
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          {isSignedIn ? (
            <Link
              href="/"
              className="text-xs text-zinc-400 transition hover:text-zinc-100"
              title="Go to the Ask interface"
            >
              Open Roushi →
            </Link>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="text-xs text-zinc-500 transition hover:text-zinc-300"
              >
                Sign in
              </Link>
              <SealStamp href="/#request-beta">Request beta</SealStamp>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── App nav (the product surfaces) ──────────────────────────────────

function AppNav({ session, authEnabled }: TopNavProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-serif text-2xl text-zinc-50">老師</span>
          <span className="text-sm font-light tracking-wide text-zinc-400">Roushi</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/entities" className="text-zinc-400 transition hover:text-zinc-100">
            Browse
          </Link>
          <Link href="/graph" className="text-zinc-400 transition hover:text-zinc-100">
            Graph
          </Link>
          <Link href="/goals" className="text-zinc-400 transition hover:text-zinc-100">
            Goals
          </Link>
          <Link href="/rules" className="text-zinc-400 transition hover:text-zinc-100">
            Rules
          </Link>
          <Link href="/skills" className="text-zinc-400 transition hover:text-zinc-100">
            Skills
          </Link>
          <Link href="/optimize" className="text-zinc-400 transition hover:text-zinc-100">
            Optimize
          </Link>
          <Link
            href="/projects/new"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            + Add project
          </Link>
          <Link
            href="/?view=marketing"
            className="border-l border-zinc-800 pl-4 text-xs text-zinc-500 transition hover:text-zinc-300"
            title="View the public marketing homepage"
          >
            ← Public site
          </Link>
          {authEnabled ? (
            session?.user ? (
              <div className="flex items-center gap-3 border-l border-zinc-800 pl-4">
                <span className="text-xs text-zinc-500">
                  {session.user.name ?? session.user.email}
                </span>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="text-xs text-zinc-500 transition hover:text-zinc-200"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href="/auth/signin"
                className="border-l border-zinc-800 pl-4 text-xs text-zinc-500 hover:text-zinc-300"
              >
                Sign in
              </Link>
            )
          ) : (
            <span
              className="border-l border-zinc-800 pl-4 text-xs text-amber-500"
              title="Auth is not configured — UI is open. Set AUTH_GITHUB_ID and AUTH_GITHUB_SECRET to enable sign-in."
            >
              no auth
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
