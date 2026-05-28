// Cron: daily drift-check scan.
//
// NOTE on limitations: Vercel can't reach Sam's local source_path entries, so
// the file-system-dependent checks (CHANGELOG presence, package.json version,
// README status drift, partial pattern application) WON'T find drift when this
// runs in production. The "missing-file" finding will fire for every product
// because Vercel's filesystem doesn't have any of them.
//
// What this cron IS useful for:
//   1. A heartbeat that drift-check ran today (visible via maintenance_runs)
//   2. Closing any [system] Drift: goals when the snapshot in the brain
//      indicates the issue is now resolved (e.g. the CLI ran locally + posted
//      a fresh snapshot showing no errors)
//   3. Future: when we move detection to brain-cached results (v0.14), this
//      cron becomes the right place to act on the snapshot
//
// For now Sam can also run `pnpm roushi drift-check --post-goals` locally to
// post fresh findings to the brain at any time.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cronErrorResponse, isCronAuthorized } from "../_shared";
import { runDriftCheck } from "../../../../lib/drift-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const findings = await runDriftCheck({
      // Skip pattern checks on the cron — they need filesystem and will all
      // error out on Vercel. Sam runs them locally via the CLI.
      skipPatterns: true,
      // Don't post goals from the cron — Vercel can't see file state, so any
      // "drift" it surfaces would be false-positive missing-file errors.
      // Local CLI runs are what post goals.
      postGoals: false,
    });
    return NextResponse.json(
      {
        ok: true,
        timestamp: new Date().toISOString(),
        findingsCount: findings.length,
        // No body — counts only, per the cron logging policy.
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return cronErrorResponse(err);
  }
}
