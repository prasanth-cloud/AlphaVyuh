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
    currentWork: "Runs Professional Access cleanup through issue -> agent roster -> PR -> validation loops; latest loop shipped PRs #158-#160.",
    ownerFiles: "GitHub issues, PR notes, docs/agent-runs",
    lastUpdate: "PR #160 merged",
  },
  {
    id: "feature",
    name: "Feature",
    scope: "Trader-facing workflows",
    autonomy: "Level 2",
    status: "watching",
    currentWork: "Keeps visible product copy on Professional Access language while data recovery work stays focused on Railway hosting.",
    ownerFiles: "frontend/app/(app), frontend/lib/api.ts, feature routers",
    lastUpdate: "Public posture check passed",
  },
  {
    id: "data",
    name: "Data",
    scope: "Ingest, snapshots, indicators, alert parity",
    autonomy: "Level 3",
    status: "blocked",
    currentWork: "Supabase EOD rows are fresh; production visibility is blocked because the Railway backend returns fallback 404.",
    ownerFiles: "backend/app/services, backend/scripts, supabase/migrations",
    lastUpdate: "check:data-recovery failing at Railway",
  },
  {
    id: "qa",
    name: "QA",
    scope: "Workflow regression and launch safety",
    autonomy: "Level 3",
    status: "watching",
    currentWork: "Protects Professional Access copy, data-recovery checks, auth, scanner, watchlist, chart, journal, layout, perf, and agent PR gates.",
    ownerFiles: "frontend/tests/e2e, backend/tests, QA reports",
    lastUpdate: "PR #160 gate passed",
  },
  {
    id: "security",
    name: "Security",
    scope: "Auth, Supabase access, broker/payment gates",
    autonomy: "Level 3",
    status: "watching",
    currentWork: "Keeps broker execution disabled, payment enablement gated, and recovery commands free of credential output.",
    ownerFiles: "supabase/migrations, backend/tests, security docs",
    lastUpdate: "Recovery helper masks values",
  },
  {
    id: "deploy",
    name: "Deploy",
    scope: "Vercel, domains, env, release checks",
    autonomy: "Level 3",
    status: "blocked",
    currentWork: "Vercel is serving the frontend, but Railway backend recovery needs owner-provided Railway credentials or a refreshed local login.",
    ownerFiles: "Vercel, GitHub Actions, deploy docs",
    lastUpdate: "Issue #137 open",
  },
];

export const shippedAgentPrs: ShippedAgentPr[] = [
  {
    pr: "#160",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/160",
    title: "Document Railway recovery gate",
    agent: "Deploy + QA + Manager",
    merged: "2026-05-18",
    notes: "Launch docs now require Railway recovery checks before customer demo or launch.",
    productImpact: "Operators cannot accidentally treat healthy Supabase EOD rows as a working production app while the API host is down.",
  },
  {
    pr: "#159",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/159",
    title: "Prepare Railway recovery credentials",
    agent: "Deploy + Security",
    merged: "2026-05-18",
    notes: "Added a dry-run-first helper for applying Railway recovery values and dispatching the recovery workflow.",
    productImpact: "The owner has one repeatable recovery path without pasting sensitive values into PRs or chat.",
  },
  {
    pr: "#158",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/158",
    title: "Polish Professional Access recovery",
    agent: "Product + Frontend + QA",
    merged: "2026-05-18",
    notes: "Public and app copy now presents AlphaVyuh as Professional Access with clear EOD data and broker-import posture.",
    productImpact: "Trader-facing pages sound like a serious product while still being honest about EOD data and disabled execution.",
  },
  {
    pr: "#99",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/99",
    title: "Tighten professional chart controls",
    agent: "Chart + Frontend + QA",
    merged: "2026-05-12",
    notes: "Full Chart controls moved toward compact Tools and indicator dropdown patterns.",
    productImpact: "The chart workspace is less cluttered and closer to the focused TradingView-style experience users expect.",
  },
];

export const agentBlockers: AgentBlocker[] = [
  {
    severity: "external",
    blocker: "Railway production backend returns fallback 404.",
    owner: "Owner / Railway",
    nextMove: "Provide Railway token, project, and service values or run local railway login; then run the backend recovery workflow.",
    productImpact: "Dashboard, scanner, watchlist charts, and full chart cannot show real EOD data on alphavyuh.com until the API host is restored.",
  },
  {
    severity: "owner",
    blocker: "Broker read-only smoke still needs real Kite or Upstox tokens when broker work resumes.",
    owner: "Owner",
    nextMove: "Provide short-lived read-only token when broker work resumes.",
    productImpact: "Keeps broker import and execution confidence gated until production approval.",
  },
  {
    severity: "external",
    blocker: "Market-data redistribution terms are not finalized.",
    owner: "Owner",
    nextMove: "Choose EOD/free-first policy or paid vendor path before paid launch.",
    productImpact: "Limits how broadly AlphaVyuh can be marketed with real market data.",
  },
];

export const agentRequests: AgentRequest[] = [
  {
    id: "REQ-001",
    from: "Data",
    to: "Deploy",
    status: "blocked",
    request: "Recover the Railway backend so current Supabase EOD rows can reach dashboard, scanner, watchlist, and charts.",
  },
];

export const nextAgentActions = [
  "Run npm run check:data-recovery after Railway credentials are available.",
  "Run the manual Railway Backend Recovery workflow or npm run recover:railway-backend after local railway login.",
  "Browser-smoke dashboard, scanner, watchlist chart, full chart, journal, settings/broker, and data status after the API is restored.",
  "Turn saved journal lessons into weekly review clusters after production data visibility is stable.",
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
