// Auth gate (Next 16 proxy, formerly middleware). Runs on Edge runtime by
// default — that's why this file MUST NOT import `./auth` (which pulls in
// the DrizzleAdapter, which uses Node-only APIs and fails to load on Edge).
// Instead we construct a slim Edge-safe Auth.js instance from the shared
// `authConfig` so the proxy can verify JWT sessions without the adapter.

import type { Session } from "next-auth";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig, authEnabled } from "./auth.config";

const { auth } = NextAuth(authConfig);

// Public marketing surfaces — these render for signed-out visitors. The
// homepage `/` is conditional (the page itself picks Ask vs Marketing
// based on session), but we still want to let unauthenticated requests
// reach it so the marketing variant can render. Same for the other
// marketing chapters.
const PUBLIC_MARKETING_PATHS = new Set([
  "/",
  "/features",
  "/how-it-works",
  "/use-cases",
  "/pricing",
  "/install",
  "/onboarding",
  "/about",
  "/blog",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_MARKETING_PATHS.has(pathname)) return true;
  // Allow sub-routes under marketing chapters too (e.g. /blog/first-post).
  if (pathname.startsWith("/blog/")) return true;
  return false;
}

export default async function middleware(req: NextRequest) {
  if (!authEnabled) return NextResponse.next();

  // Marketing pages render for everyone; the page itself handles any
  // conditional content based on session.
  if (isPublicPath(req.nextUrl.pathname)) return NextResponse.next();

  let session: Session | null = null;
  try {
    session = (await auth()) as Session | null;
  } catch (err) {
    console.error("[proxy] auth() failed, letting request through:", err);
    return NextResponse.next();
  }

  if (!session) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Skip the matcher for /api/auth/*, /api/debug, /api/cron/*, /api/mcp,
  // /auth/*, Next internals, and static assets. /api/cron/* needs its own
  // bearer-token auth (CRON_SECRET); /api/mcp has its own bearer-token
  // auth (ROUSHI_MCP_HTTP_TOKEN) — neither should go through the web
  // session redirect.
  matcher: [
    "/((?!api/auth|api/debug|api/cron|api/mcp|auth/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
