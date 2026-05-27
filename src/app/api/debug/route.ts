// Ultra-minimal diagnostic endpoint. Zero imports beyond next/server, zero
// dynamic imports, zero DB or auth touches. Purely reports the env-var
// surface as JSON so we can see if the function instantiates at all on
// Vercel. If THIS still 500s, the failure is at function-bundle load time,
// not in the handler logic.
//
// Safe to expose: only shows whether each env var is set (length + first/last
// 3 chars), never the value. Spot-checks for quote-wrapping so we can rule
// out the .env.local → Vercel paste bug for every var, not just DATABASE_URL.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface EnvCheck {
  name: string;
  set: boolean;
  length: number;
  preview?: string;
  startsWithQuote?: boolean;
  endsWithQuote?: boolean;
  hasTrailingWhitespace?: boolean;
}

function checkEnv(name: string): EnvCheck {
  const raw = process.env[name];
  if (!raw) return { name, set: false, length: 0 };
  const len = raw.length;
  return {
    name,
    set: true,
    length: len,
    preview: len <= 6 ? "***" : `${raw.slice(0, 3)}…${raw.slice(-3)}`,
    startsWithQuote: raw.startsWith('"') || raw.startsWith("'"),
    endsWithQuote: raw.endsWith('"') || raw.endsWith("'"),
    hasTrailingWhitespace: raw !== raw.trim(),
  };
}

export async function GET(): Promise<NextResponse> {
  const envs = [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "AUTH_SECRET",
    "AUTH_URL",
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
    "AUTH_ALLOWED_EMAILS",
    "AUTH_TRUST_HOST",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "NODE_ENV",
  ].map(checkEnv);

  const quoteWrapped = envs.filter((e) => e.set && (e.startsWithQuote || e.endsWithQuote));
  const trailingWs = envs.filter((e) => e.hasTrailingWhitespace);

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      summary: {
        envsSet: envs.filter((e) => e.set).length,
        envsMissing: envs.filter((e) => !e.set).length,
        quoteWrappedCount: quoteWrapped.length,
        quoteWrappedNames: quoteWrapped.map((e) => e.name),
        trailingWhitespaceCount: trailingWs.length,
        trailingWhitespaceNames: trailingWs.map((e) => e.name),
      },
      env: envs,
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}
