import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ alerts: [], recovery_mode: "vercel_readonly" });
}

export async function POST() {
  return NextResponse.json(
    {
      status: "unavailable",
      mode: "unavailable",
      detail: "Price alert changes are unavailable in read-only recovery mode.",
    },
    { status: 503 },
  );
}
