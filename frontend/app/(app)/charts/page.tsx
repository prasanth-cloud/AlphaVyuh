"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getCandles,
  getWorkflowStates,
  prefetchCandles,
  upsertWorkflowState,
  type CandlesResponse,
  type WorkflowState,
} from "@/lib/api";
import {
  formatChartCoverageRange,
  getWatchlistChartRequest,
  type WatchlistChartTimeframe,
} from "@/lib/watchlist-chart-range";
import { formatMarketDataSource } from "@/lib/data-copy";
import {
  buildMultiChartDecisionPatch,
  buildMultiChartReviewHref,
  type MultiChartReviewDecision,
  normalizeMultiChartSymbols,
  tradingViewNseSymbols,
} from "@/lib/multi-chart-review";
import { defaultIndicators } from "@/components/charts/indicators";
import { EyebrowLabel, Num } from "@/components/ui";

const MiniChart = dynamic(() => import("@/components/charts/MiniChart"), { ssr: false });

type ChartCardState = {
  symbol: string;
  data: CandlesResponse | null;
  loading: boolean;
  error: string | null;
};

const REVIEW_RANGES: WatchlistChartTimeframe[] = ["1Y", "3Y", "5Y"];

function sourceLabel(source: string | null, watchlist: string | null) {
  if (source === "watchlist") return watchlist ? `Watchlist · ${watchlist}` : "Watchlist review";
  if (source === "scanner") return "Scanner review";
  return "Manual review";
}

