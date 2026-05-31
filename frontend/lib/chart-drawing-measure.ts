export type ChartDrawingMeasurementInput = {
  tool: string;
  p1: { time: string; price: number };
  p2: { time: string; price: number };
  p3?: { time: string; price: number };
};

export type ChartDrawingMeasurement = {
  primary: string;
  secondary: string;
};

type MeasurementOptions = {
  referencePrice?: number | null;
  currency?: string;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function price(value: number, currency = "INR"): string {
  if (currency === "USD") {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedPrice(value: number, currency = "INR"): string {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${price(Math.abs(value), currency)}`;
}

function pct(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function daySpan(a: string, b: string): number | null {
  const aMs = Date.parse(`${a}T00:00:00Z`);
  const bMs = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return null;
  return Math.max(0, Math.round(Math.abs(bMs - aMs) / 86_400_000));
}

function spanLabel(days: number | null): string {
  if (days == null) return "time span unavailable";
  if (days === 0) return "same session";
  return `${days} day${days === 1 ? "" : "s"}`;
}

function relativeDistance(level: number, referencePrice: number | null | undefined): string | null {
  if (!finite(referencePrice) || referencePrice <= 0) return null;
  const distancePct = ((level - referencePrice) / referencePrice) * 100;
  if (Math.abs(distancePct) < 0.005) return "at last price";
  return `${Math.abs(distancePct).toFixed(2)}% ${distancePct > 0 ? "above" : "below"} last price`;
}

export function buildChartDrawingMeasurement(
  drawing: ChartDrawingMeasurementInput | null | undefined,
  options: MeasurementOptions = {},
): ChartDrawingMeasurement | null {
  if (!drawing || !finite(drawing.p1.price) || !finite(drawing.p2.price)) return null;
  const currency = options.currency ?? "INR";
  const start = drawing.p1.price;
  const end = drawing.p2.price;
  const days = daySpan(drawing.p1.time, drawing.p2.time);

  if (drawing.tool === "LongPosition" || drawing.tool === "ShortPosition") {
    if (!drawing.p3 || !finite(drawing.p3.price)) return null;
    const entry = drawing.p1.price;
    const stop = drawing.p2.price;
    const target = drawing.p3.price;
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    const rr = risk > 0 ? reward / risk : null;
    const riskPct = entry > 0 ? (risk / entry) * 100 : null;
    const rewardPct = entry > 0 ? (reward / entry) * 100 : null;
    return {
      primary: `Entry ${price(entry, currency)} · Stop ${price(stop, currency)} · Target ${price(target, currency)}`,
      secondary: [
        riskPct == null ? null : `Risk ${riskPct.toFixed(2)}%`,
        rewardPct == null ? null : `Reward ${rewardPct.toFixed(2)}%`,
        rr == null ? null : `R:R ${rr.toFixed(2)}`,
      ].filter(Boolean).join(" · "),
    };
  }

  if (drawing.tool === "Horizontal" || drawing.tool === "HorizontalRay") {
    const distance = relativeDistance(start, options.referencePrice);
    return {
      primary: `Level ${price(start, currency)}`,
      secondary: distance ?? "Distance needs last price",
    };
  }

  if (drawing.tool === "Rectangle") {
    const high = Math.max(start, end);
    const low = Math.min(start, end);
    const midpoint = (high + low) / 2;
    const heightPct = midpoint > 0 ? ((high - low) / midpoint) * 100 : 0;
    return {
      primary: `Zone ${price(low, currency)}-${price(high, currency)}`,
      secondary: `Height ${heightPct.toFixed(2)}% · ${spanLabel(days)}`,
    };
  }

  if (drawing.tool === "Text") {
    return {
      primary: `Text note at ${price(start, currency)}`,
      secondary: drawing.p1.time || "time unavailable",
    };
  }

  const change = end - start;
  const changePct = start > 0 ? (change / start) * 100 : 0;
  return {
    primary: `Move ${signedPrice(change, currency)} (${pct(changePct)})`,
    secondary: `${spanLabel(days)} · ${price(start, currency)} to ${price(end, currency)}`,
  };
}
