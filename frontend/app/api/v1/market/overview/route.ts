import { NextRequest, NextResponse } from "next/server";
import { requireRecoveryApiUser } from "@/lib/server/recovery-api-auth";
import { getRecoveryMarketOverview } from "@/lib/server/recovery-market-data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const unauthorized = await requireRecoveryApiUser(request);
    if (unauthorized) return unauthorized;

    const payload = await getRecoveryMarketOverview();
    if ("statusCode" in payload && payload.status === "unavailable") {
      return NextResponse.json(payload, { status: payload.statusCode });
    }
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Market overview is temporarily unavailable.";
    return NextResponse.json({ status: "unavailable", mode: "unavailable", detail: message }, { status: 503 });
  }
}
