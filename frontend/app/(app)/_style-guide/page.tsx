"use client";

import type { ReactNode } from "react";

/**
 * Living style guide — ADR 007.
 * Accessible at /app/_style-guide (underscore prefix excludes from nav).
 * Shows every design token and component pattern side-by-side.
 */

function Token({ name, value, swatch }: { name: string; value: string; swatch?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      {swatch && (
        <div style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", background: swatch, border: "1px solid var(--border-subtle)", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{name}</div>
        <div className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{value}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border-default)" }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 11, color: "var(--text-tertiary)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function DsButton({ variant = "primary", disabled = false, children }: { variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: "var(--accent)", color: "#04120d", border: "none" },
    secondary: { background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" },
    ghost:     { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" },
    danger:    { background: "var(--loss-subtle)", color: "var(--loss)", border: "1px solid rgba(225,85,96,0.25)" },
  };
  return (
    <button disabled={disabled} style={{
      ...styles[variant],
      borderRadius: "var(--radius-md)",
      height: 32,
      padding: "0 14px",
      fontSize: 12,
      fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      fontFamily: "inherit",
    }}>
      {children}
    </button>
  );
}

function DsChip({ active = false, variant = "default" }: { active?: boolean; variant?: "default" | "warn" | "danger" }) {
  const styles: Record<string, React.CSSProperties> = {
    default: active
      ? { background: "var(--accent-subtle)", border: "1px solid var(--accent)", color: "var(--accent)" }
      : { background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" },
    warn: { background: "var(--warn-subtle)", border: "1px solid rgba(232,163,59,0.25)", color: "var(--warn)" },
    danger: { background: "var(--loss-subtle)", border: "1px solid rgba(225,85,96,0.25)", color: "var(--loss)" },
  };
  return (
    <span style={{
      ...styles[variant],
      borderRadius: "var(--radius-sm)",
      height: 24,
      padding: "0 8px",
      fontSize: 11,
      fontWeight: 500,
      display: "inline-flex",
      alignItems: "center",
    }}>
      {active ? "Active chip" : variant === "warn" ? "Free plan" : variant === "danger" ? "Error" : "Inactive chip"}
    </span>
  );
}

function DsInput({ placeholder = "Input field…" }: { placeholder?: string }) {
  return (
    <input
      placeholder={placeholder}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        height: 32,
        padding: "0 10px",
        fontSize: 13,
        color: "var(--text-primary)",
        outline: "none",
        width: 200,
      }}
    />
  );
}

function DsStatCard({ label, value, delta, deltaColor }: { label: string; value: string; delta?: string; deltaColor?: string }) {
  return (
    <div style={{
      background: "var(--surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-lg)",
      padding: "10px 14px",
      minWidth: 140,
      minHeight: 52,
    }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>{value}</div>
      {delta && <div className="mono" style={{ fontSize: 11, color: deltaColor || "var(--text-tertiary)", marginTop: 3 }}>{delta}</div>}
    </div>
  );
}

function DsStatusIndicator({ open }: { open: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: open ? "var(--gain)" : "var(--text-tertiary)" }}>
      <span style={{ fontSize: 8 }}>●</span>
      NSE {open ? "OPEN" : "CLOSED"}
    </span>
  );
}

function DsEmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 24px", maxWidth: 360, textAlign: "center", background: "var(--surface-1)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)" }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-disabled)" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" />
      </svg>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", marginTop: 12 }}>No results matched</div>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Try widening the RSI range or reducing volume ratio</div>
      <button style={{ marginTop: 16, height: 32, padding: "0 14px", fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-md)", background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", cursor: "pointer" }}>Reset filters</button>
    </div>
  );
}

// ── Status bar pattern ────────────────────────────────────────────────────────

function DsStatusBar() {
  return (
    <div style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--border-subtle)", padding: "0 16px", height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "var(--radius-lg)", gap: 12 }}>
      <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>Scanner</span>
      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>EOD 2026-04-19 · 3,046 stocks</span>
      <div style={{ display: "flex", gap: 8 }}>
        <DsButton variant="ghost">Reset</DsButton>
        <DsButton variant="primary">Run scan</DsButton>
      </div>
    </div>
  );
}

// ── Table pattern ─────────────────────────────────────────────────────────────

