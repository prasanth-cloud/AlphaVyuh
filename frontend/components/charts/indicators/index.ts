import { bollinger } from "./bollinger";
import { ema } from "./ema";
import { macd } from "./macd";
import { rsi } from "./rsi";
import { sma } from "./sma";
import { volume } from "./volume";
import { vwap } from "./vwap";
import type { ChartIndicator, IndicatorDef } from "../types";

export const indicatorRegistry = {
  ema,
  sma,
  vwap,
  rsi,
  macd,
  volume,
  bollinger,
} as unknown as Record<ChartIndicator["type"], IndicatorDef<Record<string, unknown>>>;

export const defaultIndicators: ChartIndicator[] = [
  { type: "sma", params: { period: 50 } },
  { type: "sma", params: { period: 200 } },
];

export const indicatorMenuItems: ChartIndicator[] = [
  { type: "ema", params: { period: 20 } },
  { type: "ema", params: { period: 50 } },
  { type: "ema", params: { period: 200 } },
  { type: "sma", params: { period: 50 } },
  { type: "sma", params: { period: 200 } },
  { type: "vwap", params: {} },
  { type: "rsi", params: { period: 14 } },
  { type: "macd", params: { fast: 12, slow: 26, signal: 9 } },
  { type: "volume", params: {} },
  { type: "bollinger", params: { period: 20, deviation: 2 } },
];

export function indicatorKey(indicator: ChartIndicator) {
  const params = indicator.params ?? {};
  const suffix = Object.keys(params).length ? `(${Object.values(params).join(",")})` : "";
  return `${indicator.type}${suffix}`;
}

export function indicatorLabel(indicator: ChartIndicator) {
  const def = indicatorRegistry[indicator.type];
  const params = indicator.params ?? {};
  const suffix = Object.keys(params).length ? `(${Object.values(params).join(",")})` : "";
  return `${def.label}${suffix}`;
}

export function normalizeIndicators(value: unknown): ChartIndicator[] {
  if (!Array.isArray(value) || value.length === 0) return defaultIndicators;
  return value.flatMap((item): ChartIndicator[] => {
    if (typeof item === "string") {
      if (item === "ema20") return [{ type: "ema", params: { period: 20 } }];
      if (item === "ema50") return [{ type: "ema", params: { period: 50 } }];
      if (item === "ema200") return [{ type: "ema", params: { period: 200 } }];
      if (item === "sma50") return [{ type: "sma", params: { period: 50 } }];
      if (item === "sma200") return [{ type: "sma", params: { period: 200 } }];
      if (item === "bb" || item === "bollinger") return [{ type: "bollinger", params: { period: 20, deviation: 2 } }];
      if (item === "vwap" || item === "rsi" || item === "macd" || item === "volume") return [{ type: item, params: {} }];
    }
    if (item && typeof item === "object" && "type" in item && String(item.type) in indicatorRegistry) {
      const raw = item as ChartIndicator;
      return [{ type: raw.type, params: raw.params ?? {} }];
    }
    return [];
  });
}
