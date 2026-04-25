"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL!;

// ── Types ─────────────────────────────────────────────────────────────────────

type LegType   = "call" | "put";
type LegAction = "buy" | "sell";

type Leg = {
  id: string;
  type: LegType;
  action: LegAction;
  strike: number | "";
  premium: number | "";
  quantity: number;
  lot_size: number;
};

type PayoffPoint = { price: number; pnl: number };

type PayoffResult = {
  payoff: PayoffPoint[];
  greeks: { delta: number; gamma: number; theta: number; vega: number; rho: number };
  max_profit_str: string | null;
  max_loss_str: string | null;
  breakevens: number[];
  net_premium: number;
};

type Preset = {
  name: string;
  description: string;
  legs_template: { type: LegType; action: LegAction; strike: number; premium: number }[];
};

// ── Payoff SVG chart ─────────────────────────────────────────────────────────

function PayoffChart({ data, spot }: { data: PayoffPoint[]; spot: number }) {
  if (!data.length) return null;

  const W = 560, H = 200, PAD = { top: 12, right: 20, bottom: 28, left: 60 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const prices = data.map(d => d.price);
  const pnls   = data.map(d => d.pnl);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const minV = Math.min(...pnls, 0),  maxV = Math.max(...pnls, 0);
  const rangeV = maxV - minV || 1;

  const toX = (p: number) => PAD.left + ((p - minP) / (maxP - minP || 1)) * cW;
  const toY = (v: number) => PAD.top + (1 - (v - minV) / rangeV) * cH;

  const zeroY = toY(0);
  const spotX = toX(spot);

  // Build path
  const pts = data.map(d => `${toX(d.price)},${toY(d.pnl)}`).join(" L ");
  const pathD = `M ${pts}`;

  // Profit fill (above zero)
  const profitPts = [
    ...data.map(d => ({ x: toX(d.price), y: Math.min(toY(d.pnl), zeroY) })),
  ];
  const profitPath = `M ${profitPts.map(p => `${p.x},${p.y}`).join(" L ")} L ${PAD.left + cW},${zeroY} L ${PAD.left},${zeroY} Z`;

  // Loss fill (below zero)
  const lossPts = data.map(d => ({ x: toX(d.price), y: Math.max(toY(d.pnl), zeroY) }));
  const lossPath = `M ${lossPts.map(p => `${p.x},${p.y}`).join(" L ")} L ${PAD.left + cW},${zeroY} L ${PAD.left},${zeroY} Z`;

  // Y axis ticks
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minV + (rangeV / yTicks) * i);

  function fmtAmt(v: number) {
    if (Math.abs(v) >= 100000) return `${(v/100000).toFixed(1)}L`;
    if (Math.abs(v) >= 1000)   return `${(v/1000).toFixed(0)}K`;
    return v.toFixed(0);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* Zero line */}
      <line x1={PAD.left} y1={zeroY} x2={PAD.left + cW} y2={zeroY} stroke="#e2e2df" strokeWidth={1} />
      {/* Fills */}
      <path d={profitPath} fill="#26a65b" fillOpacity={0.12} />
      <path d={lossPath}   fill="#e5383b" fillOpacity={0.12} />
      {/* Main line */}
      <path d={pathD} fill="none" stroke="#f4f7fb" strokeWidth={2} />
      {/* Spot price vertical */}
      <line x1={spotX} y1={PAD.top} x2={spotX} y2={PAD.top + cH} stroke="#1c1c1a" strokeWidth={1} strokeDasharray="4 3" />
      <text x={spotX + 3} y={PAD.top + 10} fontSize={9} fill="#888">Spot</text>
      {/* Y axis labels */}
      {yTickVals.map((v, i) => (
        <text key={i} x={PAD.left - 5} y={toY(v) + 4} textAnchor="end" fontSize={9} fill="#aaa">
          {fmtAmt(v)}
        </text>
      ))}
      {/* X axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const p = minP + t * (maxP - minP);
        return (
          <text key={t} x={toX(p)} y={H - 6} textAnchor="middle" fontSize={9} fill="#aaa">
            {p.toFixed(0)}
          </text>
        );
      })}
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function greekColor(v: number) {
  return v > 0 ? "#26a65b" : v < 0 ? "#e5383b" : "#888";
}

function makeLeg(overrides?: Partial<Leg>): Leg {
  return {
    id: crypto.randomUUID(),
    type: "call",
    action: "buy",
    strike: "",
    premium: "",
    quantity: 1,
    lot_size: 1,
    ...overrides,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

type PresetDraft = {
  spot: number | "";
  expiry: string;          // YYYY-MM-DD
  legs: { strike: number | ""; premium: number | "" }[];
};

function dteFromExpiry(expiry: string): number {
  if (!expiry) return 30;
  const diff = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  return Math.max(0, diff);
}

function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function OptionsPage() {
  const [spot, setSpot]         = useState<number | "">("");
  const [symbol, setSymbol]     = useState("NIFTY");
  const [iv, setIv]             = useState(15);
  const [dte, setDte]           = useState(30);
  const [legs, setLegs]         = useState<Leg[]>([makeLeg()]);
  const [result, setResult]     = useState<PayoffResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [presets, setPresets]   = useState<Record<string, Preset>>({});
  const [showPresets, setShowPresets] = useState(false);

  // Preset customisation modal
  const [presetKey, setPresetKey]     = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/options/presets`)
      .then(r => r.json())
      .then(d => setPresets(d.presets || {}))
      .catch(() => {});
  }, []);

  const calculate = useCallback(async () => {
    if (!spot || legs.length === 0) return;
    const validLegs = legs.filter(l => l.strike !== "" && l.premium !== "");
    if (!validLegs.length) { setError("Add at least one leg with strike and premium"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/options/payoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: validLegs.map(l => ({
            type: l.type, action: l.action,
            strike: Number(l.strike), premium: Number(l.premium),
            quantity: l.quantity, lot_size: l.lot_size,
          })),
          spot: Number(spot),
          iv, days_to_expiry: dte,
          risk_free_rate: 6.5,
        }),
      });
      if (!res.ok) throw new Error("Calculation failed");
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [spot, legs, iv, dte]);

  function openPresetModal(key: string) {
    const p = presets[key];
    if (!p) return;
    setPresetKey(key);
    setPresetDraft({
      spot: spot,
      expiry: defaultExpiry(),
      legs: p.legs_template.map(() => ({ strike: "", premium: "" })),
    });
    setShowPresets(false);
  }

  function confirmPreset() {
    if (!presetKey || !presetDraft) return;
    const p = presets[presetKey];
    setLegs(p.legs_template.map((t, i) => makeLeg({
      type: t.type,
      action: t.action,
      strike: presetDraft.legs[i]?.strike ?? "",
      premium: presetDraft.legs[i]?.premium ?? "",
    })));
    if (presetDraft.spot !== "") setSpot(presetDraft.spot);
    if (presetDraft.expiry) setDte(dteFromExpiry(presetDraft.expiry));
    setResult(null);
    setPresetKey(null);
    setPresetDraft(null);
  }

  function updatePresetLeg(i: number, patch: Partial<PresetDraft["legs"][0]>) {
    setPresetDraft(d => d ? {
      ...d,
      legs: d.legs.map((l, idx) => idx === i ? { ...l, ...patch } : l),
    } : d);
  }

  function updateLeg(id: string, patch: Partial<Leg>) {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }

  function removeLeg(id: string) {
    setLegs(prev => prev.filter(l => l.id !== id));
  }

  const GREEK_LABELS: [keyof PayoffResult["greeks"], string, string][] = [
    ["delta", "Delta", "Directional exposure"],
    ["gamma", "Gamma", "Rate of delta change"],
    ["theta", "Theta", "Time decay per day"],
    ["vega",  "Vega",  "Sensitivity to IV (per 1%)"],
    ["rho",   "Rho",   "Sensitivity to rates (per 1%)"],
  ];

  return (
    <div className="min-h-full bg-[#f2f2f0]">
      <div className="max-w-[980px] mx-auto px-5 py-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight">Options Strategy Builder</div>
            <div className="text-[13px] text-[#888] mt-0.5">Build strategies, visualise P&L at expiry, and see combined Greeks</div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowPresets(o => !o)}
              className="flex items-center gap-1.5 text-[12px] font-medium text-[#f4f7fb] border border-[#f4f7fb] rounded-[7px] px-3 py-1.5 hover:bg-white/10 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 3h10M1 6h10M1 9h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Presets
            </button>
            {showPresets && (
              <div className="absolute right-0 top-full mt-1 w-[320px] bg-white border border-[#e2e2df] rounded-[10px] shadow-xl z-50 overflow-hidden">
                {Object.entries(presets).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => openPresetModal(key)}
                    className="w-full text-left px-4 py-3 hover:bg-[#fafafa] border-b border-[#f7f7f5] last:border-0 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-semibold text-[#1c1c1a]">{p.name}</div>
                      <span className="text-[10px] text-[#f4f7fb] font-medium">{p.legs_template.length}L</span>
                    </div>
                    <div className="text-[11px] text-[#aaa] mt-0.5">{p.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Left panel — inputs */}
          <div className="lg:col-span-2 space-y-4">

            {/* Symbol + Spot */}
            <div className="bg-white border border-[#e2e2df] rounded-[10px] p-4">
              <div className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.5px] mb-3">Underlying</div>
              <div className="flex gap-2 mb-3">
                <input
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  placeholder="Symbol"
                  className="w-[90px] text-[13px] border border-[#e2e2df] rounded-[7px] px-2.5 py-1.5 outline-none focus:border-[#f4f7fb]"
                />
                <input
                  type="number"
                  value={spot}
                  onChange={e => setSpot(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Spot price"
                  className="flex-1 text-[13px] border border-[#e2e2df] rounded-[7px] px-2.5 py-1.5 outline-none focus:border-[#f4f7fb]"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="text-[10px] text-[#aaa] mb-1">IV %</div>
                  <input
                    type="number"
                    value={iv}
                    onChange={e => setIv(Number(e.target.value))}
                    className="w-full text-[13px] border border-[#e2e2df] rounded-[7px] px-2.5 py-1.5 outline-none focus:border-[#f4f7fb]"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-[#aaa] mb-1">Days to Expiry</div>
                  <input
                    type="number"
                    value={dte}
                    onChange={e => setDte(Number(e.target.value))}
                    className="w-full text-[13px] border border-[#e2e2df] rounded-[7px] px-2.5 py-1.5 outline-none focus:border-[#f4f7fb]"
                  />
                </div>
              </div>
            </div>

            {/* Legs */}
            <div className="bg-white border border-[#e2e2df] rounded-[10px] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.5px]">Legs</div>
                <button
                  onClick={() => setLegs(prev => [...prev, makeLeg()])}
                  className="text-[11px] text-[#f4f7fb] font-medium hover:underline"
                >
                  + Add leg
                </button>
              </div>

              <div className="space-y-3">
                {legs.map((leg, i) => (
                  <div key={leg.id} className="border border-[#f0f0ee] rounded-[8px] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-[#888]">Leg {i + 1}</span>
                      {legs.length > 1 && (
                        <button onClick={() => removeLeg(leg.id)} className="text-[#e5383b] text-[10px] hover:underline">Remove</button>
                      )}
                    </div>

                    {/* Type + Action */}
                    <div className="flex gap-1.5 mb-2">
                      {(["call", "put"] as LegType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => updateLeg(leg.id, { type: t })}
                          className="flex-1 text-[11px] font-medium py-1 rounded-[5px] capitalize transition-colors"
                          style={leg.type === t
                            ? { background: t === "call" ? "#edfaf3" : "#fff0f0", color: t === "call" ? "#26a65b" : "#e5383b", border: `1px solid ${t === "call" ? "#26a65b44" : "#e5383b44"}` }
                            : { background: "#f7f7f5", color: "#aaa", border: "1px solid #e2e2df" }
                          }
                        >{t}</button>
                      ))}
                      {(["buy", "sell"] as LegAction[]).map(a => (
                        <button
                          key={a}
                          onClick={() => updateLeg(leg.id, { action: a })}
                          className="flex-1 text-[11px] font-medium py-1 rounded-[5px] capitalize transition-colors"
                          style={leg.action === a
                            ? { background: "rgba(244,247,251,0.10)", color: "#f4f7fb", border: "1px solid #f4f7fb44" }
                            : { background: "#f7f7f5", color: "#aaa", border: "1px solid #e2e2df" }
                          }
                        >{a}</button>
                      ))}
                    </div>

                    {/* Strike + Premium */}
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1">
                        <div className="text-[10px] text-[#aaa] mb-0.5">Strike</div>
                        <input
                          type="number"
                          value={leg.strike}
                          onChange={e => updateLeg(leg.id, { strike: e.target.value === "" ? "" : Number(e.target.value) })}
                          placeholder="e.g. 24000"
                          className="w-full text-[12px] border border-[#e2e2df] rounded-[5px] px-2 py-1 outline-none focus:border-[#f4f7fb]"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] text-[#aaa] mb-0.5">Premium ₹</div>
                        <input
                          type="number"
                          value={leg.premium}
                          onChange={e => updateLeg(leg.id, { premium: e.target.value === "" ? "" : Number(e.target.value) })}
                          placeholder="e.g. 120"
                          className="w-full text-[12px] border border-[#e2e2df] rounded-[5px] px-2 py-1 outline-none focus:border-[#f4f7fb]"
                        />
                      </div>
                    </div>

                    {/* Qty + Lot size */}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className="text-[10px] text-[#aaa] mb-0.5">Lots</div>
                        <input
                          type="number" min={1}
                          value={leg.quantity}
                          onChange={e => updateLeg(leg.id, { quantity: Math.max(1, Number(e.target.value)) })}
                          className="w-full text-[12px] border border-[#e2e2df] rounded-[5px] px-2 py-1 outline-none focus:border-[#f4f7fb]"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] text-[#aaa] mb-0.5">Lot Size</div>
                        <input
                          type="number" min={1}
                          value={leg.lot_size}
                          onChange={e => updateLeg(leg.id, { lot_size: Math.max(1, Number(e.target.value)) })}
                          className="w-full text-[12px] border border-[#e2e2df] rounded-[5px] px-2 py-1 outline-none focus:border-[#f4f7fb]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={calculate}
                disabled={loading || !spot}
                className="w-full mt-4 py-2 rounded-[8px] bg-[#1c1c1a] text-white text-[13px] font-semibold hover:opacity-85 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Calculating…" : "Calculate Payoff"}
              </button>

              {error && <div className="text-[12px] text-[#e5383b] mt-2">{error}</div>}
            </div>
          </div>

          {/* Right panel — results */}
          <div className="lg:col-span-3 space-y-4">

            {/* Payoff chart */}
            <div className="bg-white border border-[#e2e2df] rounded-[10px] p-4">
              <div className="text-[12px] font-semibold text-[#1c1c1a] mb-3">P&amp;L at Expiry</div>
              {result ? (
                <>
                  <PayoffChart data={result.payoff} spot={Number(spot)} />

                  {/* Summary row */}
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {[
                      { label: "Max Profit",  val: result.max_profit_str ?? "—", color: "#26a65b" },
                      { label: "Max Loss",    val: result.max_loss_str   ?? "—", color: "#e5383b" },
                      { label: "Net Premium", val: result.net_premium >= 0 ? `₹${result.net_premium.toLocaleString("en-IN")} paid` : `₹${Math.abs(result.net_premium).toLocaleString("en-IN")} received`, color: result.net_premium >= 0 ? "#e5383b" : "#26a65b" },
                    ].map(item => (
                      <div key={item.label} className="bg-[#f7f7f5] rounded-[8px] px-3 py-2.5 text-center">
                        <div className="text-[13px] font-bold" style={{ color: item.color }}>{item.val}</div>
                        <div className="text-[10px] text-[#aaa] mt-0.5">{item.label}</div>
                      </div>
                    ))}
                  </div>

                  {result.breakevens.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-[#888]">Breakeven{result.breakevens.length > 1 ? "s" : ""}:</span>
                      {result.breakevens.map((be, i) => (
                        <span key={i} className="text-[11px] font-semibold text-[#f4f7fb] bg-white/10 px-2 py-0.5 rounded-full">
                          ₹{be.toLocaleString("en-IN")}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-[180px] text-[13px] text-[#aaa]">
                  Set spot price, add legs, then click Calculate
                </div>
              )}
            </div>

            {/* Greeks */}
            {result && (
              <div className="bg-white border border-[#e2e2df] rounded-[10px] p-4">
                <div className="text-[12px] font-semibold text-[#1c1c1a] mb-3">Combined Greeks <span className="text-[11px] text-[#aaa] font-normal">(at current spot)</span></div>
                <div className="grid grid-cols-5 gap-2">
                  {GREEK_LABELS.map(([key, label, desc]) => {
                    const val = result.greeks[key];
                    return (
                      <div key={key} className="text-center">
                        <div className="text-[15px] font-bold tabular-nums" style={{ color: greekColor(val) }}>
                          {val > 0 ? "+" : ""}{val.toFixed(key === "gamma" ? 5 : 3)}
                        </div>
                        <div className="text-[11px] font-semibold text-[#555] mt-0.5">{label}</div>
                        <div className="text-[9px] text-[#bbb] leading-tight mt-0.5">{desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Info card */}
            <div className="bg-white/10 border border-[#d0d3fb] rounded-[10px] px-4 py-3">
              <div className="text-[12px] font-semibold text-[#f4f7fb] mb-1">How to use</div>
              <ul className="text-[12px] text-[#555] space-y-1 leading-relaxed">
                <li>• Enter the underlying spot price and days to expiry</li>
                <li>• Add each option leg — type, action, strike, and the premium you see on NSE/your broker</li>
                <li>• Set lot size to the NSE contract lot size (e.g. NIFTY = 75)</li>
                <li>• P&L is at expiry (intrinsic value only, no time value)</li>
                <li>• Greeks use Black-Scholes with your IV input</li>
              </ul>
              <div className="mt-2">
                <Link href="/charts/NIFTY" className="text-[11px] text-[#f4f7fb] underline">
                  View NIFTY chart →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preset customisation modal */}
      {presetKey && presetDraft && (() => {
        const p = presets[presetKey];
        const legLabels: Record<string, string[]> = {
          bull_call_spread: ["Lower strike (buy)", "Higher strike (sell)"],
          bear_put_spread:  ["Higher strike (buy)", "Lower strike (sell)"],
          iron_condor:      ["Put (buy, far OTM)", "Put (sell, near OTM)", "Call (sell, near OTM)", "Call (buy, far OTM)"],
          straddle:         ["ATM call", "ATM put"],
          strangle:         ["OTM call", "OTM put"],
        };
        const labels = legLabels[presetKey] ?? p.legs_template.map((_, i) => `Leg ${i + 1}`);

        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[14px] shadow-2xl w-full max-w-[440px] overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#f0f0ee]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[15px] font-semibold text-[#1c1c1a]">{p.name}</div>
                    <div className="text-[12px] text-[#888] mt-0.5">{p.description}</div>
                  </div>
                  <button
                    onClick={() => { setPresetKey(null); setPresetDraft(null); }}
                    className="text-[#aaa] hover:text-[#1c1c1a] text-[18px] leading-none ml-3"
                  >×</button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

                {/* Underlying params */}
                <div>
                  <div className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.5px] mb-2">Underlying</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-[#aaa] mb-1">Spot Price ₹</div>
                      <input
                        type="number"
                        value={presetDraft.spot}
                        onChange={e => setPresetDraft(d => d ? { ...d, spot: e.target.value === "" ? "" : Number(e.target.value) } : d)}
                        placeholder="e.g. 24000"
                        className="w-full text-[13px] border border-[#e2e2df] rounded-[7px] px-2.5 py-1.5 outline-none focus:border-[#f4f7fb]"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#aaa] mb-1">Expiry Date</div>
                      <input
                        type="date"
                        value={presetDraft.expiry}
                        onChange={e => setPresetDraft(d => d ? { ...d, expiry: e.target.value } : d)}
                        className="w-full text-[13px] border border-[#e2e2df] rounded-[7px] px-2.5 py-1.5 outline-none focus:border-[#f4f7fb]"
                      />
                      {presetDraft.expiry && (
                        <div className="text-[10px] text-[#f4f7fb] mt-0.5">{dteFromExpiry(presetDraft.expiry)}d to expiry</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Per-leg strikes */}
                <div>
                  <div className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.5px] mb-2">Option Legs</div>
                  <div className="space-y-2.5">
                    {p.legs_template.map((t, i) => (
                      <div key={i} className="border border-[#f0f0ee] rounded-[8px] p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                            style={{
                              background: t.action === "buy" ? "#edfaf3" : "#fff0f0",
                              color: t.action === "buy" ? "#26a65b" : "#e5383b",
                            }}
                          >{t.action} {t.type}</span>
                          <span className="text-[11px] text-[#888]">{labels[i]}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-[#aaa] mb-0.5">Strike ₹</div>
                            <input
                              type="number"
                              value={presetDraft.legs[i]?.strike ?? ""}
                              onChange={e => updatePresetLeg(i, { strike: e.target.value === "" ? "" : Number(e.target.value) })}
                              placeholder={presetDraft.spot ? String(presetDraft.spot) : "e.g. 24000"}
                              className="w-full text-[12px] border border-[#e2e2df] rounded-[5px] px-2 py-1.5 outline-none focus:border-[#f4f7fb]"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] text-[#aaa] mb-0.5">Premium ₹</div>
                            <input
                              type="number"
                              value={presetDraft.legs[i]?.premium ?? ""}
                              onChange={e => updatePresetLeg(i, { premium: e.target.value === "" ? "" : Number(e.target.value) })}
                              placeholder="e.g. 120"
                              className="w-full text-[12px] border border-[#e2e2df] rounded-[5px] px-2 py-1.5 outline-none focus:border-[#f4f7fb]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-[#aaa] mt-2">
                    Get strikes and premiums from NSE option chain or your broker
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-[#f0f0ee] flex gap-3">
                <button
                  onClick={() => { setPresetKey(null); setPresetDraft(null); }}
                  className="flex-1 py-2 rounded-[8px] border border-[#e2e2df] text-[13px] text-[#888] hover:bg-[#f7f7f5] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPreset}
                  className="flex-1 py-2 rounded-[8px] bg-[#1c1c1a] text-white text-[13px] font-semibold hover:opacity-85 transition-opacity"
                >
                  Apply Strategy
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
