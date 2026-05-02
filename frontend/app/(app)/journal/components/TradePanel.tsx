"use client";

import { Card } from "@/components/ui";
import type { JournalEntry, CreateJournalEntry, UpdateJournalEntry, SymbolSearchResult } from "./types";
import type { PanelMode } from "./types";
import { SETUP_TYPES, inputStyle, fmtCcy, fmtDate, getTradeFlowMeta } from "./utils";

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
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  tradeValue: number | null;
  riskRupees: number | null;
  rrRatio: string | null;
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
  onInitiateClose: (e: JournalEntry) => void;
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
  selectedSymbol,
  onSelectSymbol,
  tradeValue,
  riskRupees,
  rrRatio,
  onAddTrade,
  closeForm,
  onCloseFormChange,
  closeSetupType,
  onCloseSetupTypeChange,
  pnlPreview,
  onCloseTrade,
  onClose,
  onGetLesson,
  onInitiateClose,
}: TradePanelProps) {
  if (!mode) return null;
  const flow = selectedEntry ? getTradeFlowMeta(selectedEntry) : null;

  return (
    <div style={{ width: 340, flexShrink: 0 }}>
      <Card padding="lg" style={{ borderRadius: "var(--radius-lg)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div className="heading-card">
            {mode === "add" ? "Log trade" : mode === "close" ? `Close ${selectedEntry?.symbol}` : selectedEntry?.symbol}
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
              {symbolResults.length > 0 && !selectedSymbol && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-modal)", zIndex: 20, overflow: "hidden", marginTop: 2, background: "var(--surface-float)", border: "1px solid var(--border-subtle)" }}>
                  {symbolResults.map(r => (
                    <button key={r.symbol} onClick={() => { onSelectSymbol(r.symbol); onSymbolQChange(r.symbol); }}
                      style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, borderBottom: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                      <span style={{ fontWeight: 500 }}>{r.symbol}</span>
                      <span className="caption" style={{ marginLeft: 8 }}>{r.company_name}</span>
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

            <div>
              <div className="label" style={{ marginBottom: 8 }}>Setup</div>
              <SetupChips value={addForm.setup_type || ""} onChange={v => onAddFormChange({ ...addForm, setup_type: v || undefined })} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Why are you entering?</div>
              <textarea value={addForm.entry_reason || ""} onChange={ev => onAddFormChange({ ...addForm, entry_reason: ev.target.value })} rows={3} placeholder="EMA alignment, volume surge, breakout of resistance…" style={{ ...inputStyle, resize: "none" }} />
            </div>

            <button onClick={onAddTrade} disabled={saving}
              style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid var(--accent)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
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
              <div className="label" style={{ marginBottom: 6 }}>What went wrong?</div>
              <textarea value={closeForm.mistakes || ""} onChange={ev => onCloseFormChange({ ...closeForm, mistakes: ev.target.value })} rows={2} placeholder="Sized too large, ignored stop…" style={{ ...inputStyle, resize: "none" }} />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>What did I learn?</div>
              <textarea value={closeForm.lessons || ""} onChange={ev => onCloseFormChange({ ...closeForm, lessons: ev.target.value })} rows={2} placeholder="Always wait for confirmation…" style={{ ...inputStyle, resize: "none" }} />
            </div>

            <button onClick={onCloseTrade} disabled={saving}
              style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid var(--accent)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
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
                ["Setup", selectedEntry.setup_type || "—"],
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
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>{selectedEntry.entry_reason}</p>
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

            {selectedEntry.lessons ? (
              <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--gain-subtle)", border: "1px solid var(--border-subtle)" }}>
                <div className="label" style={{ marginBottom: 8, color: "var(--gain)" }}>Trade lesson</div>
                {selectedEntry.lessons.split("\n").map((line, i) => {
                  if (!line.trim()) return null;
                  const clean = line.replace(/^[-•*]\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1");
                  return (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, lineHeight: 1.6, marginBottom: 4, color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--gain)", flexShrink: 0, marginTop: 2 }}>•</span>
                      <span>{clean}</span>
                    </div>
                  );
                })}
              </div>
            ) : selectedEntry.status === "closed" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--warn-subtle)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 }}>
                  This trade is closed but has not been reviewed yet. A per-trade lesson adds context to journal-wide analytics as closed trades accumulate.
                </div>
                <button onClick={() => onGetLesson(selectedEntry)} disabled={lessonLoading === selectedEntry.id}
                  style={{ width: "100%", padding: "8px 0", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 500, border: "1px solid var(--accent)", color: "var(--accent)", background: "transparent", cursor: "pointer", opacity: lessonLoading === selectedEntry.id ? 0.5 : 1 }}>
                  {lessonLoading === selectedEntry.id ? "Generating lesson..." : "Generate lesson for this trade"}
                </button>
              </div>
            )}

            {selectedEntry.status === "open" && (
              <button onClick={() => onInitiateClose(selectedEntry)}
                style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid var(--accent)", cursor: "pointer" }}>
                Close this trade
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
