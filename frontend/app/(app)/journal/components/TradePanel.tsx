"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { displayCompanyName } from "@/lib/company-display";
import { formatSetupTagDisplay } from "@/lib/setup-tag-display";
import { getJournalWorkflowLinks } from "@/lib/workflow-placement";
import { JOURNAL_RULE_BREAKS, isCompletedProcessReview } from "@/lib/journal-weekly-review";
import type { JournalRuleBreakCode, SaveJournalProcessReviewRequest, SetupAdherence } from "@/lib/api";
import type { JournalEntry, CreateJournalEntry, UpdateJournalEntry, SymbolSearchResult } from "./types";
import type { PanelMode } from "./types";
import { SETUP_TYPES, displayEntryReason, inputStyle, fmtCcy, fmtDate, getReviewContext, getTradeFlowMeta } from "./utils";

// ── SetupChips ────────────────────────────────────────────────────────────────

function SetupChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {SETUP_TYPES.map(s => {
        const active = value === s.toLowerCase();
        return (
          <button key={s} onClick={() => onChange(active ? "" : s.toLowerCase())} style={{
            padding: "3px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer",
            border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
            background: active ? "var(--accent-subtle)" : "transparent",
            color: active ? "var(--accent)" : "var(--text-secondary)",
            borderRadius: "var(--radius-sm)",
            transition: "all var(--motion-instant) var(--ease-out)",
          }}>{s}</button>
        );
      })}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TradePanelProps {
  mode: PanelMode;
  selectedEntry: JournalEntry | null;
  saving: boolean;
  lessonLoading: string | null;
  // Add form
  addForm: Partial<CreateJournalEntry>;
  onAddFormChange: (f: Partial<CreateJournalEntry>) => void;
  symbolQ: string;
  onSymbolQChange: (q: string) => void;
  symbolResults: SymbolSearchResult[];
  symbolSearchError: string;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  tradeValue: number | null;
  riskRupees: number | null;
  rrRatio: string | null;
  riskPerShare: number | null;
  rMultiple: number | null;
  addFormPnl: number | null;
  onAddTrade: () => void;
  // Close form
  closeForm: Partial<UpdateJournalEntry>;
  onCloseFormChange: (f: Partial<UpdateJournalEntry>) => void;
  closeSetupType: string;
  onCloseSetupTypeChange: (v: string) => void;
  pnlPreview: number | null;
  onCloseTrade: () => void;
  // View + shared
  onClose: () => void;
  onGetLesson: (e: JournalEntry) => void;
  onSaveProcessReview: (
    e: JournalEntry,
    review: Omit<SaveJournalProcessReviewRequest, "schema_version" | "expected_updated_at">,
  ) => void;
  onInitiateClose: (e: JournalEntry) => void;
  reviewSaving: boolean;
  chartPrefilled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TradePanel({
  mode,
  selectedEntry,
  saving,
  lessonLoading,
  addForm,
  onAddFormChange,
  symbolQ,
  onSymbolQChange,
  symbolResults,
  symbolSearchError,
  selectedSymbol,
  onSelectSymbol,
  tradeValue,
  riskRupees,
  rrRatio,
  riskPerShare,
  rMultiple,
  addFormPnl,
  onAddTrade,
  closeForm,
  onCloseFormChange,
  closeSetupType,
  onCloseSetupTypeChange,
  pnlPreview,
  onCloseTrade,
  onClose,
  onGetLesson,
  onSaveProcessReview,
  onInitiateClose,
  reviewSaving,
  chartPrefilled,
}: TradePanelProps) {
  const [lessonDraft, setLessonDraft] = useState("");
  const [plannedSetupDraft, setPlannedSetupDraft] = useState("");
  const [adherenceDraft, setAdherenceDraft] = useState<SetupAdherence | null>(null);
  const [ruleBreakDraft, setRuleBreakDraft] = useState<JournalRuleBreakCode[]>([]);

  useEffect(() => {
    setLessonDraft(selectedEntry?.review_lesson ?? selectedEntry?.lessons ?? "");
    setPlannedSetupDraft(selectedEntry?.planned_setup ?? selectedEntry?.setup_type ?? "");
    setAdherenceDraft(selectedEntry?.setup_adherence ?? null);
    setRuleBreakDraft(selectedEntry?.rule_breaks ?? []);
  }, [selectedEntry]);

  if (!mode) return null;
  const flow = selectedEntry ? getTradeFlowMeta(selectedEntry) : null;
  const reviewContext = selectedEntry ? getReviewContext(selectedEntry) : null;
  const reviewDraft = lessonDraft.trim();
  const processReviewComplete = selectedEntry ? isCompletedProcessReview(selectedEntry) : false;
  const needsRuleBreak = adherenceDraft === "partial" || adherenceDraft === "not_followed";
  const processReviewReady = Boolean(
    plannedSetupDraft.trim()
    && adherenceDraft
    && reviewDraft
    && (!needsRuleBreak || ruleBreakDraft.length > 0)
    && (needsRuleBreak || ruleBreakDraft.length === 0),
  );
  const workflowSymbol = selectedEntry?.symbol ?? selectedSymbol;
  const workflowLinks = getJournalWorkflowLinks(workflowSymbol || undefined);

  return (
    <div className="journal-trade-panel">
      <Card padding="lg" style={{ borderRadius: "var(--radius-lg)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div>
              <span className="heading-card">
                {mode === "add" ? "Log trade" : mode === "close" ? `Close ${selectedEntry?.symbol}` : selectedEntry?.symbol}
              </span>
              {selectedEntry && mode !== "add" && displayCompanyName(selectedEntry.symbol, selectedEntry.company_name) ? (
                <div className="caption" style={{ marginTop: 2 }}>{displayCompanyName(selectedEntry.symbol, selectedEntry.company_name)}</div>
              ) : null}
            </div>
            {mode === "add" && chartPrefilled && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "rgba(0,217,167,0.10)", color: "#00D9A7" }}>
                Pre-filled from chart
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ fontSize: 18, lineHeight: 1, color: "var(--text-tertiary)" }}>×</button>
        </div>

        {/* ── ADD FORM ── */}
        {mode === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <div className="label" style={{ marginBottom: 6 }}>Symbol</div>
              <input
                value={selectedSymbol || symbolQ}
                onChange={ev => { onSelectSymbol(""); onSymbolQChange(ev.target.value.toUpperCase()); }}
                placeholder="e.g. RELIANCE"
                style={inputStyle}
              />
              {(symbolResults.length > 0 || symbolSearchError) && !selectedSymbol && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-modal)", zIndex: 20, overflow: "hidden", marginTop: 2, background: "var(--surface-float)", border: "1px solid var(--border-subtle)" }}>
                  {symbolSearchError && (
                    <div data-testid="journal-symbol-search-unavailable" style={{ padding: "8px 12px", fontSize: 12, lineHeight: 1.45, color: "var(--warn)" }}>
                      {symbolSearchError}
                    </div>
                  )}
                  {symbolResults.map(r => (
                    <button key={r.symbol} onClick={() => { onSelectSymbol(r.symbol); onSymbolQChange(r.symbol); }}
                      style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, borderBottom: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                      <span style={{ fontWeight: 500 }}>{r.symbol}</span>
                      {displayCompanyName(r.symbol, r.company_name) ? (
                        <span className="caption" style={{ marginLeft: 8 }}>{displayCompanyName(r.symbol, r.company_name)}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Direction</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["long", "short"] as const).map(t => (
                  <button key={t} onClick={() => onAddFormChange({ ...addForm, trade_type: t })}
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500, cursor: "pointer", textTransform: "capitalize",
                      background: addForm.trade_type === t ? (t === "long" ? "var(--gain-subtle)" : "var(--loss-subtle)") : "var(--surface-3)",
                      color: addForm.trade_type === t ? (t === "long" ? "var(--gain)" : "var(--loss)") : "var(--text-secondary)",
                      border: `1px solid ${addForm.trade_type === t ? (t === "long" ? "var(--gain)" : "var(--loss)") : "var(--border-subtle)"}`,
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Entry date</div>
              <input type="date" value={addForm.entry_date || ""} onChange={ev => onAddFormChange({ ...addForm, entry_date: ev.target.value })} style={inputStyle} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Entry price ₹</div>
                <input type="number" value={addForm.entry_price || ""} onChange={ev => onAddFormChange({ ...addForm, entry_price: parseFloat(ev.target.value) || undefined })} placeholder="0.00" style={inputStyle} />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Quantity</div>
                <input type="number" value={addForm.quantity || ""} onChange={ev => onAddFormChange({ ...addForm, quantity: parseInt(ev.target.value) || undefined })} placeholder="0" style={inputStyle} />
              </div>
            </div>

            {tradeValue && <div className="caption">Trade value: ₹{tradeValue.toLocaleString("en-IN")}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Stop loss ₹</div>
                <input type="number" value={addForm.stop_loss || ""} onChange={ev => onAddFormChange({ ...addForm, stop_loss: parseFloat(ev.target.value) || undefined })} placeholder="optional" style={inputStyle} />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Target ₹</div>
                <input type="number" value={addForm.target_price || ""} onChange={ev => onAddFormChange({ ...addForm, target_price: parseFloat(ev.target.value) || undefined })} placeholder="optional" style={inputStyle} />
              </div>
            </div>

            {(riskRupees || rrRatio) && (
              <div className="caption" style={{ display: "flex", gap: 12 }}>
                {riskRupees && <span>Risk: ₹{riskRupees.toLocaleString("en-IN")}</span>}
                {rrRatio && (
                  <span style={{ fontWeight: 600, color: parseFloat(rrRatio) >= 2 ? "var(--gain)" : "var(--warn)" }}>
                    R:R = 1:{rrRatio} {parseFloat(rrRatio) >= 2 ? "" : "— below 2:1"}
                  </span>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Exit date</div>
                <input type="date" value={(addForm as Record<string, unknown>).exit_date as string || ""} onChange={ev => onAddFormChange({ ...addForm, exit_date: ev.target.value } as typeof addForm)} style={inputStyle} />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Exit price ₹</div>
                <input type="number" value={(addForm as Record<string, unknown>).exit_price as number || ""} onChange={ev => onAddFormChange({ ...addForm, exit_price: parseFloat(ev.target.value) || undefined } as typeof addForm)} placeholder="optional" style={inputStyle} />
              </div>
            </div>

            {(riskPerShare != null || rMultiple != null || addFormPnl != null) && (
              <div style={{ display: "flex", gap: 16, padding: "8px 10px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
                {riskPerShare != null && (
                  <div>
                    <div className="caption" style={{ marginBottom: 2 }}>Risk/share</div>
                    <div className="mono" style={{ fontWeight: 600 }}>₹{riskPerShare.toFixed(2)}</div>
                  </div>
                )}
                {rMultiple != null && (
                  <div>
                    <div className="caption" style={{ marginBottom: 2 }}>R-multiple</div>
                    <div className="mono" style={{ fontWeight: 600 }}>{rMultiple.toFixed(2)}R</div>
                  </div>
                )}
                {addFormPnl != null && (
                  <div>
                    <div className="caption" style={{ marginBottom: 2 }}>P&L</div>
                    <div className="mono" style={{ fontWeight: 600, color: addFormPnl >= 0 ? "#2DB574" : "#E15560" }}>
                      {addFormPnl >= 0 ? "+" : ""}₹{addFormPnl.toLocaleString("en-IN")}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="label" style={{ marginBottom: 8 }}>Setup</div>
              <SetupChips value={addForm.setup_type || ""} onChange={v => onAddFormChange({ ...addForm, setup_type: v || undefined })} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Notes</div>
              <textarea value={addForm.entry_reason || ""} onChange={ev => onAddFormChange({ ...addForm, entry_reason: ev.target.value })} rows={4} placeholder="EMA alignment, volume surge, breakout of resistance…" style={{ ...inputStyle, resize: "none" }} />
            </div>

            <button onClick={onAddTrade} disabled={saving}
              style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 600, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid var(--accent)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Saving…" : "Save trade"}
            </button>
          </div>
        )}

        {/* ── CLOSE FORM ── */}
        {mode === "close" && selectedEntry && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="body-secondary" style={{ paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
              {selectedEntry.trade_type === "long" ? "Long" : "Short"} · {selectedEntry.quantity} qty · Entered ₹{selectedEntry.entry_price.toLocaleString("en-IN")} on {fmtDate(selectedEntry.entry_date)}
            </div>

            {reviewContext && (
              <div style={{ borderRadius: "var(--radius-md)", padding: "10px 12px", background: "rgba(244,247,251,0.04)", border: "1px solid var(--border-subtle)" }}>
                <div className="label" style={{ marginBottom: 6 }}>Original idea</div>
                <div style={{ display: "grid", gap: 5 }}>
                  {(reviewContext.hasContext
                    ? reviewContext.summary
                    : [
                        selectedEntry.entry_reason ? { label: "Entry reason", value: displayEntryReason(selectedEntry.entry_reason) } : null,
                        selectedEntry.stop_loss ? { label: "Stop", value: `₹${selectedEntry.stop_loss.toLocaleString("en-IN")}` } : null,
                        selectedEntry.target_price ? { label: "Target", value: `₹${selectedEntry.target_price.toLocaleString("en-IN")}` } : null,
                      ].filter((item): item is { label: string; value: string } => Boolean(item))
                  ).slice(0, 3).map(item => (
                    <div key={`${item.label}-${item.value}`} style={{ fontSize: 12, lineHeight: 1.45 }}>
                      <span className="caption" style={{ marginRight: 6 }}>{item.label}</span>
                      <span style={{ color: "var(--text-primary)" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Exit date</div>
              <input type="date" value={closeForm.exit_date || ""} onChange={ev => onCloseFormChange({ ...closeForm, exit_date: ev.target.value })} style={inputStyle} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Exit price ₹</div>
              <input type="number" value={closeForm.exit_price || ""} onChange={ev => onCloseFormChange({ ...closeForm, exit_price: parseFloat(ev.target.value) || undefined })} placeholder="0.00" style={inputStyle} />
            </div>

            {pnlPreview != null && (
              <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: "var(--radius-sm)", color: pnlPreview >= 0 ? "var(--gain)" : "var(--loss)", background: pnlPreview >= 0 ? "var(--gain-subtle)" : "var(--loss-subtle)" }}>
                <span className="mono">P&L: {pnlPreview >= 0 ? "+" : ""}{fmtCcy(pnlPreview)} ({((pnlPreview / (selectedEntry.entry_price * selectedEntry.quantity)) * 100).toFixed(2)}%)</span>
              </div>
            )}

            <div>
              <div className="label" style={{ marginBottom: 8 }}>Setup</div>
              <SetupChips value={closeSetupType} onChange={onCloseSetupTypeChange} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Why did you exit?</div>
              <textarea value={closeForm.exit_reason || ""} onChange={ev => onCloseFormChange({ ...closeForm, exit_reason: ev.target.value })} rows={2} placeholder="Target hit, stop loss, chart breakdown…" style={{ ...inputStyle, resize: "none" }} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>What broke or changed?</div>
              <textarea value={closeForm.mistakes || ""} onChange={ev => onCloseFormChange({ ...closeForm, mistakes: ev.target.value })} rows={2} placeholder="Setup failed, ignored stop, market changed…" style={{ ...inputStyle, resize: "none" }} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Lesson to carry forward</div>
              <textarea value={closeForm.lessons || ""} onChange={ev => onCloseFormChange({ ...closeForm, lessons: ev.target.value })} rows={2} placeholder="One process rule to remember next time…" style={{ ...inputStyle, resize: "none" }} />
            </div>

            <button onClick={onCloseTrade} disabled={saving}
              style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 600, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid var(--accent)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Saving…" : "Close trade"}
            </button>
          </div>
        )}

        {/* ── VIEW ── */}
        {mode === "view" && selectedEntry && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {flow && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                <div>
                  <div className="label" style={{ marginBottom: 2 }}>Flow source</div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12 }}>{flow.sourceLabel}</div>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: 2 }}>Execution</div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12 }}>{flow.brokerLabel ? `${flow.brokerLabel} broker` : "Manual journal"}</div>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
              {[
                ["Direction", selectedEntry.trade_type === "long" ? "Long" : "Short"],
                ["Setup", formatSetupTagDisplay(selectedEntry.setup_type)],
                ["Entry date", fmtDate(selectedEntry.entry_date)],
                ["Exit date", fmtDate(selectedEntry.exit_date)],
                ["Entry price", `₹${selectedEntry.entry_price.toLocaleString("en-IN")}`],
                ["Exit price", selectedEntry.exit_price ? `₹${selectedEntry.exit_price.toLocaleString("en-IN")}` : "—"],
                ["Quantity", selectedEntry.quantity.toLocaleString("en-IN")],
                ["Holding days", String(selectedEntry.holding_days ?? "—")],
                ["Stop loss", selectedEntry.stop_loss ? `₹${selectedEntry.stop_loss.toLocaleString("en-IN")}` : "—"],
                ["Target", selectedEntry.target_price ? `₹${selectedEntry.target_price.toLocaleString("en-IN")}` : "—"],
                ["R:R", String(selectedEntry.risk_reward ?? "—")],
                ["P&L", selectedEntry.pnl != null ? fmtCcy(selectedEntry.pnl) : "Open"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="label" style={{ marginBottom: 2 }}>{k}</div>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13 }}>{v}</div>
                </div>
              ))}
            </div>

            {selectedEntry.entry_reason && (
              <div>
                <div className="label" style={{ marginBottom: 4 }}>Entry reason</div>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>{displayEntryReason(selectedEntry.entry_reason)}</p>
              </div>
            )}

            {reviewContext && (
              <div
                data-testid="journal-original-idea"
                style={{
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                  background: "rgba(244,247,251,0.04)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div className="label" style={{ marginBottom: 8 }}>Original idea</div>
                {reviewContext.hasContext ? (
                  <>
                    <div style={{ display: "grid", gap: 7, marginBottom: reviewContext.prompts.length ? 12 : 0 }}>
                      {reviewContext.summary.slice(0, 5).map(item => (
                        <div key={`${item.label}-${item.value}`} style={{ display: "grid", gap: 2 }}>
                          <div className="caption" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</div>
                          <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--text-primary)" }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    {reviewContext.prompts.length > 0 && (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div className="caption" style={{ color: "var(--accent)" }}>Review prompts</div>
                        {reviewContext.prompts.map(prompt => (
                          <div key={prompt} style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)" }}>
                            {prompt}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                    {reviewContext.fallback}
                  </div>
                )}
                {selectedEntry.scanner_context?.chart_snapshot?.chart_url && (
                  <Link
                    href={selectedEntry.scanner_context.chart_snapshot.chart_url}
                    data-testid="journal-chart-snapshot-link"
                    style={{ display: "inline-block", marginTop: 12, fontSize: 12, fontWeight: 600, color: "var(--accent)" }}
                  >
                    Open chart at entry
                  </Link>
                )}
              </div>
            )}

            {selectedEntry.exit_reason && (
              <div>
                <div className="label" style={{ marginBottom: 4 }}>Exit reason</div>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>{selectedEntry.exit_reason}</p>
              </div>
            )}

            {selectedEntry.mistakes && (
              <div>
                <div className="label" style={{ marginBottom: 4 }}>Mistakes</div>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--loss)" }}>{selectedEntry.mistakes}</p>
              </div>
            )}

            {selectedEntry.status === "closed" && (
              <div data-testid="journal-process-review" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div>
                    <div className="label" style={{ marginBottom: 4 }}>Process review</div>
                    <div className="caption">Self-reported adherence evidence. It does not measure profitability or predict outcomes.</div>
                  </div>
                  <span className="caption" style={{ color: processReviewComplete ? "var(--gain)" : "var(--warn)", whiteSpace: "nowrap" }}>
                    {processReviewComplete ? "Reviewed" : "Adherence not reviewed"}
                  </span>
                </div>

                <div>
                  <label className="label" htmlFor="journal-planned-setup" style={{ display: "block", marginBottom: 6 }}>Planned setup</label>
                  <input
                    id="journal-planned-setup"
                    value={plannedSetupDraft}
                    maxLength={80}
                    onChange={(event) => setPlannedSetupDraft(event.target.value)}
                    placeholder="Name the setup you intended to trade"
                    style={inputStyle}
                  />
                  {!selectedEntry.planned_setup && selectedEntry.setup_type && (
                    <div className="caption" style={{ marginTop: 5 }}>Pre-filled from the trade tag. Confirm or change it as a self-reported plan; the original plan was not captured separately.</div>
                  )}
                </div>

                <fieldset style={{ display: "grid", gap: 6 }}>
                  <legend className="label" style={{ marginBottom: 6 }}>Did the trade follow that setup?</legend>
                  <div className="journal-adherence-options">
                    {([
                      ["followed", "Followed"],
                      ["partial", "Partly"],
                      ["not_followed", "Broke plan"],
                      ["not_applicable", "Not applicable"],
                    ] as Array<[SetupAdherence, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={adherenceDraft === value}
                        className={`workspace-chip-button${adherenceDraft === value ? " active" : ""}`}
                        onClick={() => {
                          setAdherenceDraft(value);
                          if (value === "followed" || value === "not_applicable") setRuleBreakDraft([]);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {needsRuleBreak && (
                  <fieldset style={{ display: "grid", gap: 6 }}>
                    <legend className="label" style={{ marginBottom: 6 }}>Concrete rule breaks</legend>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {JOURNAL_RULE_BREAKS.map(({ code, label }) => {
                        const active = ruleBreakDraft.includes(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            aria-pressed={active}
                            className={`workspace-chip-button${active ? " active" : ""}`}
                            onClick={() => setRuleBreakDraft((current) => active ? current.filter((item) => item !== code) : [...current, code])}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Lesson to carry forward</div>
                  <textarea
                    value={lessonDraft}
                    onChange={ev => setLessonDraft(ev.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Example: Wait for volume confirmation before treating the breakout as valid."
                    style={{ ...inputStyle, resize: "none" }}
                  />
                </div>
                <button
                  onClick={() => adherenceDraft && onSaveProcessReview(selectedEntry, {
                    planned_setup: plannedSetupDraft.trim(),
                    adherence: adherenceDraft,
                    rule_breaks: ruleBreakDraft,
                    lesson: reviewDraft,
                  })}
                  disabled={reviewSaving || !processReviewReady}
                  style={{ width: "100%", padding: "8px 0", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 600, border: "1px solid var(--accent)", color: "var(--text-on-accent)", background: "var(--accent)", cursor: reviewSaving || !processReviewReady ? "not-allowed" : "pointer", opacity: reviewSaving || !processReviewReady ? 0.5 : 1 }}
                >
                  {reviewSaving ? "Saving review..." : "Save process review"}
                </button>
                {!reviewDraft && <button onClick={() => onGetLesson(selectedEntry)} disabled={lessonLoading === selectedEntry.id}
                  style={{ width: "100%", padding: "8px 0", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 500, border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", background: "transparent", cursor: "pointer", opacity: lessonLoading === selectedEntry.id ? 0.5 : 1 }}>
                  {lessonLoading === selectedEntry.id ? "Generating lesson..." : "Draft a lesson for this trade"}
                </button>}
              </div>
            )}

            {selectedEntry.status === "open" && (
              <button onClick={() => onInitiateClose(selectedEntry)}
                style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 600, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid var(--accent)", cursor: "pointer" }}>
                Close this trade
              </button>
            )}
          </div>
        )}

        {workflowSymbol && (
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="journal-trade-workflow-links">
            {workflowLinks.map((link) => (
              <Link key={link.label} href={link.href} className="workspace-chip-button" style={{ textDecoration: "none" }}>
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
