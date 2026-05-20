import { NextResponse } from "next/server";
import { getRecoveryDataHealth } from "@/lib/server/recovery-market-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getRecoveryDataHealth());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Data health is temporarily unavailable.";
    return NextResponse.json({ status: "unknown", mode: "unavailable", detail: message }, { status: 503 });
  }
}
