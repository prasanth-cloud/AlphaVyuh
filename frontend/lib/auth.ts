"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import type { Session } from "@supabase/supabase-js";

export type ApiUser = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  plan: "free" | "pro" | "elite";
  plan_expires_at: string | null;
  onboarding_completed: boolean;
  created_at: string;
};

export async function fetchMe(accessToken: string): Promise<ApiUser | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabaseAuth = supabase.auth;

  useEffect(() => {
    supabaseAuth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabaseAuth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabaseAuth]);

  return { session, loading };
}
