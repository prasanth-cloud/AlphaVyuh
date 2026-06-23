"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, SlidersHorizontal, Loader2 } from "lucide-react";
import { authHeaders } from "@/lib/api/client";
import { API_BASE_URL } from "@/lib/api-base";

type ReviewResult = {
  status: "ok";
  winning_patterns: string[];
  mistake_patterns: string[];
  sizing_observations: string[];
};

type InsufficientData = {
  status: "insufficient_data";
  trades_needed: number;
};

type ReviewResponse = ReviewResult | InsufficientData;

export default function FeedbackPage() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "pro_required" }
    | { kind: "insufficient"; tradesNeeded: number }
    | { kind: "result"; data: ReviewResult }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${API_BASE_URL}/api/v1/journal/ai-review`, { headers });

        if (cancelled) return;

        if (res.status === 403) {
          setState({ kind: "pro_required" });
          return;
        }

        if (!res.ok) {
          setState({ kind: "error", message: "Failed to load review" });
          return;
        }

        const data: ReviewResponse = await res.json();
        if (data.status === "insufficient_data") {
          setState({ kind: "insufficient", tradesNeeded: data.trades_needed });
        } else {
          setState({ kind: "result", data });
        }
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Network error" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 24,
        }}
      >
        AI Journal Review
      </h1>

      {state.kind === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
          <Loader2 size={18} className="animate-spin" />
          <span>Analyzing your trades...</span>
        </div>
      )}

      {state.kind === "pro_required" && (
        <div
          style={{
            background: "var(--surface-1, #12161D)",
            borderRadius: 8,
            padding: 24,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 16, color: "var(--text-primary)", marginBottom: 8 }}>
            Unlock AI journal review
          </p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
            Available on the Pro plan.
          </p>
          <a
            href="/settings"
            style={{
              display: "inline-block",
              padding: "8px 20px",
              background: "var(--accent, #00D9A7)",
              color: "#0A0E13",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            See plans
          </a>
        </div>
      )}

      {state.kind === "insufficient" && (
        <div
          style={{
            background: "var(--surface-1, #12161D)",
            borderRadius: 8,
            padding: 24,
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Log {state.tradesNeeded} more trade{state.tradesNeeded === 1 ? "" : "s"} to unlock
            your review. Patterns become visible after 5 trades.
          </p>
        </div>
      )}

      {state.kind === "result" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Section
            icon={<TrendingUp size={18} />}
            title="What's working"
            items={state.data.winning_patterns}
            color="#2DB574"
          />
          <Section
            icon={<TrendingDown size={18} />}
            title="Where trades broke down"
            items={state.data.mistake_patterns}
            color="#E15560"
          />
          <Section
            icon={<SlidersHorizontal size={18} />}
            title="Sizing patterns"
            items={state.data.sizing_observations}
            color="var(--text-secondary)"
          />
          <p style={{ fontSize: 11, color: "var(--text-tertiary, #6A6A6A)", marginTop: 4 }}>
            Based on your last 30 trades &middot; Analysis refreshes daily
          </p>
        </div>
      )}

      {state.kind === "error" && (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>{state.message}</p>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  items,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface-1, #12161D)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {title}
        </span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
