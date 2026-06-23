import { NextResponse } from "next/server";
import { getSafeAuthErrorMessage } from "@/lib/auth-error-copy";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { getAuthRedirectOrigin } from "@/lib/auth-redirect-origin";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { allowMockAppAuth } from "@/lib/runtime-mode";

export async function POST(request: Request) {
  const { email, password, full_name, next } = await request.json();
  const requestUrl = new URL(request.url);
  const safeNext = isSafeRedirect(next) ? next : "/onboarding";
  const emailRedirectTo = `${getAuthRedirectOrigin(requestUrl.origin)}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  const response = NextResponse.json({ success: true });
  response.headers.set("Server-Timing", 'alphavyuh_auth_signup;desc="session_set"');

  if (allowMockAppAuth()) {
    return response;
  }

  const supabase = await createRouteHandlerClient(response);

  const { data, error } = await supabase.auth.signUp({
    email: (email as string).trim().toLowerCase(),
    password,
    options: {
      data: { full_name },
      emailRedirectTo,
    },
  });

  if (error) {
    // "User already registered" leaks email existence — return the same
    // pending_confirmation shape for all "user exists" errors so callers
    // cannot enumerate registered addresses.
    if (error.message.toLowerCase().includes("already")) {
      return NextResponse.json({ pending_confirmation: true });
    }
    return NextResponse.json({ error: getSafeAuthErrorMessage(error, "Could not create the account.") }, { status: 400 });
  }

  // Email confirmation is OFF — session returned immediately.
  // If confirmation is ever turned ON, this returns pending_confirmation: true
  // and the SignupForm shows the "check your email" card.
  if (!data.session) {
    return NextResponse.json({ pending_confirmation: true });
  }

  return response; // session cookies written by createRouteHandlerClient
}
