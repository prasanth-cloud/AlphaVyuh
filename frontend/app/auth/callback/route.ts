import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSafeRedirect } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const next = isSafeRedirect(requestedNext) ? requestedNext : "/dashboard";

  if (code) {
    const redirectResponse = NextResponse.redirect(new URL(next, requestUrl.origin));
    redirectResponse.headers.set("Server-Timing", 'alphavyuh_auth_callback;desc="session_set"');

    // Write session cookies directly onto the redirect response so the browser
    // receives Set-Cookie headers. Using cookieStore.set() alone (the previous
    // approach) writes to the Next.js internal store but not onto an explicitly
    // returned NextResponse object, meaning cookies were dropped.
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              redirectResponse.cookies.set(name, value, options ?? {});
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectResponse;
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", requestUrl.origin));
}
