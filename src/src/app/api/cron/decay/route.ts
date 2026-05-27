// Cron: daily decay scan. Surfaces entities not validated in the
// staleness window as a system goal on /goals. Schedule lives in vercel.ts.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runMaintenance } from "../../../../lib/maintenance";
import { cronErrorResponse, cronJsonResponse, isCronAuthorized } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runMaintenance("decay");
    return cronJsonResponse(result);
  } catch (err) {
    return cronErrorResponse(err);
  }
}
