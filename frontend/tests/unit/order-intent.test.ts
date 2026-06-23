import { describe, expect, it, vi } from "vitest";
import { createOrderIntentKey, orderIntentFingerprint } from "@/lib/order-intent";

describe("order intent keys", () => {
  it("keeps equivalent order payloads on the same fingerprint", () => {
    const left = {
      symbol: "RELIANCE",
      side: "buy" as const,
      quantity: 10,
      price: 1500,
      order_type: "market" as const,
      source_page: "chart" as const,
      idempotency_key: "ignored-a",
    };
    const right = {
      price: 1500,
      quantity: 10,
      side: "buy" as const,
      symbol: "RELIANCE",
      source_page: "chart" as const,
      order_type: "market" as const,
      idempotency_key: "ignored-b",
    };

    expect(orderIntentFingerprint(left)).toBe(orderIntentFingerprint(right));
  });

  it("changes the fingerprint when material order intent changes", () => {
    const base = {
      symbol: "RELIANCE",
      side: "buy" as const,
      quantity: 10,
      price: 1500,
      order_type: "market" as const,
    };

    expect(orderIntentFingerprint(base)).not.toBe(
      orderIntentFingerprint({ ...base, quantity: 11 }),
    );
  });

  it("creates UUID-shaped keys when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {});
    const key = createOrderIntentKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    vi.unstubAllGlobals();
  });
});
