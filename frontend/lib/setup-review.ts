import type {
  Setup,
  SetupReview,
  SetupReviewRequest,
  SetupReviewRule,
} from "@/lib/api/types";

type ReviewRule = SetupReviewRule & {
  enabled?: boolean;
  sort_order?: number;
};

export function defaultSetupReviewRules(): ReviewRule[] {
  return [
    { code: "plan_geometry", label: "Entry, stop, and target geometry", severity: "block", status: "not_evaluated", message: "", sort_order: 10 },
    { code: "positive_risk", label: "Positive risk per share", severity: "block", status: "not_evaluated", message: "", sort_order: 20 },
    { code: "quantity_set", label: "Position size is set", severity: "block", status: "not_evaluated", message: "", sort_order: 30 },
    { code: "minimum_rr", label: "Minimum planned reward-to-risk", severity: "block", status: "not_evaluated", message: "", config: { min_rr: 2 }, sort_order: 40 },
    { code: "written_thesis", label: "Written trade thesis", severity: "block", status: "not_evaluated", message: "", sort_order: 50 },
    { code: "invalidation_defined", label: "Invalidation condition", severity: "check", status: "not_evaluated", message: "", sort_order: 60 },
  ];
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function entryOf(setup: Partial<Setup>): number | null {
  const low = numberValue(setup.entry_low);
  const high = numberValue(setup.entry_high);
  if (low != null && high != null) return (low + high) / 2;
  return low ?? high;
}

function riskRewardOf(setup: Partial<Setup>): { risk: number | null; reward: number | null; rr: number | null } {
  const entry = entryOf(setup);
  const stop = numberValue(setup.stop_price);
  const target = numberValue(setup.target_price);
  if (entry == null || stop == null || target == null) return { risk: null, reward: null, rr: null };
  const risk = setup.direction === "short" ? stop - entry : entry - stop;
  const reward = setup.direction === "short" ? entry - target : target - entry;
  return { risk, reward, rr: risk > 0 && reward > 0 ? reward / risk : null };
}

function result(
  rule: ReviewRule,
  status: SetupReviewRule["status"],
  message: string,
  actual?: unknown,
  expected?: unknown,
): SetupReviewRule {
  return {
    code: rule.code,
    label: rule.label,
    severity: rule.severity,
    status,
    message,
    actual,
    expected,
    config: rule.config,
  };
}

function evaluateRule(setup: Partial<Setup>, rule: ReviewRule, accountEquity?: number | null): SetupReviewRule {
  const entry = entryOf(setup);
  const stop = numberValue(setup.stop_price);
  const target = numberValue(setup.target_price);
  const { risk, rr } = riskRewardOf(setup);
  const quantity = numberValue(setup.planned_quantity);

  switch (rule.code) {
    case "plan_geometry": {
      const valid = entry != null && stop != null && target != null && (
        setup.direction === "long" ? stop < entry && entry < target :
          setup.direction === "short" ? target < entry && entry < stop : false
      );
      return result(rule, valid ? "pass" : "fail", valid ? "Plan levels match the selected direction." : "Entry, stop, and target must be present and ordered for the selected direction.");
    }
    case "positive_risk": {
      const valid = risk != null && risk > 0;
      return result(rule, valid ? "pass" : "fail", valid ? "Risk per share is positive." : "A positive risk distance is required.", risk, "> 0");
    }
    case "quantity_set": {
      const valid = quantity != null && quantity > 0 && Number.isInteger(quantity);
      return result(rule, valid ? "pass" : "fail", valid ? "Position size is set." : "Position size must be a positive whole number.", quantity, "positive integer");
    }
    case "minimum_rr": {
      const minimum = numberValue(rule.config?.min_rr) ?? 2;
      const valid = rr != null && rr >= minimum;
      return result(rule, valid ? "pass" : "fail", rr != null ? `Planned R:R is ${rr.toFixed(2)}.` : "Planned R:R cannot be calculated.", rr, `>= ${minimum}`);
    }
    case "written_thesis": {
      const valid = Boolean(setup.thesis?.trim());
      return result(rule, valid ? "pass" : "fail", valid ? "Trade thesis is recorded." : "Write the reason for taking the trade.", valid, true);
    }
    case "invalidation_defined": {
      const valid = Boolean(setup.invalidation_reason?.trim());
      return result(rule, valid ? "pass" : "fail", valid ? "Invalidation condition is recorded." : "Record what would invalidate the plan.", valid, true);
    }
    case "max_risk_amount": {
      const maximum = numberValue(rule.config?.max_risk_amount);
      if (maximum == null) return result(rule, "not_evaluated", "No maximum risk amount is configured.");
      const actual = numberValue(setup.planned_risk_amount);
      const valid = actual != null && actual <= maximum;
      return result(rule, valid ? "pass" : "fail", valid ? "Planned risk is within the rulebook budget." : "Planned risk exceeds the rulebook budget.", actual, `<= ${maximum}`);
    }
    case "max_account_risk_pct": {
      const maximum = numberValue(rule.config?.max_account_risk_pct);
      const equity = numberValue(accountEquity);
      if (maximum == null) return result(rule, "not_evaluated", "No account risk percentage is configured.");
      if (equity == null || equity <= 0) return result(rule, "not_evaluated", "Account equity is required to evaluate this rule.", undefined, `<= ${maximum}%`);
      const actual = numberValue(setup.planned_risk_amount);
      const actualPct = actual != null ? actual / equity * 100 : null;
      const valid = actualPct != null && actualPct <= maximum;
      return result(rule, valid ? "pass" : "fail", valid ? "Account risk is within the rulebook budget." : "Account risk exceeds the rulebook budget.", actualPct, `<= ${maximum}%`);
    }
    default:
      return result(rule, "not_evaluated", "This rule is not supported by the current evaluator.");
  }
}

export function evaluateSetupReview(
  setup: Partial<Setup>,
  request: SetupReviewRequest = {},
  configuredRules: ReviewRule[] = defaultSetupReviewRules(),
): SetupReview {
  const rules = configuredRules.filter((rule) => rule.enabled !== false);
  const results = rules
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .map((rule) => evaluateRule(setup, rule, request.account_equity));
  const blocked = results.filter((item) => item.status === "fail" && item.severity === "block");
  const warned = results.filter((item) => item.status === "fail" && (item.severity === "warn" || item.severity === "check"));
  const overallStatus = blocked.length > 0 ? "blocked" : warned.length > 0 ? "warned" : "passed";
  const overrideReason = request.override_reason?.trim() || null;
  return {
    setup_id: String(setup.id ?? "local-setup"),
    rulebook_id: request.rulebook_id ?? "local-starter-rulebook",
    overall_status: overallStatus,
    can_proceed: blocked.length === 0 && (warned.length === 0 || Boolean(overrideReason)),
    summary: blocked.length > 0
      ? `${blocked.length} hard rule(s) block order review.`
      : warned.length > 0
        ? (overrideReason ? "Warnings acknowledged with an override reason." : `${warned.length} rule(s) need review or an override reason.`)
        : "All enabled setup rules pass.",
    override_reason: overrideReason,
    results,
    input_snapshot: {
      symbol: setup.symbol?.toUpperCase() ?? "",
      direction: setup.direction,
      entry_low: setup.entry_low,
      entry_high: setup.entry_high,
      stop_price: setup.stop_price,
      target_price: setup.target_price,
      planned_quantity: setup.planned_quantity,
      planned_risk_amount: setup.planned_risk_amount,
      account_equity: request.account_equity ?? null,
    },
  };
}
