import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // headers() is synchronous in Next.js 14 — no await (see lib/supabase/server.ts)
  const pathname = headers().get("x-pathname") ?? "/";

  const supabase = createServerSupabaseClient();

  // getUser() validates JWT server-side — never trust getSession() here
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!pathname.startsWith("/onboarding")) {
    const { data: profile } = await supabase
      .from("users")
      .select("onboarding_completed")
      .eq("id", user.id)
      .single();

    // null profile = trigger race after signup → treat as not onboarded
    if (!profile?.onboarding_completed) {
      redirect("/onboarding");
    }
  }

  return <AppShell>{children}</AppShell>;
}
