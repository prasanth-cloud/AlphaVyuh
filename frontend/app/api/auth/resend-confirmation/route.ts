import { NextResponse } from "next/server";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email, next } = await request.json();
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const requestUrl = new URL(request.url);
  const safeNext = isSafeRedirect(next) ? next : "/dashboard";
  const emailRedirectTo = `${requestUrl.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  const response = NextResponse.json({ success: true });
  const supabase = await createRouteHandlerClient(response);

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalizedEmail,
    options: { emailRedirectTo },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("rate") || message.includes("limit")) {
      return NextResponse.json(
        { error: "Please wait a minute before requesting another link." },
        { status: 429 },
      );
    }
    if (message.includes("already") || message.includes("confirmed") || message.includes("not found")) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Could not resend confirmation email." }, { status: 400 });
  }

  return response;
}
