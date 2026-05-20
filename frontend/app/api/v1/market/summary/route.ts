import { NextResponse } from "next/server";
import { getRecoveryMarketSummary } from "@/lib/server/recovery-market-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await getRecoveryMarketSummary();
    if ("statusCode" in payload && payload.status === "unavailable") {
      return NextResponse.json(payload, { status: payload.statusCode });
    }
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Market summary is temporarily unavailable.";
    return NextResponse.json({ status: "unavailable", mode: "unavailable", detail: message }, { status: 503 });
  }
}
