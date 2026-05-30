export type BrokerSafetyStatus = {
  connected?: boolean;
  broker?: string | null;
  token_expired?: boolean;
  read_only_smoke_required?: boolean;
  read_only_smoke_passed?: boolean;
  read_only_smoke_fresh?: boolean;
  read_only_smoke_checked_at?: string | null;
  live_order_enabled?: boolean;
};

export type BrokerReadOnlySmokeCheck = {
  ok?: boolean;
  count?: number;
  error?: string;
  note?: string;
  user_id_present?: boolean;
};

export type BrokerReadOnlySmokeState = BrokerSafetyStatus & {
  read_only_smoke_checked_at?: string | null;
  read_only_smoke_checks?: Record<string, BrokerReadOnlySmokeCheck> | null;
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

  if (broker?.read_only_smoke_required && broker.read_only_smoke_checked_at && broker.read_only_smoke_fresh === false) {
    return {
      value: "SMOKE STALE",
      detail: `${brokerLabel(broker.broker)} read-only smoke is older than the 24-hour launch gate; rerun read-only smoke before any future order route can be enabled.`,
      status: "warn",
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

const READ_ONLY_CHECKS: Array<{ id: string; label: string; detail: string }> = [
  { id: "login_url", label: "OAuth start", detail: "Broker app can generate a login URL." },
  { id: "profile", label: "Profile", detail: "Account identity can be read without exposing tokens." },
  { id: "holdings", label: "Holdings", detail: "Long-term positions can be imported read-only." },
  { id: "positions", label: "Positions", detail: "Open position state can be read safely." },
  { id: "orderbook", label: "Orderbook", detail: "Filled/pending orders can be inspected read-only." },
  { id: "tradebook", label: "Tradebook", detail: "Filled order trades can be imported into Journal." },
];

export function brokerReadOnlyChecklist(broker: BrokerReadOnlySmokeState | null | undefined) {
  const checks = broker?.read_only_smoke_checks ?? {};
  return READ_ONLY_CHECKS.map((item) => {
    const check = checks[item.id];
    const ok = check?.ok === true;
    const value = !check ? "Pending" : ok ? "Passed" : "Needs attention";
    const suffix = check?.count != null ? ` · ${check.count.toLocaleString("en-IN")} rows` : "";
    const detail = check?.error
      ? `${item.detail} Last error: ${check.error}.`
      : check?.note
        ? `${item.detail} ${check.note}`
        : item.detail;
    return {
      ...item,
      value: `${value}${suffix}`,
      tone: !check ? "pending" as const : ok ? "good" as const : "warn" as const,
      detail,
    };
  });
}
