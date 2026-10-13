import { NextResponse } from "next/server";
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE, getAuthErrorStatus, getSafeAuthErrorMessage, isDuplicateAuthAccountError } from "@/lib/auth-error-copy";
import { normalizeAuthEmail, readAuthRequestBody } from "@/lib/auth-request";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { getAuthRedirectOrigin } from "@/lib/auth-redirect-origin";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { allowMockAppAuth } from "@/lib/runtime-mode";

function pendingConfirmation(response: NextResponse) {
  const pending = NextResponse.json({ pending_confirmation: true });
  // Supabase may set the PKCE verifier cookie even without an immediate session.
  response.cookies.getAll().forEach((cookie) => pending.cookies.set(cookie));
  return pending;
}

export async function POST(request: Request) {
  const body = await readAuthRequestBody(request);
  const email = normalizeAuthEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const password = body?.password;
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Use a password with at least 8 characters." }, { status: 400 });
  }
  const fullName = body?.full_name;
  if (fullName !== undefined && (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 200)) {
    return NextResponse.json({ error: "Enter a valid full name (up to 200 characters)." }, { status: 400 });
  }
  const requestUrl = new URL(request.url);
  const next = typeof body?.next === "string" ? body.next : null;
  const safeNext = isSafeRedirect(next) ? next : "/onboarding";
  const emailRedirectTo = `${getAuthRedirectOrigin(requestUrl.origin)}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  const response = NextResponse.json({ success: true });
  response.headers.set("Server-Timing", 'alphavyuh_auth_signup;desc="session_set"');

  if (allowMockAppAuth()) {
    return response;
  }

  try {
    const supabase = await createRouteHandlerClient(response);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: typeof fullName === "string" ? { full_name: fullName.trim() } : {},
        emailRedirectTo,
      },
    });

    if (error) {
      const status = getAuthErrorStatus(error, 400);
      // Duplicate accounts use the same shape as successful pending confirmation.
      if (status === 400 && isDuplicateAuthAccountError(error)) {
        return pendingConfirmation(response);
      }
      return NextResponse.json({ error: getSafeAuthErrorMessage(error, "Could not create the account.") }, { status });
    }

    if (!data?.session) return pendingConfirmation(response);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: getSafeAuthErrorMessage(error, AUTH_SERVICE_UNAVAILABLE_MESSAGE) },
      { status: getAuthErrorStatus(error, 503) }
    );
  }
}
