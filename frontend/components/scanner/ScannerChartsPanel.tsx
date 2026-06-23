"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getCandles,
  prefetchCandles,
  type CandlesResponse,
} from "@/lib/api";
import { getWatchlistChartRequest } from "@/lib/watchlist-chart-range";
import { buildMultiChartReviewHref } from "@/lib/multi-chart-review";
import type { ChartIndicator } from "@/components/charts/types";
import { Num } from "@/components/ui";
import { displayCompanyName } from "@/lib/company-display";

const MiniChart = dynamic(() => import("@/components/charts/MiniChart"), { ssr: false });

const SCANNER_MINI_INDICATORS: ChartIndicator[] = [
  { type: "ema", params: { period: 20 } },
  { type: "ema", params: { period: 50 } },
  { type: "volume", params: {} },
];

export type ScannerChartRow = {
  symbol: string;
  company_name: string | null;
  close: number;
  pct_change: number | null;
  rs_score: number | null;
};

type ChartTileState = {
  symbol: string;
  data: CandlesResponse | null;
  loading: boolean;
  error: string | null;
};

type Props = {
  results: ScannerChartRow[];
  selected: Set<string>;
  layout: "2-up" | "4-up";
  onToggleSelect: (symbol: string, checked: boolean) => void;
  onOpenChart: (result: ScannerChartRow) => void;
  onMark: (symbols: string[], mark: "shortlist" | "review_later" | "ignored") => void;
  onAddToWatchlist?: (symbol: string, watchlistId: string) => void;
  watchlists?: Array<{ id: string; name: string }>;
  onReport?: (symbol: string) => void;
};

