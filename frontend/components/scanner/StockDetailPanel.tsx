"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ScanResult } from "@/lib/api";
import { addToWatchlist, getWatchlists } from "@/lib/api";
import RsiBadge from "./RsiBadge";
import PctChange from "./PctChange";

type Props = {
  stock: ScanResult;
  onClose: () => void;
};

export default function StockDetailPanel({ stock, onClose }: Props) {
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const [showWlPicker, setShowWlPicker] = useState(false);
  const [watchlists, setWatchlists] = useState<{ id: string; name: string }[]>([]);

  async function handleAddClick() {
    try {
      const wls = await getWatchlists();
      setWatchlists(wls.map(w => ({ id: w.id, name: w.name })));
      setShowWlPicker(true);
    } catch (error) {
      setAddMsg(error instanceof Error ? error.message : "Watchlist data is temporarily unavailable.");
      setTimeout(() => setAddMsg(""), 3500);
    }
  }

  async function handlePick(wlId: string) {
    setShowWlPicker(false);
    setAdding(true);
    try {
      await addToWatchlist(wlId, stock.symbol);
      setAddMsg("Added!");
    } catch (e: unknown) {
      setAddMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setAdding(false);
      setTimeout(() => setAddMsg(""), 2000);
    }
  }

  const w52pct = stock.week_52_high && stock.week_52_low
    ? ((stock.close - stock.week_52_low) / (stock.week_52_high - stock.week_52_low)) * 100
    : null;

  return (
    <div className="w-[268px] flex-shrink-0 bg-white border-l border-[#e2e2df] flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[#f0f0ee]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-bold text-[#1c1c1a]">{stock.symbol}</span>
            {stock.sector && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[#e2e2df] text-[#888]">
                {stock.sector}
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#aaa] mt-0.5 leading-tight">{stock.company_name}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[16px] font-semibold tabular-nums text-[#1c1c1a]">
              ₹{stock.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
            <PctChange pct={stock.pct_change} />
          </div>
        </div>
        <button onClick={onClose} className="text-[#aaa] hover:text-[#1c1c1a] mt-0.5">
          <X size={16} />
        </button>
      </div>

      {/* OHLCV grid */}
      <div className="p-4 border-b border-[#f0f0ee]">
        <div className="text-[10px] uppercase tracking-[0.4px] text-[#aaa] mb-2 font-medium">Today&apos;s OHLCV</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Open",   `₹${stock.open?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`],
            ["High",   `₹${stock.high?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`],
            ["Low",    `₹${stock.low?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`],
            ["Close",  `₹${stock.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`],
            ["Volume", stock.volume?.toLocaleString("en-IN")],
            ["Turnover", stock.atr_14 != null ? `${stock.atr_14.toFixed(2)} ATR` : "—"],
          ].map(([label, val]) => (
            <div key={label} className="bg-[#f7f7f5] rounded px-2.5 py-2">
              <div className="text-[10px] text-[#aaa] uppercase tracking-[0.3px]">{label}</div>
              <div className="text-[12px] font-medium text-[#1c1c1a] tabular-nums mt-0.5">{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Key metrics */}
      <div className="p-4 border-b border-[#f0f0ee]">
        <div className="text-[10px] uppercase tracking-[0.4px] text-[#aaa] mb-2 font-medium">Key Metrics</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#666]">RSI (14)</span>
            <RsiBadge rsi={stock.rsi_14} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#666]">Vol Ratio</span>
            <span className="text-[12px] font-medium tabular-nums" style={{ color: "#d6dce5" }}>
              {stock.volume_ratio != null ? `${stock.volume_ratio.toFixed(2)}x` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#666]">ATR (14)</span>
            <span className="text-[12px] font-medium tabular-nums text-[#1c1c1a]">
              {stock.atr_14 != null ? stock.atr_14.toFixed(2) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* 52W range bar */}
      {stock.week_52_high && stock.week_52_low && (
        <div className="p-4 border-b border-[#f0f0ee]">
          <div className="text-[10px] uppercase tracking-[0.4px] text-[#aaa] mb-2 font-medium">52-Week Range</div>
          <div className="relative h-[3px] bg-[#f0f0ee] rounded-full mx-1 my-3">
            <div
              className="absolute h-[3px] bg-[#f4f7fb] rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, w52pct ?? 0))}%` }}
            />
            <div
              className="absolute w-2.5 h-2.5 bg-[#1c1c1a] rounded-full border-2 border-white -translate-y-[35%] -translate-x-1/2"
              style={{ left: `${Math.min(100, Math.max(0, w52pct ?? 0))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] tabular-nums text-[#aaa]">
            <span>₹{stock.week_52_low?.toLocaleString("en-IN")}</span>
            <span>₹{stock.week_52_high?.toLocaleString("en-IN")}</span>
          </div>
        </div>
      )}

      {/* EMA stack */}
      <div className="p-4 border-b border-[#f0f0ee]">
        <div className="text-[10px] uppercase tracking-[0.4px] text-[#aaa] mb-2 font-medium">EMA Levels</div>
        <div className="space-y-1.5">
          {[
            ["EMA 20",  stock.ema_20],
            ["EMA 50",  stock.ema_50],
            ["EMA 200", stock.ema_200],
          ].map(([label, ema]) => {
            const e = ema as number | null;
            const above = e != null && stock.close > e;
            return (
              <div key={label as string} className="flex items-center justify-between">
                <span className="text-[12px] text-[#666]">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] tabular-nums text-[#888]">
                    {e != null ? `₹${e.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                  </span>
                  {e != null && (
                    <span className="text-[11px] font-medium" style={{ color: above ? "#26a65b" : "#e5383b" }}>
                      {above ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-2">
        {showWlPicker ? (
          <div className="border border-[#e2e2df] rounded-[7px] overflow-hidden">
            <div className="px-3 py-2 bg-[#f7f7f5] text-[11px] text-[#888] font-medium">Pick a watchlist</div>
            {watchlists.map(wl => (
              <button key={wl.id} onClick={() => handlePick(wl.id)}
                className="w-full text-left px-3 py-2 text-[12px] text-[#1c1c1a] hover:bg-[#f7f7f5] border-t border-[#f0f0ee]">
                {wl.name}
              </button>
            ))}
            <button onClick={() => setShowWlPicker(false)}
              className="w-full text-left px-3 py-2 text-[12px] text-[#888] hover:bg-[#f7f7f5] border-t border-[#f0f0ee]">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleAddClick}
            disabled={adding}
            className="w-full py-2 rounded-[7px] bg-[#1c1c1a] text-white text-[13px] font-medium hover:opacity-85 transition-opacity disabled:opacity-60"
          >
            {addMsg || (adding ? "Adding…" : "Add to watchlist")}
          </button>
        )}
        <a
          href={`/charts/${stock.symbol}`}
          className="block w-full py-2 rounded-[7px] border border-[#e2e2df] text-[13px] text-[#666] hover:border-[#f4f7fb] hover:text-[#f4f7fb] transition-colors text-center"
        >
          View chart →
        </a>
      </div>
    </div>
  );
}
