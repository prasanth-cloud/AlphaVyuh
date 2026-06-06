import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const timeframe = request.nextUrl.searchParams.get("timeframe") || "D";
  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    timeframe: timeframe.toUpperCase(),
    indicators: [],
    drawings: [],
    recovery_mode: "vercel_readonly",
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  void request;
  void params;
  return NextResponse.json({
    status: "unavailable",
    mode: "unavailable",
    detail: "Chart workspace changes are unavailable in read-only recovery mode.",
  }, { status: 503 });
}
