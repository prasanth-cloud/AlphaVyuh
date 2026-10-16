import { NextResponse } from "next/server";
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE, getAuthErrorStatus, getSafeAuthErrorMessage, isNeutralAuthResendError } from "@/lib/auth-error-copy";
import { normalizeAuthEmail, readAuthRequestBody } from "@/lib/auth-request";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { getAuthRedirectOrigin } from "@/lib/auth-redirect-origin";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await readAuthRequestBody(request);
  const email = normalizeAuthEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const requestUrl = new URL(request.url);
  const next = typeof body?.next === "string" ? body.next : null;
  const safeNext = isSafeRedirect(next) ? next : "/dashboard";
  const emailRedirectTo = `${getAuthRedirectOrigin(requestUrl.origin)}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  const response = NextResponse.json({ success: true });
  try {
    const supabase = await createRouteHandlerClient(response);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });

    if (error) {
      const status = getAuthErrorStatus(error, 400);
      if (status === 400 && isNeutralAuthResendError(error)) {
        return NextResponse.json({ success: true });
      }
      return NextResponse.json(
        { error: getSafeAuthErrorMessage(error, "Could not resend confirmation email.") },
        { status },
      );
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: getSafeAuthErrorMessage(error, AUTH_SERVICE_UNAVAILABLE_MESSAGE) },
      { status: getAuthErrorStatus(error, 503) }
    );
  }
}
