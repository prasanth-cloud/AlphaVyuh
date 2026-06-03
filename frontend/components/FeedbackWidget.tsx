"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { createFeedbackReport } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

type FeedbackWidgetProps = {
  defaultCategory?: "general" | "bug" | "data_issue" | "feature_request";
  defaultSymbol?: string | null;
};

export default function FeedbackWidget({ defaultCategory = "general", defaultSymbol = null }: FeedbackWidgetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(defaultCategory);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  async function submit() {
    const text = message.trim();
    if (text.length < 3) {
      setStatus("Add a little more detail.");
      return;
    }
    setSending(true);
    setStatus("");
    try {
      await createFeedbackReport({
        category,
        page: pathname,
        symbol: defaultSymbol,
        severity: category === "data_issue" || category === "bug" ? "high" : "normal",
        message: text,
        context: {
          href: typeof window !== "undefined" ? window.location.href : pathname,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
      trackEvent("feedback_submitted", { category, page: pathname, has_symbol: Boolean(defaultSymbol) });
      setMessage("");
      setOpen(false);
      setStatus("Feedback sent.");
      window.setTimeout(() => setStatus(""), 2500);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send feedback.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="feedback-widget">
      {open && (
        <div
          className="feedback-widget-panel"
          style={{
            width: 320,
            marginBottom: 10,
            padding: 14,
            borderRadius: 14,
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
          }}
        >
          <div className="heading-card" style={{ marginBottom: 8 }}>Send feedback</div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            style={{ width: "100%", marginBottom: 8, padding: "9px 10px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: 12 }}
          >
            <option value="general">General feedback</option>
            <option value="bug">Bug</option>
            <option value="data_issue">Data issue</option>
            <option value="feature_request">Feature request</option>
          </select>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            placeholder="What happened? What did you expect?"
            style={{ width: "100%", resize: "vertical", padding: 10, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: 12, lineHeight: 1.5 }}
          />
          {status && <div className="caption" style={{ marginTop: 8, color: status.includes("sent") ? "var(--gain)" : "var(--warn)" }}>{status}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button className="workspace-chip-button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="workspace-chip-button active" disabled={sending} onClick={submit}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((value) => !value)}
        className="workspace-chip-button active"
        style={{ boxShadow: "0 12px 30px rgba(0,0,0,0.28)" }}
      >
        Feedback
      </button>
      {!open && status && (
        <div className="caption" style={{ marginTop: 8, textAlign: "right", color: "var(--gain)" }}>{status}</div>
      )}
    </div>
  );
}
