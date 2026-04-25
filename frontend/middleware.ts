import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware-client";

const PUBLIC_PREFIXES = [
  "/landing.html",
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

  const response = NextResponse.next({ request });
  // Expose pathname to Server Components via a custom header
  response.headers.set("x-pathname", pathname);
  if (pathname === "/landing.html") {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("CDN-Cache-Control", "no-store");
    response.headers.set("Vercel-CDN-Cache-Control", "no-store");
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
