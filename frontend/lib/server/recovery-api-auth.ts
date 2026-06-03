import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function cleanEnv(value?: string | null): string {
  return String(value ?? "").trim().replace(/^['"`]|['"`]$/g, "");
}

function recoveryAuthClient(): SupabaseClient {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) || cleanEnv(process.env.SUPABASE_URL);
  const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) {
    throw new Error("Recovery API auth is missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function recoveryApiUnauthorizedResponse() {
  return NextResponse.json(
    {
      status: "unauthorized",
      mode: "unavailable",
      detail: "Sign in to use the recovery market-data API.",
    },
    { status: 401 },
  );
}

export function recoveryBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function validateRecoveryApiRequest(
  request: Request,
  client: Pick<SupabaseClient, "auth"> = recoveryAuthClient(),
): Promise<boolean> {
  const token = recoveryBearerToken(request);
  if (!token) return false;
  try {
    const { data, error } = await client.auth.getUser(token);
    return !error && Boolean(data.user?.id);
  } catch {
    return false;
  }
}

export async function requireRecoveryApiUser(request: Request) {
  return await validateRecoveryApiRequest(request) ? null : recoveryApiUnauthorizedResponse();
}
