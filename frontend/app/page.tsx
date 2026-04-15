"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart2, BookOpen, Link2, ScanLine,
  AlertTriangle, Layers, Clock, TrendingDown,
} from "lucide-react";

const PROBLEMS = [
  { icon: Layers,        title: "Fragmented tools",    desc: "Charting on TradingView, screener on Chartink, trades in a spreadsheet — no single source of truth." },
  { icon: AlertTriangle, title: "No discipline system", desc: "Without a structured journal and rules engine, the same mistakes repeat every week." },
  { icon: Clock,         title: "Slow discovery",       desc: "Manual scanning wastes hours every morning before the market even opens." },
  { icon: TrendingDown,  title: "Blind broker data",    desc: "P&L lives inside broker apps with no way to analyse patterns across your positions." },
];

const FEATURES = [
  { icon: ScanLine,  title: "Scanner",        desc: "Real-time NSE/BSE screener with 200+ filters and custom formula support." },
  { icon: BarChart2, title: "Charts",         desc: "TradingView-grade charts with strategy overlays, linked to your scanner." },
  { icon: Link2,     title: "Broker Connect", desc: "Connect Zerodha, Fyers, Upstox and more — trade directly from AlphaVyuh." },
  { icon: BookOpen,  title: "Journal",        desc: "AI-assisted trade journal that scores your discipline and surfaces patterns." },
];

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [waitlistState, setWaitlistState] = useState<"idle" | "loading" | "done" | "exists">("idle");

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setWaitlistState("loading");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing" }),
      });
      setWaitlistState(res.status === 409 ? "exists" : "done");
    } catch {
      setWaitlistState("done");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-gray-800/60 sticky top-0 z-20 bg-gray-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">AlphaVyuh</span>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-gray-800">
                Log in
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white">
                Start free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-20 text-center">
        <Badge className="bg-indigo-950 text-indigo-300 border border-indigo-800 mb-6">
          Built for NSE &amp; BSE traders
        </Badge>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6">
          Your strategic edge
          <br />
          <span className="text-indigo-400">in the market</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          AlphaVyuh unifies your scanner, charts, journal, and broker into one intelligent platform — so you spend less time on tools and more time on alpha.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/signup">
            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white px-8">
              Start free →
            </Button>
          </Link>
          <a href="#features">
            <Button size="lg" variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white px-8">
              See how it works
            </Button>
          </a>
        </div>
      </section>

      {/* Problems */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-center text-3xl font-bold mb-2">The trader&apos;s daily frustration</h2>
        <p className="text-center text-gray-400 mb-10">Sound familiar?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PROBLEMS.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-lg bg-red-950/60 border border-red-900 flex items-center justify-center mb-4">
                  <Icon size={20} className="text-red-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-center text-3xl font-bold mb-2">Everything in one place</h2>
        <p className="text-center text-gray-400 mb-10">Four modules, one platform, zero switching.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="bg-gray-900 border-gray-800 hover:border-indigo-800 transition-colors">
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center mb-4">
                  <Icon size={20} className="text-indigo-400" />
                </div>
                <Badge className="bg-gray-800 text-gray-400 text-xs border-0 mb-3">Coming soon</Badge>
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Waitlist */}
      <section className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold mb-3">Get early access</h2>
        <p className="text-gray-400 mb-8">
          Join traders already on the waitlist. Be first to know when we launch.
        </p>
        {waitlistState === "done" ? (
          <div className="rounded-xl border border-green-800 bg-green-950/30 p-6">
            <p className="text-green-300 font-medium text-lg">You&apos;re on the list!</p>
            <p className="text-gray-400 text-sm mt-1">We&apos;ll email you when AlphaVyuh opens up.</p>
          </div>
        ) : (
          <form onSubmit={handleWaitlist} className="flex gap-3 max-w-md mx-auto">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" required
              className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 flex-1" />
            <Button type="submit" disabled={waitlistState === "loading"}
              className="bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap">
              {waitlistState === "loading" ? "Joining…" : "Join early access"}
            </Button>
          </form>
        )}
        {waitlistState === "exists" && (
          <p className="text-amber-400 text-sm mt-3">You&apos;re already registered — we&apos;ll be in touch!</p>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between flex-wrap gap-4">
          <span className="font-bold text-gray-300">AlphaVyuh</span>
          <p className="text-sm text-gray-500">© AlphaVyuh 2026. Built for Indian traders.</p>
          <div className="flex gap-4 text-sm text-gray-500">
            <Link href="/login" className="hover:text-white">Log in</Link>
            <Link href="/signup" className="hover:text-white">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
