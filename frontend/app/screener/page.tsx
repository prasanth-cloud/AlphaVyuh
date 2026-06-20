import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "NSE stock screener — VCP, SEPA, and momentum scans | AlphaVyuh",
  description:
    "Free NSE stock screener for VCP, SEPA, and breakout setups. Used by Indian swing traders following Minervini and Qullamaggie methodologies.",
};

const SAMPLE_STOCKS = [
  { symbol: "RELIANCE", close: 2847.5, w52hPct: -4.2, ema200: "Above", volRatio: 1.3 },
  { symbol: "TCS", close: 3654.8, w52hPct: -8.1, ema200: "Above", volRatio: 0.9 },
  { symbol: "HDFCBANK", close: 1689.4, w52hPct: -3.5, ema200: "Above", volRatio: 1.1 },
  { symbol: "INFY", close: 1542.3, w52hPct: -12.4, ema200: "Below", volRatio: 0.7 },
  { symbol: "ICICIBANK", close: 1078.6, w52hPct: -2.8, ema200: "Above", volRatio: 1.6 },
  { symbol: "BHARTIARTL", close: 1423.9, w52hPct: -5.6, ema200: "Above", volRatio: 1.2 },
  { symbol: "SBIN", close: 628.4, w52hPct: -9.3, ema200: "Above", volRatio: 0.8 },
  { symbol: "WIPRO", close: 456.7, w52hPct: -15.2, ema200: "Below", volRatio: 0.6 },
  { symbol: "LT", close: 3214.8, w52hPct: -6.7, ema200: "Above", volRatio: 1.4 },
  { symbol: "TATAMOTORS", close: 642.3, w52hPct: -7.9, ema200: "Above", volRatio: 1.8 },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "NSE stock screener",
  url: "https://alphavyuh.com/screener",
};

export default function PublicScreenerPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div
        style={{
          minHeight: "100vh",
          background: "#0A0E13",
          color: "#F1EFE8",
          fontFamily: "var(--font-sans, Inter, sans-serif)",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 16px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#00D9A7",
              textTransform: "uppercase" as const,
              letterSpacing: "0.14em",
              marginBottom: 8,
            }}
          >
            Screener
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#F1EFE8",
              letterSpacing: "-0.02em",
              marginBottom: 8,
            }}
          >
            NSE momentum scan — sample results
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#A8A29E",
              maxWidth: 600,
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            These are sample results from AlphaVyuh&apos;s momentum scanner. Create a free
            account to run live scans across all NSE stocks.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 640,
              }}
            >
              <thead>
                <tr>
                  {["Symbol", "Close (₹)", "% from 52W high", "EMA 200", "Volume vs avg"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: h === "Symbol" ? "left" : "right",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#6A6A6A",
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.06em",
                          padding: "0 0 12px",
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {SAMPLE_STOCKS.map((s) => (
                  <tr
                    key={s.symbol}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 0",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#F1EFE8",
                      }}
                    >
                      {s.symbol}
                    </td>
                    <td
                      style={{
                        padding: "10px 0",
                        textAlign: "right",
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 13,
                        color: "#F1EFE8",
                      }}
                    >
                      {s.close.toLocaleString("en-IN", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </td>
                    <td
                      style={{
                        padding: "10px 0",
                        textAlign: "right",
                        fontSize: 13,
                        color: s.w52hPct > -5 ? "#2DB574" : "#A8A29E",
                      }}
                    >
                      {s.w52hPct.toFixed(1)}%
                    </td>
                    <td
                      style={{
                        padding: "10px 0",
                        textAlign: "right",
                        fontSize: 13,
                        color: s.ema200 === "Above" ? "#2DB574" : "#E15560",
                      }}
                    >
                      {s.ema200}
                    </td>
                    <td
                      style={{
                        padding: "10px 0",
                        textAlign: "right",
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 13,
                        color: s.volRatio > 1.5 ? "#00D9A7" : "#A8A29E",
                      }}
                    >
                      {s.volRatio.toFixed(1)}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: "center", marginTop: 40 }}>
            <Link
              href="/signup"
              style={{
                display: "inline-block",
                padding: "10px 28px",
                background: "#00D9A7",
                color: "#0A0E13",
                borderRadius: 20,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Run this scan live
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
