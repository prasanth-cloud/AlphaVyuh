import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = /^\/(dashboard|scanner|watchlist|charts|journal|settings|onboarding)/;
const AUTH_ROUTES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;

  // Redirect /charts/* to /watchlist
  if (pathname.startsWith("/charts")) {
    const symbol = pathname.split("/")[2];
    const dest = symbol ? `/watchlist?symbol=${symbol}` : "/watchlist";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Supabase magic links redirect to the Site URL (root) with ?code=...
  // Forward to the auth callback route so we can exchange the code for a session.
  const code = request.nextUrl.searchParams.get("code");
  if (code && pathname === "/") {
    const callbackUrl = new URL("/auth/callback", request.url);
    callbackUrl.searchParams.set("code", code);
    return NextResponse.redirect(callbackUrl);
  }

  // getUser() validates the JWT server-side and refreshes the session if needed.
  // This is safer than getSession() which only reads the cookie without validation.
  const { data: { user } } = await supabase.auth.getUser();

  // No session + protected route → login
  if (!user && PROTECTED.test(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Has session + auth route → dashboard
  if (user && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
