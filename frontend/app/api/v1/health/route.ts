import { NextResponse } from "next/server";
import { getRecoveryHealth } from "@/lib/server/recovery-market-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getRecoveryHealth();
    return NextResponse.json(health);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recovery API health is temporarily unavailable.";
    return NextResponse.json({ status: "unavailable", mode: "unavailable", detail: message }, { status: 503 });
  }
}
