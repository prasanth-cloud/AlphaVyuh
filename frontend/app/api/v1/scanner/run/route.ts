import { NextRequest, NextResponse } from "next/server";
import { runRecoveryScanner } from "@/lib/server/recovery-market-data";

export const runtime = "nodejs";
const MAX_RECOVERY_SCANNER_BODY_BYTES = 32_768;

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_RECOVERY_SCANNER_BODY_BYTES) {
      return NextResponse.json(
        {
          status: "unavailable",
          mode: "unavailable",
          detail: "Scanner recovery request is too large.",
        },
        { status: 413 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const payload = await runRecoveryScanner({
      filters: body?.filters ?? {},
      sort_by: body?.sort_by,
      sort_order: body?.sort_order,
      page: body?.page,
      page_size: body?.page_size,
    });
    if ("statusCode" in payload && payload.status === "unavailable") {
      return NextResponse.json(payload, { status: payload.statusCode });
    }
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scanner data is temporarily unavailable.";
    return NextResponse.json({ status: "unavailable", mode: "unavailable", detail: message }, { status: 503 });
  }
}
