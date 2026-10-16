import { NextResponse } from "next/server";
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE, getAuthErrorStatus, getSafeAuthErrorMessage, isUnconfirmedAuthEmailError } from "@/lib/auth-error-copy";
import { normalizeAuthEmail, readAuthRequestBody } from "@/lib/auth-request";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { allowMockAppAuth } from "@/lib/runtime-mode";

export async function POST(request: Request) {
  const body = await readAuthRequestBody(request);
  const email = normalizeAuthEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const password = body?.password;
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Enter your password." }, { status: 400 });
  }

  // Create the response first — the supabase client writes sb-* cookies onto it
  const response = NextResponse.json({ success: true });
  response.headers.set("Server-Timing", 'alphavyuh_auth_session;desc="session_set"');

  if (allowMockAppAuth()) {
    return response;
  }

  try {
    const supabase = await createRouteHandlerClient(response);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const status = getAuthErrorStatus(error, 401);
      return NextResponse.json(
        {
          error: getSafeAuthErrorMessage(error, "Could not sign in. Check your email and password."),
          ...(status === 401 && isUnconfirmedAuthEmailError(error) ? { code: "email_not_confirmed" } : {}),
        },
        { status }
      );
    }
    if (!data?.session) {
      return NextResponse.json({ error: AUTH_SERVICE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    // Return the same response object — it carries the Set-Cookie headers.
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: getSafeAuthErrorMessage(error, AUTH_SERVICE_UNAVAILABLE_MESSAGE) },
      { status: getAuthErrorStatus(error, 503) }
    );
  }
}
