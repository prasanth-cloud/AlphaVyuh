import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "alphavyuh — Scanner, charts, broker execution, and AI trade review";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #071013 0%, #0b0d11 48%, #131a24 100%)",
          color: "#F5F3EE",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 36,
            padding: 40,
            background: "rgba(18,21,28,0.84)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#56D7C1",
                color: "#04120d",
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              a
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.04em" }}>alphavyuh</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 18, textTransform: "uppercase", letterSpacing: "0.14em", color: "#9F988C" }}>
              Trading workspace for systematic traders
            </div>
            <div style={{ fontSize: 74, lineHeight: 0.95, fontWeight: 700, letterSpacing: "-0.07em", maxWidth: 760 }}>
              Scan, trade, and review in one loop.
            </div>
            <div style={{ fontSize: 28, lineHeight: 1.45, color: "#CAC4B8", maxWidth: 760 }}>
              Scanner, charting, broker execution, journaling, and AI post-trade analysis for NSE and BSE traders.
            </div>
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            {["Scanner", "Broker trading", "AI trade review"].map((item) => (
              <div
                key={item}
                style={{
                  padding: "10px 16px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: 18,
                  color: "#CAC4B8",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
