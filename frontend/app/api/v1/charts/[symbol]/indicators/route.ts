import { NextRequest, NextResponse } from "next/server";
import { requireRecoveryApiUser } from "@/lib/server/recovery-api-auth";
import { getRecoveryIndicators } from "@/lib/server/recovery-market-data";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const searchParams = request.nextUrl.searchParams;
  try {
    const unauthorized = await requireRecoveryApiUser(request);
    if (unauthorized) return unauthorized;

    const indicators = searchParams.get("indicators")?.split(",").filter(Boolean) ?? [];
    const payload = await getRecoveryIndicators(symbol, indicators, searchParams.get("timeframe") ?? "D");
    if ("statusCode" in payload && payload.status === "unavailable") {
      return NextResponse.json(payload, { status: payload.statusCode });
    }
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chart indicators are temporarily unavailable.";
    return NextResponse.json({ status: "unavailable", mode: "unavailable", detail: message }, { status: 503 });
  }
}
