import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const symbol = p.get("symbol") || "NSE";
  const price = p.get("price") || "–";
  const change = parseFloat(p.get("change") || "0");
  const color = change >= 0 ? "#2DB574" : "#E15560";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0A0E13",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ color: "#00D9A7", fontSize: "20px", letterSpacing: "0.14em" }}>
          ALPHAVYUH
        </div>
        <div
          style={{
            color: "#F1EFE8",
            fontSize: "72px",
            fontWeight: 800,
            letterSpacing: "-0.03em",
          }}
        >
          {symbol}
        </div>
        <div style={{ color: "#A8A29E", fontSize: "32px", marginTop: "8px" }}>
          ₹{price}
        </div>
        <div style={{ color, fontSize: "24px", marginTop: "8px" }}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </div>
        <div style={{ color: "#6A6A6A", fontSize: "14px", marginTop: "40px" }}>
          alphavyuh.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
