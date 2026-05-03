"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            color: "#f0ede8",
            background: "#0d0f14",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <section style={{ maxWidth: 460, textAlign: "center" }}>
            <h1 style={{ fontSize: 32, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ color: "#a8a29e", lineHeight: 1.6, marginBottom: 24 }}>
              The issue has been reported. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 10,
                padding: "12px 18px",
                fontWeight: 700,
                color: "var(--text-on-accent)",
                background: "#00e5c4",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
