import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  // Create the response first — the supabase client writes sb-* cookies onto it
  const response = NextResponse.json({ success: true });
  const supabase = createRouteHandlerClient(response);

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
