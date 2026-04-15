"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

type UserProfile = {
  plan: string;
  plan_expires_at: string | null;
};

const PLAN_META: Record<string, { label: string; color: string; description: string }> = {
  free:  { label: "Free",  color: "border-gray-600 text-gray-300",    description: "Free plan — upgrade coming soon" },
  pro:   { label: "Pro",   color: "border-indigo-600 text-indigo-300", description: "Pro plan — all features unlocked" },
  elite: { label: "Elite", color: "border-amber-600 text-amber-300",   description: "Elite plan — priority support & features" },
};

export default function BillingPage() {
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { window.location.replace("/login"); return; }

      const { data: profile } = await supabase
        .from("users")
        .select("plan, plan_expires_at")
        .eq("id", data.session.user.id)
        .single();

      if (!profile) { window.location.replace("/login"); return; }
      setUser(profile);
    });
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const meta = PLAN_META[user.plan] ?? PLAN_META.free;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-6">Billing &amp; Plan</h1>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Current plan</CardTitle>
            <CardDescription className="text-gray-400">{meta.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={`${meta.color} text-base px-4 py-1.5 capitalize`}>
                {meta.label}
              </Badge>
              {user.plan === "free" && (
                <span className="text-sm text-gray-500">No active subscription</span>
              )}
              {user.plan_expires_at && (
                <span className="text-sm text-gray-500">
                  Expires {new Date(user.plan_expires_at).toLocaleDateString("en-IN")}
                </span>
              )}
            </div>

            {user.plan === "free" && (
              <div className="rounded-lg border border-dashed border-indigo-800 bg-indigo-950/20 p-4">
                <p className="text-indigo-300 text-sm font-medium">Pro plan — ₹1,999/month</p>
                <p className="text-gray-400 text-sm mt-1">
                  Payments are not yet enabled. We&apos;re working on it — you&apos;ll be notified when Pro launches.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
