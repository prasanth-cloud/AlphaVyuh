export type AgentStatus = "active" | "watching" | "blocked" | "ready";

export type AgentLane = {
  id: string;
  name: string;
  scope: string;
  autonomy: string;
  status: AgentStatus;
  currentWork: string;
  ownerFiles: string;
  lastUpdate: string;
};

export type ShippedAgentPr = {
  pr: string;
  href: string;
  title: string;
  agent: string;
  merged: string;
  notes: string;
  productImpact: string;
};

export type AgentBlocker = {
  severity: "owner" | "database" | "external";
  blocker: string;
  owner: string;
  nextMove: string;
  productImpact: string;
};

export type AgentRequest = {
  id: string;
  from: string;
  to: string;
  status: string;
  request: string;
};

export const agentLanes: AgentLane[] = [
  {
    id: "manager",
    name: "Manager",
    scope: "Queue, decomposition, PR integration",
    autonomy: "Coordinates",
    status: "active",
    currentWork: "Turns founder goals into issue -> agent roster -> PR -> validation loops; latest loop shipped PRs #130-#132.",
    ownerFiles: "GitHub issues, PR notes, docs/agent-runs",
    lastUpdate: "PR #132 merged",
  },
  {
    id: "feature",
    name: "Feature",
    scope: "Trader-facing workflows",
    autonomy: "Level 2",
    status: "active",
    currentWork: "Keeps trader-facing flow minimal while backend/security agents harden launch surfaces.",
    ownerFiles: "frontend/app/(app), frontend/lib/api.ts, feature routers",
    lastUpdate: "PR #132 merged",
  },
  {
    id: "data",
    name: "Data",
    scope: "Ingest, snapshots, indicators, alert parity",
    autonomy: "Level 3",
    status: "blocked",
    currentWork: "EOD scan alert live parity and journal idea context are ready but waiting on production migration evidence.",
    ownerFiles: "backend/app/services, backend/scripts, supabase/migrations",
    lastUpdate: "PRs #122/#123 blocked",
  },
  {
    id: "qa",
    name: "QA",
    scope: "Workflow regression and launch safety",
    autonomy: "Level 3",
    status: "watching",
    currentWork: "Protects auth, scanner, watchlist, chart, journal, layout, perf, and agent PR gates.",
    ownerFiles: "frontend/tests/e2e, backend/tests, QA reports",
    lastUpdate: "PR #132 gate passed",
  },
  {
    id: "deploy",
    name: "Deploy",
    scope: "Vercel, domains, env, release checks",
    autonomy: "Level 3",
    status: "ready",
    currentWork: "Preview checks are green; production actions stay gated by owner approvals.",
    ownerFiles: "Vercel, GitHub Actions, deploy docs",
    lastUpdate: "Vercel green",
  },
];

export const shippedAgentPrs: ShippedAgentPr[] = [
  {
    pr: "#132",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/132",
    title: "Show product impact in mission control",
    agent: "Product + QA + Manager",
    merged: "2026-05-17",
    notes: "Agent work now explains what improved, not only what changed.",
    productImpact: "Founder can judge whether agent work is creating trader value before reading PR details.",
  },
  {
    pr: "#131",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/131",
    title: "Make plan status read only",
    agent: "Security + Backend + QA",
    merged: "2026-05-17",
    notes: "Payment status reads no longer mutate billing state; explicit reconcile path added.",
    productImpact: "Billing and entitlement state is more predictable before paid plans are enabled.",
  },
  {
    pr: "#130",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/130",
    title: "Rate limit public market data routes",
    agent: "Security + Backend",
    merged: "2026-05-17",
    notes: "Provider-backed quote and candle routes now return 429 before provider calls when throttled.",
    productImpact: "Public chart and quote access has a cost/abuse brake without forcing login.",
  },
  {
    pr: "#129",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/129",
    title: "Protect data operations routes",
    agent: "Security + Backend",
    merged: "2026-05-17",
    notes: "Data health and run-history endpoints require authenticated access.",
    productImpact: "Operational market-data details are no longer publicly exposed.",
  },
];

export const agentBlockers: AgentBlocker[] = [
  {
    severity: "database",
    blocker: "PR #128 requires public intake RLS migration evidence.",
    owner: "Founder / Supabase",
    nextMove: "Apply 20260517123000_public_intake_feedback_rls.sql to production, then add PR evidence.",
    productImpact: "Founder-beta emails, invite codes, and feedback tables remain the highest-priority database hardening gate.",
  },
  {
    severity: "database",
    blocker: "PR #122 requires scan alert migration evidence.",
    owner: "Founder / Data",
    nextMove: "Apply 038_scan_alerts.sql to production, then rerun migration drift.",
    productImpact: "Delays production EOD scan alerts for saved screens.",
  },
  {
    severity: "database",
    blocker: "PR #123 requires journal idea-context migration evidence.",
    owner: "Founder / Data",
    nextMove: "Apply 039_journal_idea_context.sql after #122 lands or rebase.",
    productImpact: "Delays live persistence of scanner-to-journal context.",
  },
  {
    severity: "owner",
    blocker: "Broker read-only smoke still needs real Kite or Upstox tokens.",
    owner: "Founder",
    nextMove: "Provide short-lived read-only token when broker work resumes.",
    productImpact: "Keeps broker import and execution confidence gated during beta.",
  },
  {
    severity: "external",
    blocker: "Market-data redistribution terms are not finalized.",
    owner: "Founder",
    nextMove: "Choose EOD/free-first beta policy or paid vendor path before paid launch.",
    productImpact: "Limits how broadly AlphaVyuh can be marketed with real market data.",
  },
];

export const agentRequests: AgentRequest[] = [
  {
    id: "REQ-001",
    from: "Feature",
    to: "Data",
    status: "in progress",
    request: "Breadth sector endpoint for dashboard sector breadth context.",
  },
];

export const nextAgentActions = [
  "Unblock PR #122 by applying the scan alert migration with production evidence.",
  "Unblock PR #123 after #122, then land live journal idea-context persistence.",
  "Turn saved journal lessons into weekly review clusters after live context is stable.",
  "Keep broker execution hidden until read-only smoke and owner-approved order validation pass.",
  "Keep every future slice on the issue -> agent roster -> PR -> validation cadence.",
];

export function agentStatusTone(status: AgentStatus) {
  if (status === "active") return "var(--gain)";
  if (status === "blocked") return "var(--loss)";
  if (status === "watching") return "var(--warn)";
  return "var(--text-tertiary)";
}

export function validateMissionControlData() {
  const ids = new Set(agentLanes.map((agent) => agent.id));
  return (
    ids.size === agentLanes.length &&
    agentLanes.every((agent) => agent.name && agent.currentWork && agent.ownerFiles) &&
    shippedAgentPrs.every((pr) => pr.href.startsWith("https://github.com/prasanth-cloud/AlphaVyuh/pull/") && pr.productImpact) &&
    agentBlockers.every((blocker) => blocker.productImpact) &&
    agentRequests.every((request) => request.id.startsWith("REQ-"))
  );
}
