import Link from "next/link";
import type { BrokerOrderActivityItem } from "@/lib/api";
import { buildDashboardBrokerFlightSummary } from "@/lib/dashboard-broker-flight-status";

type DashboardBrokerFlightStatusProps = {
  orders: BrokerOrderActivityItem[];
  unavailable?: boolean;
};

const TONE_COLOR = {
  good: "var(--gain)",
  warn: "var(--warn)",
  bad: "var(--loss)",
  muted: "var(--text-tertiary)",
} as const;

export function DashboardBrokerFlightStatus({
  orders,
  unavailable = false,
}: DashboardBrokerFlightStatusProps) {
  const summary = buildDashboardBrokerFlightSummary(orders, unavailable);
  const metrics = [
    { label: "Awaiting fill", value: summary.pending },
    { label: "Partial", value: summary.partial },
    { label: "Filled", value: summary.filled },
    { label: "Journal gap", value: summary.journalMissing },
  ];

  return (
    <section className="workspace-card" data-testid="dashboard-broker-flight-status" style={{ padding: 16, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 300px" }}>
          <div className="label" style={{ marginBottom: 4 }}>Broker flight status</div>
          <h2 className="heading-card" style={{ color: TONE_COLOR[summary.tone], marginBottom: 5 }}>{summary.headline}</h2>
          <div className="caption" style={{ lineHeight: 1.55 }}>{summary.detail}</div>
        </div>
        <Link href="/settings/broker" className="workspace-chip-button">
          {summary.pending + summary.partial + summary.journalMissing > 0 ? "Resolve orders" : "Open broker activity"}
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 12 }}>
        {metrics.map(metric => (
          <div key={metric.label} style={{ padding: "8px 10px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
            <div className="label">{metric.label}</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 3 }}>{metric.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
