"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Navbar from "@/components/Navbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      // Check if onboarding is done (skip the check if already on /onboarding)
      if (!pathname.startsWith("/onboarding")) {
        const { data: profile } = await supabase
          .from("users")
          .select("onboarding_completed")
          .eq("id", data.user.id)
          .single();
        if (profile && profile.onboarding_completed === false) {
          router.replace("/onboarding");
          return;
        }
      }
      setChecking(false);
    });
  }, [router, pathname]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0f0f0e] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#5b63f5] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Onboarding page uses its own full-screen layout
  if (pathname.startsWith("/onboarding")) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen flex flex-col bg-[#f2f2f0] overflow-hidden">
      <Navbar />
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#f2f2f0]">
        {children}
      </div>
    </div>
  );
}
