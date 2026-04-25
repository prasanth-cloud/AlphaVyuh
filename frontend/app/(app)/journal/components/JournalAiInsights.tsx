"use client";

import { Card } from "@/components/ui";
import type { AiPatterns } from "./types";

interface JournalAiInsightsProps {
  patterns: AiPatterns | null;
  patternsLoading: boolean;
  aiAnalysis: string | null;
  aiTradesCount: number;
  aiLoading: boolean;
  aiError: string;
  closedTrades: number;
  reviewedTrades: number;
  autoAnalysisStarted: boolean;
  onAnalyse: () => void;
}

export function JournalAiInsights({
  patterns,
  patternsLoading,
  aiAnalysis,
  aiTradesCount,
  aiLoading,
  aiError,
  closedTrades,
  reviewedTrades,
  autoAnalysisStarted,
  onAnalyse,
}: JournalAiInsightsProps) {
  const reviewCoverage = closedTrades > 0 ? Math.round((reviewedTrades / closedTrades) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card padding="lg">
        <h2 className="heading-card" style={{ marginBottom: 4 }}>Review loop</h2>
        <div className="body-secondary" style={{ marginBottom: 16 }}>
          AlphaVyuh should remove the friction after execution: chart order to journal, closed-trade review, then pattern analysis.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          {[
            { label: "Closed trades", value: String(closedTrades), tone: "var(--text-primary)" },
            { label: "Reviewed trades", value: String(reviewedTrades), tone: reviewedTrades > 0 ? "var(--gain)" : "var(--text-primary)" },
            { label: "Coverage", value: `${reviewCoverage}%`, tone: reviewCoverage >= 70 ? "var(--gain)" : reviewCoverage >= 40 ? "var(--warn)" : "var(--text-primary)" },
          ].map((item) => (
            <div key={item.label} style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
              <div className="label" style={{ marginBottom: 4 }}>{item.label}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: item.tone }}>{item.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Pattern stats */}
      <Card padding="lg">
        <h2 className="heading-card" style={{ marginBottom: 4 }}>Pattern stats</h2>
        <div className="body-secondary" style={{ marginBottom: 16 }}>Computed from your closed trades — no AI needed.</div>

        {patternsLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: 40, borderRadius: "var(--radius-md)", background: "var(--surface-3)" }} />)}
          </div>
        ) : !patterns?.ready ? (
          <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: "var(--text-tertiary)" }}>
            Close at least {patterns?.min_trades_required ?? 3} trades to see pattern stats.
            {patterns?.trades_available != null && patterns.trades_available > 0 && (
              <span style={{ display: "block", marginTop: 4 }}>You have {patterns.trades_available} so far.</span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Holding period */}
            {(patterns.avg_hold_winners != null || patterns.avg_hold_losers != null) && (
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Avg holding period</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {patterns.avg_hold_winners != null && (
                    <div style={{ flex: 1, borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: "var(--gain-subtle)" }}>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--gain)" }}>{patterns.avg_hold_winners}d</div>
                      <div className="caption" style={{ marginTop: 4 }}>Winners</div>
                    </div>
                  )}
                  {patterns.avg_hold_losers != null && (
                    <div style={{ flex: 1, borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: "var(--loss-subtle)" }}>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--loss)" }}>{patterns.avg_hold_losers}d</div>
                      <div className="caption" style={{ marginTop: 4 }}>Losers</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Day of week */}
            {(patterns.day_of_week?.length ?? 0) > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Win rate by day</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {patterns.day_of_week!.map(d => (
                    <div key={d.day} style={{ flex: "1 1 60px", minWidth: 60, borderRadius: "var(--radius-md)", padding: "8px 8px", textAlign: "center", border: "1px solid var(--border-subtle)" }}>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: d.win_rate >= 60 ? "var(--gain)" : d.win_rate >= 40 ? "var(--warn)" : "var(--loss)" }}>
                        {d.win_rate}%
                      </div>
                      <div className="caption" style={{ marginTop: 2 }}>{d.day.slice(0, 3)}</div>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{d.trades}t</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Holding period buckets */}
            {(patterns.by_holding_period?.length ?? 0) > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Win rate by holding period</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {patterns.by_holding_period!.map(b => (
                    <div key={b.bucket} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ flex: "0 0 110px", fontSize: 11, color: "var(--text-secondary)" }}>{b.bucket}</span>
                      <div style={{ flex: 1, height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${b.win_rate}%`, background: b.win_rate >= 60 ? "var(--gain)" : b.win_rate >= 40 ? "var(--warn)" : "var(--loss)", transition: "width 600ms var(--ease-out)" }} />
                      </div>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600, flex: "0 0 36px", textAlign: "right", color: b.win_rate >= 60 ? "var(--gain)" : b.win_rate >= 40 ? "var(--warn)" : "var(--loss)" }}>
                        {b.win_rate}%
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)", flex: "0 0 24px" }}>{b.trades}t</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Long vs Short */}
            {(patterns.by_direction?.length ?? 0) > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Long vs short</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {patterns.by_direction!.map(d => (
                    <div key={d.direction} style={{ flex: 1, borderRadius: "var(--radius-md)", padding: "10px 12px", border: "1px solid var(--border-subtle)" }}>
                      <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: d.win_rate >= 50 ? "var(--gain)" : "var(--loss)" }}>{d.win_rate}%</div>
                      <div style={{ fontSize: 11, marginTop: 2, color: "var(--text-secondary)" }}>{d.direction} · {d.trades} trades</div>
                      <div className="mono" style={{ fontSize: 11, marginTop: 2, color: d.total_pnl >= 0 ? "var(--gain)" : "var(--loss)" }}>
                        {d.total_pnl >= 0 ? "+" : ""}₹{Math.abs(d.total_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* AI deep analysis */}
      <Card padding="lg">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 className="heading-card" style={{ marginBottom: 4 }}>AI review</h2>
            <div className="body-secondary">Run a journal-wide review to surface repeat mistakes, strength areas, and process rules worth adding to your playbook.</div>
          </div>
          <button
            onClick={onAnalyse}
            disabled={aiLoading}
            style={{ flexShrink: 0, padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 700, background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid var(--accent)", cursor: "pointer", opacity: aiLoading ? 0.5 : 1, marginLeft: 16 }}
          >
            {aiLoading ? "Reviewing…" : aiAnalysis ? "Run review again" : "Review my journal"}
          </button>
        </div>

        {aiError && (
          <div style={{ fontSize: 13, color: "var(--loss)", background: "var(--loss-subtle)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 12 }}>
            {aiError}
          </div>
        )}

        {aiLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid var(--surface-3)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
            <div className="caption">{autoAnalysisStarted ? "Auto-review is reading your latest closed trades…" : "Reviewing your journal and looking for repeat patterns…"}</div>
          </div>
        )}

        {aiAnalysis && !aiLoading && (
          <div>
            <div className="caption" style={{ marginBottom: 12 }}>Based on {aiTradesCount} closed trades</div>
            <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: 11, lineHeight: 1.6, background: "var(--warn-subtle)", border: "1px solid var(--border-subtle)", color: "var(--warn)" }}>
              AI analysis is for educational purposes only and does not constitute SEBI-registered investment advice.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-primary)" }}>
              {aiAnalysis.split("\n").map((line, i) => {
                if (line.startsWith("## ") || line.startsWith("### ")) {
                  return <div key={i} style={{ fontSize: 13, fontWeight: 700, marginTop: 16, marginBottom: 4, color: "var(--text-primary)" }}>{line.replace(/^#+\s/, "")}</div>;
                }
                if (line.startsWith("**") && line.endsWith("**")) {
                  return <div key={i} style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{line.replace(/\*\*/g, "")}</div>;
                }
                if (line.startsWith("- ") || line.startsWith("* ")) {
                  return (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                      <span style={{ color: "var(--text-tertiary)", flexShrink: 0, marginTop: 2 }}>•</span>
                      <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                    </div>
                  );
                }
                if (line.trim() === "") return <div key={i} style={{ height: 6 }} />;
                return <div key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />;
              })}
            </div>
          </div>
        )}

        {!aiAnalysis && !aiLoading && !aiError && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div className="body-secondary">
              {closedTrades >= 3
                ? "Your journal is ready for review. You can run it manually, and AlphaVyuh will also try to start it automatically once enough closed trades exist."
                : "Close a few more trades to unlock journal-wide coaching."}
            </div>
            <div className="caption" style={{ marginTop: 4 }}>Requires at least 3 closed trades.</div>
          </div>
        )}
      </Card>
    </div>
  );
}
