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
    currentWork: "Runs Professional Access cleanup through issue -> agent roster -> PR -> validation loops; latest loop shipped PRs #176-#179.",
    ownerFiles: "GitHub issues, PR notes, docs/agent-runs",
    lastUpdate: "PR #179 merged",
  },
  {
    id: "feature",
    name: "Feature",
    scope: "Trader-facing workflows",
    autonomy: "Level 2",
    status: "watching",
    currentWork: "Keeps visible product copy and active planning docs on Professional Access language while data recovery and outage copy stay focused on Railway hosting.",
    ownerFiles: "frontend/app/(app), frontend/lib/api.ts, feature routers",
    lastUpdate: "PR #178 recovery next-step copy merged",
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
    currentWork: "Protects Professional Access copy, data-recovery checks, signed-in smoke, production recovery launch gate, auth, scanner, watchlist, chart, journal, layout, perf, and agent PR gates.",
    ownerFiles: "frontend/tests/e2e, backend/tests, QA reports",
    lastUpdate: "PR #179 launch recovery gate merged",
  },
  {
    id: "security",
    name: "Security",
    scope: "Auth, Supabase access, broker/payment gates",
    autonomy: "Level 3",
    status: "watching",
    currentWork: "Keeps broker execution disabled, payment enablement gated, and recovery commands free of credential output.",
    ownerFiles: "supabase/migrations, backend/tests, security docs",
    lastUpdate: "No broker or billing enablement in PRs #176-#179",
  },
  {
    id: "deploy",
    name: "Deploy",
    scope: "Vercel, domains, env, release checks",
    autonomy: "Level 3",
    status: "blocked",
    currentWork: "Vercel is serving the frontend, but Railway backend recovery needs owner-provided Railway credentials or a refreshed local login.",
    ownerFiles: "Vercel, GitHub Actions, deploy docs",
    lastUpdate: "check:data-recovery still blocked at Railway",
  },
];

export const shippedAgentPrs: ShippedAgentPr[] = [
  {
    pr: "#179",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/179",
    title: "Add production recovery launch gate",
    agent: "Release + QA",
    merged: "2026-05-19",
    notes: "Added `RUN_PRODUCTION_RECOVERY_SMOKE=1` to the launch readiness command and documented the post-Railway recovery gate.",
    productImpact: "After Railway recovery, one launch command can prove production data recovery and signed-in browser smoke before users see the platform.",
  },
  {
    pr: "#178",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/178",
    title: "Clarify Railway recovery next step",
    agent: "Backend Recovery + Release",
    merged: "2026-05-19",
    notes: "Updated the recovery preflight to point directly at the local Railway login and backend recovery helper.",
    productImpact: "The no-data recovery path now gives the owner the exact command needed instead of a generic login reminder.",
  },
  {
    pr: "#177",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/177",
    title: "Stabilize backend migration checks",
    agent: "Backend + QA",
    merged: "2026-05-19",
    notes: "Fixed backend migration path resolution so focused backend tests can run reliably from CI and local shells.",
    productImpact: "Release verification is less brittle, which keeps Professional Access cleanup moving without hiding backend regressions.",
  },
  {
    pr: "#176",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/176",
    title: "Refresh mission control recovery status",
    agent: "Manager + QA",
    merged: "2026-05-19",
    notes: "Aligned the `/agents` operator view with the current recovery cycle and Railway blocker.",
    productImpact: "The founder can see which agent lane owns recovery, QA, release, and blocker follow-up without reading chat history.",
  },
  {
    pr: "#175",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/175",
    title: "Add production smoke entrypoint",
    agent: "QA + Frontend + Release",
    merged: "2026-05-19",
    notes: "Added repeatable signed-in and production browser smoke commands for dashboard, scanner, watchlist, full chart, journal, settings, broker, and data status.",
    productImpact: "After Railway recovery, operators can prove the full professional workflow shows real data with one command instead of a manual checklist.",
  },
  {
    pr: "#174",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/174",
    title: "Align growth plan with Professional Access",
    agent: "Product + QA + Release",
    merged: "2026-05-19",
    notes: "Replaced the active old launch plan with a Professional Access growth plan and hardened data-recovery checker tests.",
    productImpact: "Future agent work now inherits professional positioning and deterministic recovery checks instead of old tester-program framing.",
  },
  {
    pr: "#173",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/173",
    title: "Add Railway login recovery helper",
    agent: "Backend Recovery + Release",
    merged: "2026-05-19",
    notes: "Added one command for owner Railway login, backend recovery, and recovery preflight verification.",
    productImpact: "The remaining owner action is now a clear terminal command instead of a scattered multi-step recovery sequence.",
  },
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
    request: "Recover the Railway backend so current Supabase EOD rows can reach dashboard, scanner, watchlist, full chart, and production smoke.",
  },
];

export const nextAgentActions = [
  "Run npm run recover:railway-backend:login after owner Railway activation is available.",
  "Run npm run check:data-recovery after Railway credentials are available.",
  "Run npm run test:e2e:prod:smoke after the API is restored.",
  "Use the manual Railway Backend Recovery workflow only after Railway GitHub secrets are configured.",
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
