import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json([]);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  void request;
  void params;
  return NextResponse.json({
    status: "unavailable",
    mode: "unavailable",
    detail: "Chart drawing changes are unavailable in read-only recovery mode.",
  }, { status: 503 });
}
