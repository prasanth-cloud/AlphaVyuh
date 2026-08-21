export type BrokerSafetyStatus = {
  connected?: boolean;
  broker?: string | null;
  plan_allows_broker?: boolean;
  token_expired?: boolean;
  read_only_smoke_required?: boolean;
  read_only_smoke_passed?: boolean;
  read_only_smoke_fresh?: boolean;
  read_only_smoke_checked_at?: string | null;
  live_order_enabled?: boolean;
};

export function canRouteLiveBrokerOrder(options: {
  broker: BrokerSafetyStatus | null | undefined;
  unavailable?: boolean;
  setupId?: string | null;
  lifecycle?: string | null;
  reviewCanProceed?: boolean;
}): boolean {
  return Boolean(
    !options.unavailable &&
    options.broker?.live_order_enabled === true &&
    options.broker.connected === true &&
    options.broker.broker &&
    ["zerodha", "upstox"].includes(options.broker.broker.toLowerCase()) &&
    options.broker.plan_allows_broker !== false &&
    options.setupId &&
    options.lifecycle === "ready" &&
    options.reviewCanProceed === true,
  );
}

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

export type BrokerOrderActionBarPresentation = {
  modeLabel: string;
  detail: string;
  primaryLabel: string;
  savingLabel: string;
  primaryDisabled: boolean;
  requiresLiveConfirmation: boolean;
  status: "good" | "warn" | "bad";
};

export type BrokerReadOnlyEvidenceSummary = {
  status: "unavailable" | "blocked" | "refresh-required" | "ready-for-owner-review";
  headline: string;
  detail: string;
  brokerLabel: string;
  checkedAt: string | null;
  passedChecks: number;
  totalChecks: number;
  canProceedToOwnerReview: boolean;
  blockers: string[];
  evidenceItems: Array<{ label: string; value: string }>;
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

export function brokerOrderActionBarPresentation(options: {
  broker: BrokerSafetyStatus | null | undefined;
  unavailable?: boolean;
  canRouteLiveOrder: boolean;
  liveConfirmed?: boolean;
  side: "buy" | "sell";
}): BrokerOrderActionBarPresentation {
  const sideLabel = options.side === "buy" ? "buy" : "sell";
  const gate = brokerOrderGatePresentation(options.broker, { unavailable: options.unavailable });

  if (!options.canRouteLiveOrder) {
    return {
      modeLabel: options.broker?.connected ? "Import only" : options.unavailable ? "Read-only unavailable" : "Journal draft",
      detail: options.unavailable
        ? "Broker status is unavailable. Save the plan as a journal draft and place any real trade directly with your broker."
        : "Order capture records a journal draft only. Place any real trade directly with your broker.",
      primaryLabel: `Save ${sideLabel} journal draft`,
      savingLabel: "Saving...",
      primaryDisabled: false,
      requiresLiveConfirmation: false,
      status: gate.status,
    };
  }

  const confirmed = options.liveConfirmed === true;
  return {
    modeLabel: gate.value,
    detail: gate.detail,
    primaryLabel: confirmed
      ? `${sideLabel === "buy" ? "Buy" : "Sell"} via ${brokerLabel(options.broker?.broker).toLowerCase()}`
      : "Confirm broker order",
    savingLabel: "Submitting...",
    primaryDisabled: !confirmed,
    requiresLiveConfirmation: true,
    status: confirmed ? gate.status : "warn",
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

export const BROKER_EXECUTION_APPROVAL_ITEMS = [
  "Owner approval timestamp",
  "Broker and account owner",
  "Mode: sandbox or live",
  "Symbol, side, quantity, and order type",
  "Risk plan and confirmation source",
  "Fresh same-broker read-only smoke evidence",
] as const;

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

export function brokerReadOnlyEvidenceSummary(
  broker: BrokerReadOnlySmokeState | null | undefined,
  options: { unavailable?: boolean } = {},
): BrokerReadOnlyEvidenceSummary {
  const label = brokerLabel(broker?.broker);
  const checklist = brokerReadOnlyChecklist(broker);
  const passedChecks = checklist.filter((item) => item.tone === "good").length;
  const totalChecks = checklist.length;
  const incompleteChecks = checklist
    .filter((item) => item.tone !== "good")
    .map((item) => item.label);
  const checkedAt = broker?.read_only_smoke_checked_at ?? null;
  const baseItems = [
    { label: "Broker", value: label },
    { label: "Read-only smoke", value: `${passedChecks}/${totalChecks} checks passed` },
    { label: "Freshness", value: checkedAt ? broker?.read_only_smoke_fresh === false ? "Refresh required" : "Fresh" : "Not run" },
    { label: "Approval status", value: "Evidence only" },
  ];

  if (options.unavailable) {
    return {
      status: "unavailable",
      headline: "Broker evidence unavailable",
      detail: "Broker status cannot be confirmed. Keep order capture as journal drafts until status recovers.",
      brokerLabel: label,
      checkedAt: null,
      passedChecks: 0,
      totalChecks,
      canProceedToOwnerReview: false,
      blockers: ["Broker status unavailable"],
      evidenceItems: baseItems,
    };
  }

  const blockers = [
    broker?.connected ? null : "No read-only broker session connected",
    broker?.token_expired ? "Broker token expired" : null,
    broker?.read_only_smoke_required !== false && !checkedAt ? "Read-only smoke has not run" : null,
    ...incompleteChecks.map((label) => `${label} check is not passing`),
  ].filter((item): item is string => Boolean(item));

  if (checkedAt && broker?.read_only_smoke_fresh === false) {
    return {
      status: "refresh-required",
      headline: "Refresh read-only evidence",
      detail: `${label} read-only smoke evidence is stale. Rerun smoke before this can support owner review.`,
      brokerLabel: label,
      checkedAt,
      passedChecks,
      totalChecks,
      canProceedToOwnerReview: false,
      blockers: ["Read-only smoke is older than the 24-hour launch gate", ...blockers.filter((item) => !item.includes("has not run"))],
      evidenceItems: baseItems,
    };
  }

  if (broker?.read_only_smoke_passed === true && broker?.read_only_smoke_fresh !== false && passedChecks === totalChecks) {
    return {
      status: "ready-for-owner-review",
      headline: "Read-only evidence ready for owner review",
      detail: `${label} profile, holdings, positions, orderbook, and tradebook reads passed. This is evidence, not approval to place orders.`,
      brokerLabel: label,
      checkedAt,
      passedChecks,
      totalChecks,
      canProceedToOwnerReview: true,
      blockers: [],
      evidenceItems: baseItems,
    };
  }

  return {
    status: "blocked",
    headline: "Read-only evidence incomplete",
    detail: `${label} read-only evidence must be complete before any sandbox/live order route can be considered.`,
    brokerLabel: label,
    checkedAt,
    passedChecks,
    totalChecks,
    canProceedToOwnerReview: false,
    blockers,
    evidenceItems: baseItems,
  };
}
