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
  const { symbol } = await params;
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    timeframe: body.timeframe || "D",
    indicators: Array.isArray(body.indicators) ? body.indicators : [],
    drawing_tools: Array.isArray(body.drawing_tools) ? body.drawing_tools : [],
    recovery_mode: "local_only",
  });
}
