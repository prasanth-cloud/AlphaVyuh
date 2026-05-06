import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  // Create the response first — the supabase client writes sb-* cookies onto it
  const response = NextResponse.json({ success: true });
  response.headers.set("Server-Timing", 'alphavyuh_auth_session;desc="session_set"');

  if (
    process.env.NODE_ENV !== "production"
    && process.env.PLAYWRIGHT_MOCK_AUTH === "true"
    && process.env.NEXT_PUBLIC_DATA_MODE === "mock"
  ) {
    return response;
  }

  const supabase = await createRouteHandlerClient(response);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    return NextResponse.json(
      { error: error?.message ?? "No session returned." },
      { status: 401 }
    );
  }

  // Return the same response object — it carries the Set-Cookie headers
  return response;
}
