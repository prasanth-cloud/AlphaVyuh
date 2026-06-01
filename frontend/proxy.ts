import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware-client";
import { allowMockAppAuth } from "@/lib/runtime-mode";

const PUBLIC_PREFIXES = [
  "/favicon.ico",
  "/health",
  "/login",
  "/signup",
  "/reset-password",
  "/update-password",
  "/offline",
  "/blog",
  "/access",
  "/beta",
  "/careers",
  "/contact",
  "/policies",
  "/products",
  "/privacy",
  "/terms",
  "/sw.js",
  "/manifest.json",
  "/api/",
  "/_next/",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function hasSupabaseAuthConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/landing.html") {
    const response = NextResponse.redirect(new URL("/", request.url), 308);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("CDN-Cache-Control", "no-store");
    response.headers.set("Vercel-CDN-Cache-Control", "no-store");
    return response;
  }

  if (pathname === "/favicon.ico") {
    return NextResponse.rewrite(new URL("/favicon.svg", request.url));
  }

  const response = NextResponse.next({ request });
  // Expose pathname to Server Components via a custom header
  response.headers.set("x-pathname", pathname);

  if (pathname.startsWith("/dev-login")) {
    if (allowMockAppAuth()) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicPath(pathname)) return response;
  if (allowMockAppAuth()) return response;

  if (!hasSupabaseAuthConfig()) {
    return redirectToLogin(request, pathname);
  }

  const supabase = createMiddlewareClient(request, response);

  // getUser() hits Supabase Auth servers — validates JWT, never trusts cache
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLogin(request, pathname);
  }

  // Onboarding check is handled by the (app)/ layout Server Component,
  // which reads x-pathname and queries public.users with the session.

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
