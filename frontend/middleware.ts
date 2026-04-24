import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware-client";
import { regionFromCountry } from "@/lib/market/region";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/reset-password",
  "/update-password",
  "/dev-login",
  "/offline",
  "/privacy",
  "/terms",
  "/api/",
  "/_next/",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /charts/* to /watchlist (preserve existing behaviour)
  if (pathname.startsWith("/charts")) {
    const symbol = pathname.split("/")[2];
    const dest = symbol ? `/watchlist?symbol=${symbol}` : "/watchlist";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  const response = NextResponse.next({ request });
  // Expose pathname to Server Components via a custom header
  response.headers.set("x-pathname", pathname);
  if (!request.cookies.get("alphavyuh-region")?.value) {
    response.cookies.set("alphavyuh-region", regionFromCountry(request.headers.get("x-vercel-ip-country")), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  if (isPublic(pathname)) return response;

  const supabase = createMiddlewareClient(request, response);

  // getUser() hits Supabase Auth servers — validates JWT, never trusts cache
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Onboarding check is handled by the (app)/ layout Server Component,
  // which reads x-pathname and queries public.users with the session.

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
