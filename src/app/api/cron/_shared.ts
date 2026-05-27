// Shared helpers for cron route handlers.
//
// Auth model: Vercel cron requests carry `Authorization: Bearer ${CRON_SECRET}`
// when CRON_SECRET is set on the project. We require it in production; in
// dev (NODE_ENV !== "production") we let it pass so manual curl works.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { MaintenanceRunResult } from "../../../lib/maintenance";

export function isCronAuthorized(req: NextRequest): boolean {
  // Dev: allow unauthenticated invocation so `curl localhost:3000/api/cron/decay`
  // works during development.
  if (process.env.NODE_ENV !== "production") return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Production but no secret configured — fail closed.
    return false;
  }
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return auth === expected;
}

export function cronJsonResponse(result: MaintenanceRunResult): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export function cronErrorResponse(err: unknown, status = 500): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}
