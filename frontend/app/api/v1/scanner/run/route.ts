import { NextRequest, NextResponse } from "next/server";
import { requireRecoveryApiUser } from "@/lib/server/recovery-api-auth";
import { runRecoveryScanner } from "@/lib/server/recovery-market-data";
import {
  MAX_RECOVERY_SCANNER_BODY_BYTES,
  RecoveryScannerBodyTooLargeError,
  readBoundedRecoveryScannerBody,
} from "@/lib/server/recovery-scanner-body";

export const runtime = "nodejs";

function tooLargeResponse() {
  return NextResponse.json(
    {
      status: "unavailable",
      mode: "unavailable",
      detail: "Scanner recovery request is too large.",
    },
    { status: 413 },
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireRecoveryApiUser(request);
    if (unauthorized) return unauthorized;

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_RECOVERY_SCANNER_BODY_BYTES) {
      return tooLargeResponse();
    }

    const body = await readBoundedRecoveryScannerBody(request);
    const payload = await runRecoveryScanner({
      filters: objectValue(body.filters),
      sort_by: stringValue(body.sort_by),
      sort_order: stringValue(body.sort_order),
      page: numberValue(body.page),
      page_size: numberValue(body.page_size),
    });
    if ("statusCode" in payload && payload.status === "unavailable") {
      return NextResponse.json(payload, { status: payload.statusCode });
    }
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof RecoveryScannerBodyTooLargeError) {
      return tooLargeResponse();
    }
    const message = error instanceof Error ? error.message : "Scanner data is temporarily unavailable.";
    return NextResponse.json({ status: "unavailable", mode: "unavailable", detail: message }, { status: 503 });
  }
}
