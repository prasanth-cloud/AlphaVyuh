"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STEPS = ["About you", "Your broker", "Choose plan"];

type FormState = {
  experience: string;
  trades: string;
  broker: string;
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    experience: "",
    trades: "",
    broker: "",
  });

  function Radio({ name, value, label }: { name: keyof FormState; value: string; label: string }) {
    const checked = form[name] === value;
    return (
      <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
        ${checked ? "border-indigo-500 bg-indigo-950" : "border-gray-700 hover:border-gray-500"}`}>
        <input type="radio" name={name} value={value} checked={checked}
          onChange={() => setForm((f) => ({ ...f, [name]: value }))}
          className="accent-indigo-500" />
        <span className="text-white">{label}</span>
      </label>
    );
  }

  async function finish() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      // Update directly via Supabase — avoids backend dependency in onboarding flow
      await supabase
        .from("users")
        .update({ onboarding_completed: true })
        .eq("id", data.session.user.id);
    }
    window.location.replace("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                ${i < step ? "bg-indigo-600 text-white" : i === step ? "bg-indigo-600 text-white ring-2 ring-indigo-400" : "bg-gray-800 text-gray-500"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-sm ${i === step ? "text-white font-medium" : "text-gray-500"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? "bg-indigo-600" : "bg-gray-700"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 0 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Tell us about yourself</CardTitle>
              <CardDescription className="text-gray-400">We&apos;ll personalise your experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm text-gray-300 font-medium mb-3">Experience level</p>
                <div className="space-y-2">
                  <Radio name="experience" value="beginner" label="Beginner — new to trading" />
                  <Radio name="experience" value="intermediate" label="Intermediate — 1–3 years" />
                  <Radio name="experience" value="expert" label="Expert — 3+ years" />
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-300 font-medium mb-3">What do you trade?</p>
                <div className="space-y-2">
                  <Radio name="trades" value="equity" label="Equity (stocks)" />
                  <Radio name="trades" value="fno" label="F&O (futures & options)" />
                  <Radio name="trades" value="both" label="Both" />
                </div>
              </div>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
                disabled={!form.experience || !form.trades}
                onClick={() => setStep(1)}>
                Continue →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2 */}
        {step === 1 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Your broker</CardTitle>
              <CardDescription className="text-gray-400">We&apos;ll support direct broker connectivity later</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {["Zerodha", "Fyers", "Upstox", "Angel One", "Other", "None yet"].map((b) => (
                <label key={b} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${form.broker === b ? "border-indigo-500 bg-indigo-950" : "border-gray-700 hover:border-gray-500"}`}>
                  <input type="radio" name="broker" value={b} checked={form.broker === b}
                    onChange={() => setForm((f) => ({ ...f, broker: b }))}
                    className="accent-indigo-500" />
                  <span className="text-white">{b}</span>
                </label>
              ))}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                  onClick={() => setStep(2)}>
                  Skip for now
                </Button>
                <Button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white"
                  onClick={() => setStep(2)}>
                  Continue →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 */}
        {step === 2 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Choose your plan</CardTitle>
              <CardDescription className="text-gray-400">You can always upgrade later</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Free */}
                <div className="p-4 rounded-xl border-2 border-indigo-500 bg-indigo-950/30">
                  <p className="text-white font-bold text-lg">Free</p>
                  <p className="text-indigo-300 text-2xl font-bold mt-1">₹0</p>
                  <ul className="mt-3 space-y-1 text-sm text-gray-300">
                    <li>✓ Dashboard</li>
                    <li>✓ Basic scanner</li>
                    <li>✓ 1 watchlist</li>
                    <li>✓ Trade journal</li>
                  </ul>
                </div>
                {/* Pro */}
                <div className="p-4 rounded-xl border border-gray-700 bg-gray-800/50 relative opacity-75">
                  <Badge className="absolute -top-2 right-2 bg-amber-500 text-black text-xs">Coming soon</Badge>
                  <p className="text-white font-bold text-lg">Pro</p>
                  <p className="text-gray-300 text-2xl font-bold mt-1">₹1,999<span className="text-sm font-normal">/mo</span></p>
                  <ul className="mt-3 space-y-1 text-sm text-gray-400">
                    <li>✓ Everything in Free</li>
                    <li>✓ Advanced scanner</li>
                    <li>✓ Broker connect</li>
                    <li>✓ AI insights</li>
                  </ul>
                </div>
              </div>

              <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white" disabled={loading}
                onClick={finish}>
                {loading ? "Setting up…" : "Continue with Free →"}
              </Button>
              <Button variant="ghost" className="w-full text-gray-400 hover:text-white hover:bg-gray-800"
                disabled={loading} onClick={finish}>
                I&apos;ll upgrade later
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
