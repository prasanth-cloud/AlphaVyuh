import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// cookies() and headers() from next/headers are SYNCHRONOUS in Next.js 14.
// Do NOT await them — awaiting crosses an async boundary that can drop the
// request-scoped AsyncLocalStorage context and trigger a TraceSync error.
// (Next.js 15 made them async; if/when we upgrade, add await back.)

/** For Server Components and read-only Route Handlers. */
export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — middleware handles session refresh
          }
        },
      },
    }
  );
}

/** For Route Handlers that sign in / sign out and must write session cookies.
 *  Pass a NextResponse created before calling this; return that same response. */
export function createRouteHandlerClient(response: NextResponse) {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options ?? {});
          });
        },
      },
    }
  );
}
