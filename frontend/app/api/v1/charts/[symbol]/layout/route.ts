import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    timeframe: "D",
    indicators: [],
    drawing_tools: [],
    recovery_mode: "vercel_readonly",
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  void request;
  void params;
  return NextResponse.json({
    status: "unavailable",
    mode: "unavailable",
    detail: "Chart layout changes are unavailable in read-only recovery mode.",
  }, { status: 503 });
}
