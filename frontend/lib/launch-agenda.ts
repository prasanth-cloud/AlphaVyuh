import type { ApiReachability } from "@/lib/data-mode";
import type { SectorTaxonomyPresentation } from "@/lib/sector-taxonomy-copy";

export type LaunchAgendaStatus = "good" | "warn" | "bad";

export type LaunchAgendaItem = {
  id: string;
  label: string;
  value: string;
  detail: string;
  status: LaunchAgendaStatus;
  href: string;
};

export type LaunchAgendaInput = {
  apiReachable: ApiReachability;
  marketStatus: LaunchAgendaStatus;
  marketDetail: string;
  sectorTaxonomy: SectorTaxonomyPresentation;
  brokerGate: {
    value: string;
    detail: string;
    status: LaunchAgendaStatus;
  };
  closedTrades: number;
  reviewedTrades: number;
  accountIssueCount: number;
};

function journalAgenda(input: LaunchAgendaInput): LaunchAgendaItem {
  if (input.accountIssueCount > 0) {
    return {
      id: "decision-memory",
      label: "Decision memory loop",
      value: "PAUSED",
      detail: "Journal, broker, or account services are unavailable, so closed-trade review coverage is not being treated as empty.",
      status: "bad",
      href: "/journal",
    };
  }

  if (input.closedTrades < 3) {
    return {
      id: "decision-memory",
      label: "Decision memory loop",
      value: "BUILD SAMPLE",
      detail: "The scanner-to-chart-to-journal loop is wired, but pattern review needs at least 3 closed trades before it becomes useful.",
      status: "warn",
      href: "/journal",
    };
  }

  const reviewCoverage = Math.round((input.reviewedTrades / input.closedTrades) * 100);
  return {
    id: "decision-memory",
    label: "Decision memory loop",
    value: `${reviewCoverage}% REVIEWED`,
    detail: reviewCoverage >= 70
      ? "Closed trades have enough saved lessons to support repeated setup and mistake review."
      : "Push reviewed closed trades toward 70% so AlphaVyuh can become decision memory, not only a trade log.",
    status: reviewCoverage >= 70 ? "good" : "warn",
    href: "/journal",
  };
}

export function buildLaunchAgenda(input: LaunchAgendaInput): LaunchAgendaItem[] {
  const dataStatus: LaunchAgendaStatus = input.apiReachable === "down" ? "bad" : input.marketStatus;
  const dataValue = dataStatus === "good" ? "EOD READY" : dataStatus === "warn" ? "VERIFY" : "BLOCKED";
  const sectorStatus: LaunchAgendaStatus = input.sectorTaxonomy.status === "good" ? "good" : input.sectorTaxonomy.status === "warn" ? "warn" : "bad";

  return [
    {
      id: "launch-scope",
      label: "Launch scope",
      value: "CASH EQUITY EOD",
      detail: "NSE/BSE cash equities only. No F&O, options, derivatives, intraday claims, live order execution, or investment advice.",
      status: "good",
      href: "/access",
    },
    {
      id: "data-trust",
      label: "Market data trust",
      value: dataValue,
      detail: input.apiReachable === "down"
        ? "Market data API is unreachable; do not trust Today, scanner, or chart state until service recovery passes."
        : input.marketDetail,
      status: dataStatus,
      href: "/data",
    },
    {
      id: "sector-source",
      label: "Sector source",
      value: input.sectorTaxonomy.status === "good" ? "APPROVED" : "APPROVAL PENDING",
      detail: `${input.sectorTaxonomy.approvalDetail} ${input.sectorTaxonomy.detail}`,
      status: sectorStatus,
      href: "/data",
    },
    {
      id: "broker-boundary",
      label: "Broker boundary",
      value: input.brokerGate.value,
      detail: input.brokerGate.detail,
      status: input.brokerGate.status,
      href: "/settings/broker",
    },
    journalAgenda(input),
    {
      id: "owner-gates",
      label: "Owner gates",
      value: "DECIDE BEFORE PAID LAUNCH",
      detail: "TradingView licensing, data-vendor posture, billing/legal/support, production Supabase mutations, and broker execution remain explicit owner decisions.",
      status: "warn",
      href: "/data",
    },
  ];
}
