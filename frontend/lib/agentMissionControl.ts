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
};

export type AgentBlocker = {
  severity: "owner" | "database" | "external";
  blocker: string;
  owner: string;
  nextMove: string;
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
    currentWork: "Turns founder goals into issue -> agent roster -> PR -> validation loops.",
    ownerFiles: "GitHub issues, PR notes, docs/agent-runs",
    lastUpdate: "PR #125 merged",
  },
  {
    id: "feature",
    name: "Feature",
    scope: "Trader-facing workflows",
    autonomy: "Level 2",
    status: "active",
    currentWork: "Journal review lessons shipped; next useful slice waits on live context migration.",
    ownerFiles: "frontend/app/(app), frontend/lib/api.ts, feature routers",
    lastUpdate: "Issue #124 closed",
  },
  {
    id: "data",
    name: "Data",
    scope: "Ingest, snapshots, indicators, alert parity",
    autonomy: "Level 3",
    status: "blocked",
    currentWork: "EOD scan alert live parity is ready but waiting on production migration evidence.",
    ownerFiles: "backend/app/services, backend/scripts, supabase/migrations",
    lastUpdate: "PR #122 blocked",
  },
  {
    id: "qa",
    name: "QA",
    scope: "Workflow regression and launch safety",
    autonomy: "Level 3",
    status: "watching",
    currentWork: "Protects auth, scanner, watchlist, chart, journal, layout, and perf gates.",
    ownerFiles: "frontend/tests/e2e, backend/tests, QA reports",
    lastUpdate: "PR #125 gate passed",
  },
  {
    id: "security",
    name: "Security",
    scope: "Auth, Supabase access, broker/payment gates",
    autonomy: "Level 3",
    status: "active",
    currentWork: "Public intake and feedback RLS hardening is being prepared from the launch safety scan.",
    ownerFiles: "supabase/migrations, backend/tests, security docs",
    lastUpdate: "Issue #108 active",
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
    pr: "#127",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/127",
    title: "Add Agent Mission Control",
    agent: "Manager + Product + Frontend + QA",
    merged: "2026-05-17",
    notes: "Internal /agents surface shows lanes, blockers, shipped PRs, and next actions.",
  },
  {
    pr: "#125",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/125",
    title: "Save journal review lessons",
    agent: "Feature + QA",
    merged: "2026-05-17",
    notes: "Closed trades can save one lesson and become reviewed.",
  },
  {
    pr: "#121",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/121",
    title: "Add saved EOD scan alerts",
    agent: "Data + Feature",
    merged: "2026-05-17",
    notes: "Saved scans can run as EOD alert candidates in mock/local mode.",
  },
  {
    pr: "#119",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/119",
    title: "Surface journal review prompts",
    agent: "Feature + QA",
    merged: "2026-05-17",
    notes: "Journal review now shows idea context before lesson capture.",
  },
  {
    pr: "#117",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/117",
    title: "Polish issue #105 frontend flow",
    agent: "Design + Feature",
    merged: "2026-05-17",
    notes: "Frontend polish pass landed and issue #105 closed.",
  },
];

export const agentBlockers: AgentBlocker[] = [
  {
    severity: "database",
    blocker: "Public intake and feedback RLS migration requires production evidence.",
    owner: "Founder / Security",
    nextMove: "Apply 20260517123000_public_intake_feedback_rls.sql to production, then rerun migration drift.",
  },
  {
    severity: "database",
    blocker: "PR #122 requires scan alert migration evidence.",
    owner: "Founder / Data",
    nextMove: "Apply 038_scan_alerts.sql to production, then rerun migration drift.",
  },
  {
    severity: "database",
    blocker: "PR #123 requires journal idea-context migration evidence.",
    owner: "Founder / Data",
    nextMove: "Apply 039_journal_idea_context.sql after #122 lands or rebase.",
  },
  {
    severity: "owner",
    blocker: "Broker read-only smoke still needs real Kite or Upstox tokens.",
    owner: "Founder",
    nextMove: "Provide short-lived read-only token when broker work resumes.",
  },
  {
    severity: "external",
    blocker: "Market-data redistribution terms are not finalized.",
    owner: "Founder",
    nextMove: "Choose EOD/free-first beta policy or paid vendor path before paid launch.",
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
    shippedAgentPrs.every((pr) => pr.href.startsWith("https://github.com/prasanth-cloud/AlphaVyuh/pull/")) &&
    agentRequests.every((request) => request.id.startsWith("REQ-"))
  );
}
