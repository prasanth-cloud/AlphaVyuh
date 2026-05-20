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
  const { symbol } = await params;
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    timeframe: String(body.timeframe || "D").toUpperCase(),
    indicators: Array.isArray(body.indicators) ? body.indicators : [],
    drawings: Array.isArray(body.drawings) ? body.drawings : [],
    recovery_mode: "local_only",
  });
}
