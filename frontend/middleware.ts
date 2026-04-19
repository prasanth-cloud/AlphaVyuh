import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Redirect /charts/* to /watchlist
  if (pathname.startsWith("/charts")) {
    const symbol = pathname.split("/")[2];
    const dest = symbol ? `/watchlist?symbol=${symbol}` : "/watchlist";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
