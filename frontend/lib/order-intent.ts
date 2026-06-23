"use client";

import { useCallback, useRef } from "react";
import type { PlaceOrderRequest } from "@/lib/api/types";

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "idempotency_key")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function orderIntentFingerprint(order: PlaceOrderRequest): string {
  return stableValue(order);
}

export function createOrderIntentKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

export function useOrderIntentKey() {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);

  const keyFor = useCallback((order: PlaceOrderRequest) => {
    const fingerprint = orderIntentFingerprint(order);
    if (current.current?.fingerprint === fingerprint) return current.current.key;
    const key = createOrderIntentKey();
    current.current = { fingerprint, key };
    return key;
  }, []);

  const reset = useCallback(() => {
    current.current = null;
  }, []);

  return { keyFor, reset };
}
