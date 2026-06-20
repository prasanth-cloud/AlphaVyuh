import { ImageResponse } from "@vercel/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 630;
const CHART_LEFT = 60;
const CHART_RIGHT = 60;
const CHART_TOP = 120;
const CHART_BOTTOM = 80;
const CHART_W = WIDTH - CHART_LEFT - CHART_RIGHT;
const CHART_H = HEIGHT - CHART_TOP - CHART_BOTTOM;
const BG = "#0A0E13";
const SURFACE = "#12161D";
const ACCENT = "#00D9A7";
const GAIN = "#26a65b";
const LOSS = "#e5383b";
const TEXT = "#F1EFE8";
const TEXT2 = "#888";

type Candle = {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

function renderCandles(candles: Candle[]) {
  if (candles.length === 0) return [];

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const priceRange = maxPrice - minPrice || 1;

  const barWidth = Math.max(2, Math.floor(CHART_W / candles.length) - 1);
  const gap = 1;

  const elements: React.ReactElement[] = [];

  candles.forEach((c, i) => {
    const x = CHART_LEFT + i * (barWidth + gap);
    const isGreen = c.close >= c.open;
    const color = isGreen ? GAIN : LOSS;

    const bodyTop = CHART_TOP + ((maxPrice - Math.max(c.open, c.close)) / priceRange) * CHART_H;
    const bodyBottom = CHART_TOP + ((maxPrice - Math.min(c.open, c.close)) / priceRange) * CHART_H;
    const bodyHeight = Math.max(1, bodyBottom - bodyTop);

    const wickTop = CHART_TOP + ((maxPrice - c.high) / priceRange) * CHART_H;
    const wickBottom = CHART_TOP + ((maxPrice - c.low) / priceRange) * CHART_H;
    const wickX = x + barWidth / 2;

    elements.push(
      <div
        key={`w${i}`}
        style={{
          position: "absolute",
          left: wickX,
          top: wickTop,
          width: 1,
          height: wickBottom - wickTop,
          backgroundColor: color,
        }}
      />
    );

    elements.push(
      <div
        key={`b${i}`}
        style={{
          position: "absolute",
          left: x,
          top: bodyTop,
          width: barWidth,
          height: bodyHeight,
          backgroundColor: color,
        }}
      />
    );
  });

  return elements;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "NIFTY50").toUpperCase();
  const days = Math.min(parseInt(searchParams.get("days") || "60", 10), 120);

  let candles: Candle[] = [];
  let lastClose: number | null = null;
  let prevClose: number | null = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase
      .from("daily_ohlcv")
      .select("trade_date,open,high,low,close")
      .eq("symbol", symbol)
      .order("trade_date", { ascending: false })
      .limit(days + 1);

    if (data && data.length > 1) {
      candles = data.slice(0, days).reverse();
      lastClose = candles[candles.length - 1]?.close ?? null;
      prevClose = data[data.length > days ? days : data.length - 1]?.close ?? null;
    }
  } catch {
    // Render with empty data
  }

  const pctChange = lastClose && prevClose && prevClose > 0
    ? ((lastClose - prevClose) / prevClose) * 100
    : null;
  const changeColor = pctChange !== null ? (pctChange >= 0 ? GAIN : LOSS) : TEXT2;
  const changeStr = pctChange !== null ? `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%` : "";
  const priceStr = lastClose !== null ? `₹${lastClose.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: BG,
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter, sans-serif",
          position: "relative",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "32px 40px 0" }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: TEXT }}>{symbol}</span>
          {priceStr && <span style={{ fontSize: 28, color: TEXT }}>{priceStr}</span>}
          {changeStr && <span style={{ fontSize: 24, color: changeColor, fontWeight: 600 }}>{changeStr}</span>}
        </div>

        {/* Subtitle */}
        <div style={{ display: "flex", padding: "4px 40px 0", gap: 12 }}>
          <span style={{ fontSize: 14, color: TEXT2 }}>{days} trading days</span>
          {candles.length > 0 && (
            <span style={{ fontSize: 14, color: TEXT2 }}>
              {candles[0].trade_date} → {candles[candles.length - 1].trade_date}
            </span>
          )}
        </div>

        {/* Chart area */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: WIDTH,
            height: HEIGHT,
            display: "flex",
          }}
        >
          {candles.length > 0 ? (
            renderCandles(candles)
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                color: TEXT2,
                fontSize: 20,
              }}
            >
              No data available for {symbol}
            </div>
          )}
        </div>

        {/* Footer / branding */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: 40,
            right: 40,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: ACCENT }}>alphavyuh</span>
          <span style={{ fontSize: 12, color: TEXT2 }}>alphavyuh.com</span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    }
  );
}
