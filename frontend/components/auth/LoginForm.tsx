"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Step = "email" | "otp";

const OTP_LEN = 6;

export default function LoginForm() {
  const [step, setStep]       = useState<Step>("email");
  const [email, setEmail]     = useState("");
  const [otp, setOtp]         = useState<string[]>(Array(OTP_LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [sent, setSent]       = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // URL-based error (e.g. auth callback failed)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth_callback_failed") {
      setError("Login link expired or invalid. Please request a new one.");
    }
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  function getCallbackUrl() {
    return `${window.location.origin}/auth/callback`;
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: getCallbackUrl(),
      },
    });
    setLoading(false);
    if (err) {
      setError(
        err.message.includes("not found") || err.message.includes("not registered")
          ? "No account found with this email. Please sign up first."
          : err.message
      );
      return;
    }
    setStep("otp");
    setSent(true);
    setResendTimer(30);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const token = otp.join("");
    if (token.length < OTP_LEN) {
      setError(`Please enter the ${OTP_LEN}-digit code.`);
      return;
    }
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    setLoading(false);
    if (err) {
      setError("Invalid or expired code. Check your email for the link or try a new code.");
      setOtp(Array(OTP_LEN).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return;
    }
    window.location.replace("/dashboard");
  }

  async function resendOtp() {
    if (resendTimer > 0) return;
    setError("");
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: getCallbackUrl() },
    });
    setLoading(false);
    setOtp(Array(OTP_LEN).fill(""));
    setResendTimer(30);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }

  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, OTP_LEN).split("");
      const next = [...otp];
      digits.forEach((d, i) => { if (index + i < OTP_LEN) next[index + i] = d; });
      setOtp(next);
      const focusIdx = Math.min(index + digits.length, OTP_LEN - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < OTP_LEN - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <div className="bg-white rounded-[14px] shadow-sm border border-[#e2e2df] p-8 w-full">
      {/* Logo / Brand */}
      <div className="mb-6">
        <div className="text-[22px] font-bold text-[#1c1c1a] tracking-tight">AlphaVyuh</div>
        <div className="text-[13px] text-[#888] mt-0.5">
          {step === "email" ? "Sign in to your account" : `Check your email — ${email}`}
        </div>
      </div>

      {step === "email" ? (
        <form onSubmit={sendOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[12px] font-semibold text-[#555] uppercase tracking-wide">
              Email address
            </label>
            <input
              id="email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus
              className="w-full text-[14px] border border-[#e2e2df] rounded-[8px] px-3 py-2.5 outline-none focus:border-[#5b63f5] focus:ring-1 focus:ring-[#5b63f5]/30 transition-colors"
            />
          </div>

          {error && <p className="text-[13px] text-[#e5383b]">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 rounded-[8px] text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#5b63f5" }}
          >
            {loading ? "Sending…" : "Send login code →"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="space-y-5">
          <p className="text-[13px] text-[#555]">
            We sent a {OTP_LEN}-digit code to <strong>{email}</strong>.
            You can also click the link in the email to log in instantly.
          </p>

          {/* OTP boxes */}
          <div className="flex justify-center gap-2">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text" inputMode="numeric" maxLength={OTP_LEN}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-12 h-13 text-center text-xl font-bold rounded-[8px] border border-[#e2e2df] bg-white text-[#1c1c1a] focus:border-[#5b63f5] focus:outline-none focus:ring-1 focus:ring-[#5b63f5]/30 transition-colors"
                style={{ height: "52px" }}
              />
            ))}
          </div>

          {error && <p className="text-[13px] text-[#e5383b] text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || otp.join("").length < OTP_LEN}
            className="w-full py-2.5 rounded-[8px] text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#5b63f5" }}
          >
            {loading ? "Verifying…" : "Verify & sign in →"}
          </button>

          <div className="flex items-center justify-between text-[13px]">
            <button
              type="button"
              onClick={() => { setStep("email"); setError(""); setOtp(Array(OTP_LEN).fill("")); }}
              className="text-[#888] hover:text-[#1c1c1a] transition-colors"
            >
              ← Change email
            </button>
            <button
              type="button" onClick={resendOtp}
              disabled={resendTimer > 0 || loading}
              className="text-[#5b63f5] hover:text-[#4550d4] disabled:text-[#bbb] disabled:cursor-not-allowed transition-colors"
            >
              {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      <p className="mt-5 text-center text-[13px] text-[#888]">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-[#5b63f5] hover:underline">Sign up</Link>
      </p>
    </div>
  );
}
