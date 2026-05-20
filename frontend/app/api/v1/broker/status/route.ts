import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    connected: false,
    broker: "zerodha",
    mode: "vercel_readonly_recovery",
    status: "not_connected",
    status_label: "Broker services are paused during read-only data recovery",
    plan: "free",
    plan_allows_broker: false,
    has_api_key: false,
    has_token: false,
    token_expired: false,
    connected_at: null,
    token_expires_at: null,
    read_only: true,
    can_import: false,
    sync_status: "idle",
    last_synced_at: null,
    live_order_requires_confirmation: true,
    live_order_enabled: false,
  });
}
