import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json([]);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    id: `recovery-drawing-${Date.now()}`,
    user_id: "vercel-recovery",
    symbol: symbol.toUpperCase(),
    timeframe: body.timeframe || "D",
    tool_type: body.tool_type || "trendline",
    points: Array.isArray(body.points) ? body.points : [],
    style: body.style && typeof body.style === "object" ? body.style : {},
    created_at: new Date().toISOString(),
    recovery_mode: "local_only",
  });
}