function DsTable() {
  const rows = [
    { symbol: "RELIANCE", name: "Reliance Industries", price: "2,934.50", change: "+1.84%", vol: "2.3×", rsi: "62", gain: true },
    { symbol: "HDFCBANK",  name: "HDFC Bank",          price: "1,624.15", change: "-0.42%", vol: "1.1×", rsi: "48", gain: false },
    { symbol: "INFY",      name: "Infosys",             price:   "182.40", change: "+3.21%", vol: "4.7×", rsi: "71", gain: true },
  ];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--surface-1)", borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border-default)" }}>
      <thead>
        <tr style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--border-default)" }}>
          {["Symbol", "Price", "Change", "Vol ×", "RSI", ""].map((h, i) => (
            <th key={i} style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i > 0 ? "right" : "left" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.symbol} style={{ height: 38, borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
            <td style={{ padding: "6px 10px" }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{r.symbol}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>{r.name}</div>
            </td>
            <td style={{ padding: "6px 10px", textAlign: "right" }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-primary)" }}>₹{r.price}</span>
            </td>
            <td style={{ padding: "6px 10px", textAlign: "right" }}>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: r.gain ? "var(--gain)" : "var(--loss)" }}>{r.change}</span>
            </td>
            <td style={{ padding: "6px 10px", textAlign: "right" }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.vol}</span>
            </td>
            <td style={{ padding: "6px 10px", textAlign: "right" }}>
              <span className="mono" style={{ fontSize: 11, padding: "2px 6px", borderRadius: "var(--radius-sm)", background: "var(--accent-subtle)", color: "var(--accent)" }}>{r.rsi}</span>
            </td>
            <td style={{ padding: "6px 10px", textAlign: "right" }}>
              <button style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "2px 6px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>+WL</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StyleGuidePage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
          ADR 007
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.02em" }}>
          Design System — Style Guide
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          Living reference for authenticated-screen design tokens and component patterns.
          Authenticated screens only — marketing/landing is excluded from this system.
        </p>
      </div>

      {/* ── Colors ── */}
      <Section title="Color tokens — surfaces">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            { name: "--surface-0", value: "#0B0D11", swatch: "#0B0D11" },
            { name: "--surface-1", value: "#12151C", swatch: "#12151C" },
            { name: "--surface-2", value: "#1A1E27", swatch: "#1A1E27" },
            { name: "--surface-3", value: "#232833", swatch: "#232833" },
            { name: "--surface-float", value: "#1E222C", swatch: "#1E222C" },
            { name: "--border-subtle", value: "rgba(255,255,255,0.06)", swatch: "rgba(255,255,255,0.06)" },
            { name: "--border-default", value: "rgba(255,255,255,0.09)", swatch: "rgba(255,255,255,0.09)" },
            { name: "--border-focus", value: "rgba(244,247,251,0.40)", swatch: "rgba(244,247,251,0.40)" },
          ].map(t => <Token key={t.name} {...t} />)}
        </div>
      </Section>

      <Section title="Color tokens — text (WCAG AA verified)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            { name: "--text-primary", value: "#F5F3EE — 18.6:1 on bg", swatch: "#F5F3EE" },
            { name: "--text-secondary", value: "#CAC4B8 — 11.7:1 on bg", swatch: "#CAC4B8" },
            { name: "--text-tertiary", value: "#9F988C — 7.2:1 on bg", swatch: "#9F988C" },
            { name: "--text-disabled", value: "#6F6A61 — 3.9:1 (disabled only)", swatch: "#6F6A61" },
          ].map(t => <Token key={t.name} {...t} />)}
        </div>
      </Section>

      <Section title="Color tokens — accent + semantic">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            { name: "--accent #56D7C1", value: "Interactive only. Not for success/bullish.", swatch: "#56D7C1" },
            { name: "--gain #2DB574", value: "P&L positive, advances, bullish", swatch: "#2DB574" },
            { name: "--loss #E15560", value: "P&L negative, declines, bearish", swatch: "#E15560" },
            { name: "--warn #E8A33B", value: "Caution, plan limits, marginal states", swatch: "#E8A33B" },
            { name: "--info #5A8BE8", value: "Informational badges (non-brand links)", swatch: "#5A8BE8" },
          ].map(t => <Token key={t.name} {...t} />)}
        </div>
      </Section>

      {/* ── Typography ── */}
      <Section title="Typography — type scale">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "--text-2xs  10px", style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase" as const }, text: "FILTER SECTION HEADER" },
            { label: "--text-xs   11px", style: { fontSize: 11 }, text: "Caption · timestamp · metadata" },
            { label: "--text-sm   12px", style: { fontSize: 12 }, text: "Dense table cells · chip text · secondary body" },
            { label: "--text-base 13px", style: { fontSize: 13 }, text: "Primary body — this is the default reading size" },
            { label: "--text-md   15px", style: { fontSize: 15, fontWeight: 500 }, text: "Card titles · section headers" },
            { label: "--text-xl   22px (status bar only)", style: { fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }, text: "Page title" },
            { label: "--text-2xl  28px (marketing only)", style: { fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--text-disabled)" }, text: "Landing page hero — not used in app" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "baseline", gap: 20, paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ width: 220, flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{item.label}</div>
              <div style={{ color: "var(--text-primary)", ...item.style }}>{item.text}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography — tabular numerals">
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>Without tabular nums (misaligned):</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
            {["₹1,234.56", "₹  987.00", "₹22,100.75"].map(v => (
              <div key={v} style={{ fontSize: 13, textAlign: "right", width: 120, color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>{v}</div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>With .mono class (tabular-nums — aligned):</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {["₹1,234.56", "₹  987.00", "₹22,100.75"].map(v => (
              <div key={v} className="mono" style={{ fontSize: 13, textAlign: "right", width: 120, color: "var(--text-primary)" }}>{v}</div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Components ── */}
      <Section title="Component — buttons">
        <Row label="Primary">
          <DsButton variant="primary">Run scan</DsButton>
          <DsButton variant="primary" disabled>Disabled</DsButton>
        </Row>
        <Row label="Secondary">
          <DsButton variant="secondary">Save screen</DsButton>
          <DsButton variant="secondary" disabled>Disabled</DsButton>
        </Row>
        <Row label="Ghost">
          <DsButton variant="ghost">Reset</DsButton>
          <DsButton variant="ghost">Cancel</DsButton>
        </Row>
        <Row label="Danger">
          <DsButton variant="danger">Delete</DsButton>
        </Row>
      </Section>

      <Section title="Component — chips / pills">
        <Row label="Filter chips">
          <DsChip active={false} />
          <DsChip active={true} />
          <DsChip variant="warn" />
          <DsChip variant="danger" />
        </Row>
      </Section>

      <Section title="Component — input">
        <Row label="Text input">
          <DsInput placeholder="RSI min…" />
          <DsInput placeholder="Search symbols…" />
        </Row>
      </Section>

      <Section title="Component — stat cards (ADR 007 density)">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <DsStatCard label="Advances" value="1,284" delta="of 3,046 stocks" deltaColor="var(--gain)" />
          <DsStatCard label="New 52W highs" value="47" deltaColor="var(--gain)" />
          <DsStatCard label="A/D ratio" value="0.73" />
          <DsStatCard label="Above EMA 200" value="38%" deltaColor="var(--warn)" />
        </div>
      </Section>

      <Section title="Component — status indicators">
        <Row label="Market status">
          <DsStatusIndicator open={true} />
          <DsStatusIndicator open={false} />
        </Row>
      </Section>

      <Section title="Component — empty state">
        <DsEmptyState />
      </Section>

      <Section title="Layout — compact status bar (replaces hero blocks)">
        <DsStatusBar />
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
          Max height 44px. No gradient. No editorial copy. Context + actions only.
          This is what replaces every hero block on authenticated screens.
        </p>
      </Section>

      <Section title="Layout — table density (36–40px rows)">
        <DsTable />
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
          36–40px row height. 6px vertical padding. Tabular numerals on all numeric columns.
          1px subtle border between rows. No shadow on the container.
        </p>
      </Section>

      {/* ── What we reject ── */}
      <Section title="Rejected patterns (do not use in authenticated screens)">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["Hero headlines", "e.g. 'Build sharp scans and move ideas straight into action.' — the user knows."],
            ["Editorial subtitles", "Multi-sentence copy explaining what a screen does."],
            ["Uppercase workspace tags", "'SCANNER WORKSPACE', 'MARKET OVERVIEW' at body size."],
            ["border-radius > 8px on panels", "Currently 24px — looks cartoonish on tiling panels."],
            ["box-shadow on panels", "Use 1px border instead. Shadows = modals and dropdowns only."],
            ["Gradient backgrounds on panels", "Decorative noise. Hurts legibility of nested text."],
            ["Accent color used decoratively", "#56D7C1 is interactive signal only."],
            ["Emerald for bullish/success", "That is --gain: #2DB574. Keep them distinct."],
          ].map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: 12, paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--loss)", width: 220, flexShrink: 0 }}>✕ {name}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{desc}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