export function ScannerChartsPanel({
  results,
  selected,
  layout,
  onToggleSelect,
  onOpenChart,
  onMark,
  onAddToWatchlist,
  watchlists = [],
  onReport,
}: Props) {
  const symbols = useMemo(() => results.map((row) => row.symbol), [results]);
  const boardHref = useMemo(
    () => buildMultiChartReviewHref(symbols.slice(0, 4), { source: "scanner", layout }),
    [layout, symbols],
  );
  const [tiles, setTiles] = useState<ChartTileState[]>([]);
  const chartRequest = useMemo(() => getWatchlistChartRequest("1Y"), []);
  const candleParams = useMemo(
    () => ({
      limit: chartRequest.limit,
      timeframe: chartRequest.timeframe,
      from_date: chartRequest.from_date,
      to_date: chartRequest.to_date,
    }),
    [chartRequest],
  );

  useEffect(() => {
    if (symbols.length === 0) {
      setTiles([]);
      return;
    }
    let cancelled = false;
    setTiles(symbols.map((symbol) => ({ symbol, data: null, loading: true, error: null })));

    symbols.forEach((symbol) => {
      getCandles(symbol, candleParams)
        .then((data) => {
          if (cancelled) return;
          setTiles((current) =>
            current.map((tile) =>
              tile.symbol === symbol ? { symbol, data, loading: false, error: null } : tile,
            ),
          );
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : "Chart data is temporarily unavailable.";
          setTiles((current) =>
            current.map((tile) =>
              tile.symbol === symbol ? { symbol, data: null, loading: false, error: message } : tile,
            ),
          );
        });
    });

    const timer = window.setTimeout(() => {
      symbols.forEach((symbol) => prefetchCandles(symbol, candleParams));
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [candleParams, symbols]);

  const tileBySymbol = useMemo(
    () => Object.fromEntries(tiles.map((tile) => [tile.symbol, tile])),
    [tiles],
  );

  return (
    <div className="scanner-charts-panel" data-testid="scanner-charts-panel">
      <div className="scanner-charts-toolbar">
        <span className="caption">
          <Num>{results.length}</Num> chart{results.length === 1 ? "" : "s"} · 1Y daily
        </span>
        {symbols.length > 0 && (
          <Link href={boardHref} prefetch={false} className="workspace-chip-button scanner-charts-board-link">
            Full review board
          </Link>
        )}
      </div>
      <div
        className={`scanner-charts-grid scanner-charts-grid-${layout}`}
        data-testid={`scanner-charts-grid-${layout}`}
      >
        {results.map((row) => {
          const tile = tileBySymbol[row.symbol];
          const latest = tile?.data?.latest;
          const pct = latest?.pct_change ?? row.pct_change;
          const tone = pct == null ? "var(--text-secondary)" : pct >= 0 ? "var(--gain)" : "var(--loss)";
          return (
            <article
              key={row.symbol}
              className="scanner-chart-tile"
              data-testid={`scanner-chart-tile-${row.symbol}`}
            >
              <header className="scanner-chart-tile-header">
                <div className="scanner-chart-tile-select">
                  <input
                    type="checkbox"
                    checked={selected.has(row.symbol)}
                    onChange={(e) => onToggleSelect(row.symbol, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${row.symbol}`}
                  />
                  <button
                    type="button"
                    className="scanner-chart-tile-symbol"
                    onClick={() => onOpenChart(row)}
                  >
                    <span className="mono">{row.symbol}</span>
                    {(() => {
                      const label = displayCompanyName(row.symbol, row.company_name);
                      return label ? <span className="caption scanner-chart-tile-name">{label}</span> : null;
                    })()}
                  </button>
                </div>
                <div className="scanner-chart-tile-actions">
                  {row.rs_score != null && (
                    <span className="scanner-rs-badge" data-testid={`scanner-rs-badge-${row.symbol}`}>
                      RS <Num>{Math.round(row.rs_score)}</Num>
                    </span>
                  )}
                  <button
                    type="button"
                    className="scanner-row-action scanner-row-action-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMark([row.symbol], "shortlist");
                    }}
                  >
                    Shortlist
                  </button>
                  <select
                    aria-label={`More actions for ${row.symbol}`}
                    className="scanner-row-menu scanner-more-select"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      const action = e.target.value;
                      e.target.value = "";
                      if (action === "chart") onOpenChart(row);
                      if (action === "review_later") onMark([row.symbol], "review_later");
                      if (action === "ignore") onMark([row.symbol], "ignored");
                      if (action === "report" && onReport) onReport(row.symbol);
                      if (action.startsWith("wl:") && onAddToWatchlist) onAddToWatchlist(row.symbol, action.slice(3));
                    }}
                  >
                    <option value="">⋯</option>
                    <option value="chart">Open chart</option>
                    {watchlists.map((watchlist) => (
                      <option key={watchlist.id} value={`wl:${watchlist.id}`}>
                        Add to {watchlist.name}
                      </option>
                    ))}
                    <option value="review_later">Review later</option>
                    <option value="ignore">Ignore</option>
                    {onReport ? <option value="report">Report data</option> : null}
                  </select>
                </div>
              </header>

              <button
                type="button"
                className="scanner-chart-tile-quote"
                onClick={() => onOpenChart(row)}
              >
                <Num className="scanner-chart-tile-price">
                  ₹{(latest?.close ?? row.close).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </Num>
                <span className="scanner-chart-tile-ohlc caption">
                  {latest
                    ? `O ${latest.open.toFixed(2)} · H ${latest.high.toFixed(2)} · L ${latest.low.toFixed(2)} · C ${latest.close.toFixed(2)}`
                    : `Close ${row.close.toFixed(2)}`}
                </span>
                <Num className="scanner-chart-tile-change" style={{ color: tone }}>
                  {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                </Num>
              </button>

              <div
                className="scanner-chart-tile-chart"
                data-testid={`scanner-mini-chart-${row.symbol}`}
                onClick={() => onOpenChart(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpenChart(row);
                }}
                role="button"
                tabIndex={0}
              >
                {tile?.loading ? (
                  <div className="scanner-chart-tile-state caption">Loading {row.symbol}…</div>
                ) : tile?.error ? (
                  <div className="scanner-chart-tile-state caption scanner-chart-tile-error">{tile.error}</div>
                ) : tile?.data?.candles?.length ? (
                  <MiniChart
                    candles={tile.data.candles}
                    height={layout === "4-up" ? 220 : 260}
                    indicators={SCANNER_MINI_INDICATORS}
                  />
                ) : (
                  <div className="scanner-chart-tile-state caption">Chart data unavailable.</div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
