// Cron: weekly contradiction scan. Finds entity pairs (rule/decision/
// lesson) whose embeddings are cosine-close, then has an LLM judge each
// pair for actual contradictions. Surfaces findings as a system goal
// on /goals. Schedule in vercel.ts. See src/lib/contradictions.ts.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runMaintenance } from "../../../../lib/maintenance";
import { cronErrorResponse, cronJsonResponse, isCronAuthorized } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Contradiction scan can take 30-60s (up to 100 LLM judges sequentially).
export const maxDuration = 120;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runMaintenance("contradictions");
    return cronJsonResponse(result);
  } catch (err) {
    return cronErrorResponse(err);
  }
}
