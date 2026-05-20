import { NextRequest, NextResponse } from "next/server";
import { getRecoveryCandles } from "@/lib/server/recovery-market-data";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const searchParams = request.nextUrl.searchParams;
  try {
    const payload = await getRecoveryCandles(symbol, {
      timeframe: searchParams.get("timeframe") ?? "D",
      from_date: searchParams.get("from_date"),
      to_date: searchParams.get("to_date"),
      limit: Number(searchParams.get("limit") || 365),
    });
    if ("statusCode" in payload && payload.status === "unavailable") {
      return NextResponse.json(payload, { status: payload.statusCode });
    }
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chart candle data is temporarily unavailable.";
    return NextResponse.json({ status: "unavailable", mode: "unavailable", detail: message }, { status: 503 });
  }
}
