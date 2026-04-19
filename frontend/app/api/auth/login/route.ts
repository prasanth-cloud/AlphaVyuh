import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPA_URL = "https://fyxltykqdvacbdgmeucf.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5eGx0eWtxZHZhY2JkZ21ldWNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjU5ODcsImV4cCI6MjA5MTcwMTk4N30.ql5GQNBNaVJvnFwQMXMiVuJ9OuvZcERSWVLR929qG1U";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const cookieStore = cookies();

  const supabase = createServerClient(
    SUPA_URL,
    SUPA_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (!data.session) {
    return NextResponse.json({ error: "No session returned." }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
