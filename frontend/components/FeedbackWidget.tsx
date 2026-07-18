"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createFeedbackReport } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { currentFeedbackHref } from "@/lib/feedback-context";

type FeedbackWidgetProps = {
  defaultCategory?: "general" | "bug" | "data_issue" | "feature_request";
  defaultSymbol?: string | null;
};

const UTILITY_POPOVER_EVENT = "alphavyuh:utility-popover-open";

export default function FeedbackWidget({ defaultCategory = "general", defaultSymbol = null }: FeedbackWidgetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(defaultCategory);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  function closeAndRestoreFocus() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function toggleDisclosure() {
    const next = !open;
    if (next) {
      window.dispatchEvent(new CustomEvent(UTILITY_POPOVER_EVENT, { detail: "feedback" }));
    }
    setOpen(next);
  }

  useEffect(() => {
    const closeForAnotherUtility = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== "feedback") setOpen(false);
    };
    window.addEventListener(UTILITY_POPOVER_EVENT, closeForAnotherUtility);
    return () => window.removeEventListener(UTILITY_POPOVER_EVENT, closeForAnotherUtility);
  }, []);

  useEffect(() => {
    if (!open) return;

    const focusId = window.requestAnimationFrame(() => messageRef.current?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!widgetRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeAndRestoreFocus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusId);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

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
          href: currentFeedbackHref(pathname),
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
      trackEvent("feedback_submitted", { category, page: pathname, has_symbol: Boolean(defaultSymbol) });
      setMessage("");
      setStatus("Feedback sent.");
      closeAndRestoreFocus();
      window.setTimeout(() => setStatus(""), 2500);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send feedback.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={widgetRef} className="feedback-widget">
      {open && (
        <div
          id="feedback-widget-panel"
          className="feedback-widget-panel"
          role="group"
          aria-label="Send feedback"
          style={{
            padding: 14,
            borderRadius: 14,
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
          }}
        >
          <div className="heading-card" style={{ marginBottom: 8 }}>Send feedback</div>
          <select
            aria-label="Feedback category"
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
            ref={messageRef}
            aria-label="Feedback details"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            placeholder="What happened? What did you expect?"
            style={{ width: "100%", resize: "vertical", padding: 10, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: 12, lineHeight: 1.5 }}
          />
          {status && <div role="status" aria-live="polite" className="caption" style={{ marginTop: 8, color: status.includes("sent") ? "var(--gain)" : "var(--warn)" }}>{status}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button type="button" className="workspace-chip-button" onClick={closeAndRestoreFocus}>Cancel</button>
            <button className="workspace-chip-button active" disabled={sending} onClick={submit}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        ref={triggerRef}
        onClick={toggleDisclosure}
        className="workspace-chip-button active"
        aria-expanded={open}
        aria-controls="feedback-widget-panel"
        style={{ boxShadow: "0 12px 30px rgba(0,0,0,0.28)" }}
      >
        Feedback
      </button>
      {!open && status && (
        <div role="status" aria-live="polite" className="caption" style={{ marginTop: 8, textAlign: "right", color: "var(--gain)" }}>{status}</div>
      )}
    </div>
  );
}
