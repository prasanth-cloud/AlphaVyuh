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
  getWatchlistChartRequest,
  type WatchlistChartTimeframe,
} from "@/lib/watchlist-chart-range";
import { formatMarketDataSource } from "@/lib/data-copy";
import {
  buildMultiChartAnalysisSummary,
  buildMultiChartAlertDraft,
  buildMultiChartDecisionPatch,
  buildMultiChartReviewHref,
  buildMultiChartTrustContext,
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

const REVIEW_RANGES: WatchlistChartTimeframe[] = ["1Y", "3Y", "5Y", "Max"];

function sourceLabel(source: string | null, watchlist: string | null) {
  if (source === "watchlist") return watchlist ? `Watchlist · ${watchlist}` : "Watchlist review";
  if (source === "scanner") return "Scanner review";
  return "Manual review";
}

function analysisToneColor(tone: "good" | "warn" | "muted") {
  if (tone === "good") return "var(--gain)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-secondary)";
}

export default function ChartsIndexPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get("from");
  const watchlistId = searchParams.get("watchlistId");
  const watchlistName = searchParams.get("watchlist");
  const symbols = useMemo(() => normalizeMultiChartSymbols(searchParams.get("symbols")), [searchParams]);
  const [rangeLabel, setRangeLabel] = useState<WatchlistChartTimeframe>("5Y");
  const [cards, setCards] = useState<ChartCardState[]>([]);
  const [workflowBySymbol, setWorkflowBySymbol] = useState<Record<string, WorkflowState>>({});
  const [decisionSaving, setDecisionSaving] = useState<string | null>(null);
  const [decisionMessage, setDecisionMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const activeRequest = useMemo(() => getWatchlistChartRequest(rangeLabel), [rangeLabel]);

  useEffect(() => {
    if (symbols.length === 0) {
      router.replace("/charts/RELIANCE");
    }
  }, [router, symbols.length]);

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    const params = {
      limit: activeRequest.limit,
      timeframe: activeRequest.timeframe,
      from_date: activeRequest.from_date,
      to_date: activeRequest.to_date,
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
  }, [activeRequest, symbols]);

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

  async function saveBoardDecision(
    symbol: string,
    lifecycle: MultiChartReviewDecision,
    context: {
      analysis?: ReturnType<typeof buildMultiChartAnalysisSummary>;
      alertDraft?: ReturnType<typeof buildMultiChartAlertDraft>;
      trust?: ReturnType<typeof buildMultiChartTrustContext>;
    } = {},
  ) {
    const key = `${symbol}:${lifecycle}`;
    setDecisionSaving(key);
    setDecisionMessage("");
    try {
      const existing = workflowBySymbol[symbol];
      const saved = await upsertWorkflowState(buildMultiChartDecisionPatch(symbol, lifecycle, {
        source: existing?.source ?? decisionSource,
        watchlistId: existing?.watchlist_id ?? watchlistId,
        existingTags: existing?.tags,
        existingNotes: existing?.notes,
        analysis: context.analysis,
        trust: context.trust,
        alertDraft: context.alertDraft,
        rangeLabel,
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
          const trust = buildMultiChartTrustContext(card.data, activeRequest);
          const workflow = workflowBySymbol[card.symbol];
          const lifecycle = workflow?.lifecycle;
          const analysis = buildMultiChartAnalysisSummary(card.data, workflow?.scanner_context);
          const alertDraft = buildMultiChartAlertDraft(card.data, analysis);
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
                {trust && <span className="workspace-pill">{trust.coverageLabel}</span>}
                {trust && <span className="workspace-pill">Source: {formatMarketDataSource(trust.sourceLabel)}</span>}
                {trust && <span className="workspace-pill">{trust.granularityLabel}</span>}
                {trust?.asOf && <span className="workspace-pill">As of {trust.asOf}</span>}
                {trust && <span className="workspace-pill" style={{ color: analysisToneColor(trust.contractTone) }}>{trust.contractLabel}</span>}
                {lifecycle && <span className="workspace-pill">Decision: {lifecycle.replace("_", " ")}</span>}
              </div>
              {trust?.availabilityMessage && (
                <div
                  className="caption"
                  data-testid={`multi-chart-history-warning-${card.symbol}`}
                  style={{ color: "var(--warn)", lineHeight: 1.5 }}
                >
                  {trust.availabilityMessage}
                </div>
              )}

              {analysis && (
                <div
                  data-testid={`multi-chart-analysis-${card.symbol}`}
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-2)",
                  }}
                >
                  <div className="workspace-toolbar" style={{ minHeight: "auto", padding: 0, border: "none", gap: 8 }}>
                    <div className="label">Analysis context</div>
                    <div className="workspace-pill-row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <span className="workspace-pill" style={{ color: analysisToneColor(analysis.reviewScore.tone) }}>
                        {analysis.reviewScore.label}
                      </span>
                      <span className="workspace-pill" style={{ color: analysisToneColor(analysis.playbookStatus === "ready" ? "good" : analysis.playbookStatus === "watch" ? "warn" : "muted") }}>
                        {analysis.playbookDetail}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                    {analysis.metrics.map((item) => (
                      <div key={item.label} style={{ minWidth: 0, padding: "7px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
                        <div className="caption" style={{ marginBottom: 2 }}>{item.label}</div>
                        <Num style={{ fontSize: 12, fontWeight: 800, color: analysisToneColor(item.tone), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                          {item.value}
                        </Num>
                      </div>
                    ))}
                  </div>
                  <div className="caption" style={{ lineHeight: 1.55 }}>
                    {analysis.checklist.slice(0, 3).join(" · ")}
                  </div>
                  {analysis.reviewScore.blockers.length > 0 && (
                    <div className="caption" style={{ lineHeight: 1.55, color: "var(--warn)" }}>
                      Needs: {analysis.reviewScore.blockers.slice(0, 3).join(" · ")}
                    </div>
                  )}
                </div>
              )}

              {alertDraft && (
                <div
                  data-testid={`multi-chart-alert-draft-${card.symbol}`}
                  style={{
                    display: "grid",
                    gap: 6,
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-1)",
                  }}
                >
                  <div className="workspace-toolbar" style={{ minHeight: "auto", padding: 0, border: "none", gap: 8 }}>
                    <div className="label">Alert draft</div>
                    <span className="workspace-pill" style={{ color: analysisToneColor(alertDraft.tone) }}>
                      {alertDraft.triggerLabel}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                    <div>
                      <div className="caption">Trigger</div>
                      <Num style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>
                        ₹{alertDraft.triggerPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </Num>
                    </div>
                    <div>
                      <div className="caption">Invalidation</div>
                      <Num style={{ fontSize: 12, fontWeight: 800, color: "var(--warn)" }}>
                        ₹{alertDraft.invalidationPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </Num>
                    </div>
                  </div>
                  <div className="caption" style={{ lineHeight: 1.5 }}>{alertDraft.detail}</div>
                </div>
              )}

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
                    onClick={() => void saveBoardDecision(card.symbol, nextLifecycle, { analysis, alertDraft, trust })}
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