export default function ChartsIndexPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get("from");
  const watchlistId = searchParams.get("watchlistId");
  const watchlistName = searchParams.get("watchlist");
  const symbols = useMemo(() => normalizeMultiChartSymbols(searchParams.get("symbols")), [searchParams]);
  const [rangeLabel, setRangeLabel] = useState<WatchlistChartTimeframe>("1Y");
  const [cards, setCards] = useState<ChartCardState[]>([]);
  const [workflowBySymbol, setWorkflowBySymbol] = useState<Record<string, WorkflowState>>({});
  const [decisionSaving, setDecisionSaving] = useState<string | null>(null);
  const [decisionMessage, setDecisionMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    if (symbols.length === 0) {
      router.replace("/charts/RELIANCE");
    }
  }, [router, symbols.length]);

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    const request = getWatchlistChartRequest(rangeLabel);
    const params = {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    };

    setCards(symbols.map((symbol) => ({ symbol, data: null, loading: true, error: null })));
    symbols.forEach((symbol) => {
      getCandles(symbol, params)
        .then((data) => {
          if (cancelled) return;
          setCards((current) => current.map((card) => card.symbol === symbol ? { symbol, data, loading: false, error: null } : card));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : "Chart data is temporarily unavailable.";
          setCards((current) => current.map((card) => card.symbol === symbol ? { symbol, data: null, loading: false, error: message } : card));
        });
    });

    const timer = window.setTimeout(() => {
      symbols.forEach((symbol) => prefetchCandles(symbol, params));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rangeLabel, symbols]);

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    getWorkflowStates({ symbols, watchlistId: watchlistId ?? undefined })
      .then((states) => {
        if (cancelled) return;
        setWorkflowBySymbol(Object.fromEntries(states.map((state) => [state.symbol, state])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbols, watchlistId]);

  async function copyTradingViewSymbols() {
    const text = tradingViewNseSymbols(symbols);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("TradingView symbols copied.");
    } catch {
      setCopyMessage(text);
    } finally {
      window.setTimeout(() => setCopyMessage(""), 3000);
    }
  }

  const loadedCount = cards.filter((card) => card.data && !card.error).length;
  const boardHref = buildMultiChartReviewHref(symbols, {
    source: source === "scanner" || source === "watchlist" ? source : "manual",
    watchlistId,
    watchlistName,
  });
  const decisionSource = source === "scanner" || source === "watchlist" ? source : "chart";

  async function saveBoardDecision(symbol: string, lifecycle: MultiChartReviewDecision) {
    const key = `${symbol}:${lifecycle}`;
    setDecisionSaving(key);
    setDecisionMessage("");
    try {
      const existing = workflowBySymbol[symbol];
      const saved = await upsertWorkflowState(buildMultiChartDecisionPatch(symbol, lifecycle, {
        source: existing?.source ?? decisionSource,
        watchlistId: existing?.watchlist_id ?? watchlistId,
        existingTags: existing?.tags,
      }));
      setWorkflowBySymbol((current) => ({ ...current, [saved.symbol]: saved }));
      setDecisionMessage(`${symbol} marked ${lifecycle === "ready" ? "Ready" : lifecycle === "review_later" ? "Later" : "Invalidated"}.`);
    } catch {
      setDecisionMessage(`${symbol} decision could not be saved.`);
    } finally {
      setDecisionSaving(null);
      window.setTimeout(() => setDecisionMessage(""), 3000);
    }
  }

  if (symbols.length === 0) {
    return null;
  }

  return (
    <div className="workspace-page" style={{ background: "transparent", minHeight: "100vh" }}>
      <div className="workspace-card" style={{ padding: "14px 18px" }}>
        <div className="workspace-toolbar" style={{ minHeight: "auto", padding: 0, border: "none", gap: 16 }}>
          <div>
            <EyebrowLabel>Multi-chart review</EyebrowLabel>
            <div className="app-page-title" style={{ marginTop: 4 }}>Review board</div>
            <div className="workspace-card-copy" style={{ maxWidth: 760 }}>
              Compare up to four scanner or watchlist candidates with the same range, EOD source labels, and quick handoff back into full chart planning.
            </div>
          </div>
          <div className="workspace-pill-row" style={{ justifyContent: "flex-end" }}>
            <span className="workspace-pill">{sourceLabel(source, watchlistName)}</span>
            <span className="workspace-pill"><Num>{loadedCount}</Num> / <Num>{symbols.length}</Num> loaded</span>
          </div>
        </div>
        <div className="workspace-pill-row" style={{ marginTop: 12, gap: 8 }}>
          {REVIEW_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setRangeLabel(range)}
              className={`workspace-chip-button${rangeLabel === range ? " active" : ""}`}
            >
              {range}
            </button>
          ))}
          <button type="button" className="workspace-chip-button" onClick={copyTradingViewSymbols}>
            Copy TV symbols
          </button>
          {watchlistId && (
            <Link href={`/watchlist?id=${encodeURIComponent(watchlistId)}`} prefetch={false} className="workspace-chip-button">
              Back to watchlist
            </Link>
          )}
          <Link href={boardHref} prefetch={false} className="workspace-chip-button">
            Share board
          </Link>
          {decisionMessage && <span className="workspace-pill">{decisionMessage}</span>}
          {copyMessage && <span className="workspace-pill" style={{ color: copyMessage.includes("NSE:") ? "var(--text-primary)" : "var(--gain)" }}>{copyMessage}</span>}
        </div>
      </div>

      <div
        data-testid="multi-chart-review-board"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        {cards.map((card) => {
          const latest = card.data?.latest;
          const coverage = card.data ? formatChartCoverageRange(card.data.coverage, card.data.candles) : null;
          const sourceText = card.data?.source_metadata?.source_name ?? card.data?.source;
          const workflow = workflowBySymbol[card.symbol];
          const lifecycle = workflow?.lifecycle;
          return (
            <div
              key={card.symbol}
              data-testid={`multi-chart-card-${card.symbol}`}
              className="workspace-card"
              style={{ padding: 14, minHeight: 420, display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div className="workspace-toolbar" style={{ minHeight: "auto", padding: 0, border: "none", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{card.symbol}</div>
                  <div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
                    {card.data?.company_name ?? "Loading chart context"}
                  </div>
                </div>
                {latest && (
                  <div style={{ textAlign: "right" }}>
                    <Num style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 800 }}>
                      ₹{latest.close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Num>
                    <div className="caption" style={{ color: (latest.pct_change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" }}>
                      {latest.pct_change != null ? `${latest.pct_change >= 0 ? "+" : ""}${latest.pct_change.toFixed(2)}%` : "—"}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ minHeight: 280, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "#040507" }}>
                {card.loading ? (
                  <div className="caption" style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>Loading {card.symbol}…</div>
                ) : card.error ? (
                  <div className="caption" style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, color: "var(--warn)", textAlign: "center" }}>
                    {card.error}
                  </div>
                ) : card.data ? (
                  <MiniChart candles={card.data.candles} height={280} indicators={defaultIndicators} />
                ) : null}
              </div>

              <div className="workspace-pill-row" style={{ gap: 6 }}>
                {coverage && <span className="workspace-pill">{coverage}</span>}
                {sourceText && <span className="workspace-pill">Source: {formatMarketDataSource(sourceText)}</span>}
                {card.data?.coverage?.as_of && <span className="workspace-pill">As of {card.data.coverage.as_of}</span>}
                {lifecycle && <span className="workspace-pill">Decision: {lifecycle.replace("_", " ")}</span>}
              </div>

              <div className="workspace-pill-row" style={{ marginTop: "auto", gap: 8 }}>
                {([
                  ["ready", "Ready"],
                  ["review_later", "Later"],
                  ["invalidated", "Invalidate"],
                ] as const).map(([nextLifecycle, label]) => (
                  <button
                    key={nextLifecycle}
                    type="button"
                    className={`workspace-chip-button${lifecycle === nextLifecycle ? " active" : ""}`}
                    disabled={decisionSaving === `${card.symbol}:${nextLifecycle}`}
                    onClick={() => void saveBoardDecision(card.symbol, nextLifecycle)}
                  >
                    {decisionSaving === `${card.symbol}:${nextLifecycle}` ? "Saving..." : label}
                  </button>
                ))}
                <Link
                  href={`/charts/${card.symbol}?full=1${source === "watchlist" ? `&from=watchlist${watchlistId ? `&watchlistId=${encodeURIComponent(watchlistId)}` : ""}${watchlistName ? `&watchlist=${encodeURIComponent(watchlistName)}` : ""}` : source === "scanner" ? "&from=scanner" : ""}`}
                  prefetch={false}
                  className="workspace-chip-button active"
                >
                  Full chart
                </Link>
                <Link href={`/journal?symbol=${card.symbol}`} prefetch={false} className="workspace-chip-button">
                  Journal
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
