// IMPORTANT: add https://alphavyuh.com/auth/callback to Supabase Dashboard → Authentication → URL Configuration
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import {
  getAuthRedirectOrigin,
  resolveAuthCallbackNext,
} from "@/lib/auth-redirect-origin";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value as EmailOtpType)
    ? value as EmailOtpType
    : null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectOrigin = getAuthRedirectOrigin(requestUrl.origin);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpType = parseEmailOtpType(requestUrl.searchParams.get("type"));
  const requestedNext = requestUrl.searchParams.get("next");
  const next = resolveAuthCallbackNext(requestedNext, redirectOrigin);

  if (code || (tokenHash && otpType)) {
    const redirectResponse = NextResponse.redirect(new URL(next, redirectOrigin));
    redirectResponse.headers.set("Server-Timing", 'alphavyuh_auth_callback;desc="session_set"');
    const supabase = await createRouteHandlerClient(redirectResponse);
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash!,
          type: otpType!,
        });
    if (!error) {
      return redirectResponse;
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", redirectOrigin));
}
