export type BrokerSafetyStatus = {
  connected?: boolean;
  broker?: string | null;
  token_expired?: boolean;
  read_only_smoke_required?: boolean;
  read_only_smoke_passed?: boolean;
  live_order_enabled?: boolean;
};

export type BrokerOrderGatePresentation = {
  value: string;
  detail: string;
  status: "good" | "warn" | "bad";
};

function brokerLabel(broker?: string | null) {
  if (!broker) return "Broker";
  if (broker.toLowerCase() === "zerodha") return "Zerodha";
  if (broker.toLowerCase() === "upstox") return "Upstox";
  return broker;
}

export function brokerOrderGatePresentation(
  broker: BrokerSafetyStatus | null | undefined,
  options: { unavailable?: boolean } = {},
): BrokerOrderGatePresentation {
  if (options.unavailable) {
    return {
      value: "UNAVAILABLE",
      detail: "Broker safety gate cannot be confirmed right now; order capture must stay as journal drafts.",
      status: "bad",
    };
  }

  if (broker?.live_order_enabled === true) {
    return {
      value: "OWNER ENABLED",
      detail: `${brokerLabel(broker.broker)} order submission is enabled only after owner approval, paid-plan checks, confirmation, and read-only smoke.`,
      status: "warn",
    };
  }

  if (broker?.token_expired) {
    return {
      value: "TOKEN EXPIRED",
      detail: "Reconnect broker access before importing trades. Order submission remains disabled.",
      status: "bad",
    };
  }

  if (broker?.read_only_smoke_required && broker.read_only_smoke_passed !== true) {
    return {
      value: "SMOKE REQUIRED",
      detail: `${brokerLabel(broker.broker)} read-only smoke must pass before any future sandbox/live order route can be enabled.`,
      status: "warn",
    };
  }

  if (broker?.read_only_smoke_required && broker.read_only_smoke_passed === true) {
    return {
      value: "SMOKE PASSED",
      detail: `${brokerLabel(broker.broker)} read-only profile, holdings, orderbook, and import checks passed. Orders still require explicit owner enablement.`,
      status: "good",
    };
  }

  return {
    value: "ORDERS DISABLED",
    detail: "Broker import can be read-only; buy/sell remains order intent and journal capture until owner-approved execution work lands.",
    status: broker?.connected ? "good" : "warn",
  };
}
