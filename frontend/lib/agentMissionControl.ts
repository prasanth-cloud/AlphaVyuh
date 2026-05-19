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
    currentWork: "Runs platform-quality cleanup through issue -> agent roster -> PR -> validation loops; latest loop shipped PRs #190-#194.",
    ownerFiles: "GitHub issues, PR notes, docs/agent-runs",
    lastUpdate: "PR #194 merged",
  },
  {
    id: "feature",
    name: "Feature",
    scope: "Trader-facing workflows",
    autonomy: "Level 2",
    status: "watching",
    currentWork: "Keeps visible product copy, active planning docs, and authenticated-flow labels on mature trading-platform language while data recovery stays focused on Railway hosting.",
    ownerFiles: "frontend/app/(app), frontend/lib/api.ts, feature routers",
    lastUpdate: "PRs #184-#185 copy guards merged",
  },
  {
    id: "data",
    name: "Data",
    scope: "Ingest, snapshots, indicators, alert parity",
    autonomy: "Level 3",
    status: "blocked",
    currentWork: "Supabase EOD rows are fresh for 2026-05-19; production visibility is blocked because the Railway backend returns fallback 404.",
    ownerFiles: "backend/app/services, backend/scripts, supabase/migrations",
    lastUpdate: "check:data-recovery failing at Railway; strict workflow proof wired in PR #194",
  },
  {
    id: "qa",
    name: "QA",
    scope: "Workflow regression and launch safety",
    autonomy: "Level 3",
    status: "watching",
    currentWork: "Protects account-access copy, recovery handoff credentials, Railway workflow proof, data-recovery checks, checker self-tests, signed-in smoke, auth, scanner, watchlist, chart, journal, layout, perf, and agent PR gates.",
    ownerFiles: "frontend/tests/e2e, backend/tests, QA reports",
    lastUpdate: "PR #194 strict Railway recovery workflow guard merged",
  },
  {
    id: "security",
    name: "Security",
    scope: "Auth, Supabase access, broker/payment gates",
    autonomy: "Level 3",
    status: "watching",
    currentWork: "Keeps broker execution disabled, payment enablement gated, recovery commands free of credential output, and full recovery evidence separated from public-only API recovery.",
    ownerFiles: "supabase/migrations, backend/tests, security docs",
    lastUpdate: "No broker or billing enablement in PRs #190-#194",
  },
  {
    id: "deploy",
    name: "Deploy",
    scope: "Vercel, domains, env, release checks",
    autonomy: "Level 3",
    status: "blocked",
    currentWork: "Vercel is serving the frontend, launch gates and Railway recovery workflow verification are stricter, but backend recovery still needs owner-provided Railway credentials or a refreshed local login.",
    ownerFiles: "Vercel, GitHub Actions, deploy docs",
    lastUpdate: "PR #194 strict workflow preflight merged; Railway still blocked",
  },
];

export const shippedAgentPrs: ShippedAgentPr[] = [
  {
    pr: "#194",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/194",
    title: "Verify strict Railway recovery",
    agent: "Deploy + QA + Data",
    merged: "2026-05-19",
    notes: "Made the Railway Backend Recovery workflow install Vercel CLI and run strict `REQUIRE_AUTHENTICATED_SMOKE=1 npm run check:data-recovery` after backend recovery.",
    productImpact: "A successful recovery workflow now has to prove production API, Vercel env, Supabase EOD, chart smoke, and authenticated scanner evidence after deploy.",
  },
  {
    pr: "#193",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/193",
    title: "Prepare recovery smoke secrets",
    agent: "Deploy + QA + Data",
    merged: "2026-05-19",
    notes: "Added production smoke API and QA login secrets to recovery secret preparation and separated deploy secrets from evidence secrets in recovery output.",
    productImpact: "The GitHub recovery path can prepare the credentials needed for full app evidence instead of only restoring the backend host.",
  },
  {
    pr: "#192",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/192",
    title: "Tighten recovery handoff guard",
    agent: "QA + Release",
    merged: "2026-05-19",
    notes: "Changed recovery handoff checking from file-level matching to per-command occurrence checks and replaced vague QA-login wording with exact env names.",
    productImpact: "Every active recovery command now has to stand on its own with the API token and QA login env names beside it.",
  },
  {
    pr: "#191",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/191",
    title: "Guard recovery handoff credentials",
    agent: "Manager + Deploy + QA",
    merged: "2026-05-19",
    notes: "Updated active handoffs with the full production smoke credential set and added `npm run check:recovery-handoff-credentials` to launch readiness.",
    productImpact: "Future recovery attempts cannot quietly omit the signed-in smoke credentials needed to prove full recovery.",
  },
  {
    pr: "#190",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/190",
    title: "Guard signed-in copy posture",
    agent: "Manager + Product Copy + QA",
    merged: "2026-05-19",
    notes: "Refreshed Mission Control through PR #189 and added a signed-in copy posture checker for active operator sources.",
    productImpact: "Operator-only surfaces now stay aligned with the account-access posture instead of drifting behind public copy guards.",
  },
  {
    pr: "#189",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/189",
    title: "Require production smoke credentials",
    agent: "QA + Release + Security",
    merged: "2026-05-19",
    notes: "Made the full production recovery smoke require explicit API token and QA login values, and replaced checked-in signed-in smoke defaults with mock-only credentials.",
    productImpact: "Post-recovery evidence now needs deliberate production credentials instead of silently trying stale or real-looking test values.",
  },
  {
    pr: "#188",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/188",
    title: "Refresh agent recovery handoffs",
    agent: "Manager + Release",
    merged: "2026-05-19",
    notes: "Updated active agent handoffs so recovery work requires strict data evidence and signed-in smoke rather than public API checks alone.",
    productImpact: "Every lane now points at the same Railway recovery proof before launch can be called ready.",
  },
  {
    pr: "#187",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/187",
    title: "Refresh mission control latest gates",
    agent: "Manager + QA",
    merged: "2026-05-19",
    notes: "Aligned the `/agents` operator view with the stricter account-access gates shipped through PR #186.",
    productImpact: "Mission Control stayed useful as the live source of truth for cleanup, recovery, and blocker ownership.",
  },
  {
    pr: "#186",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/186",
    title: "Run checker tests in launch gate",
    agent: "Release + QA",
    merged: "2026-05-19",
    notes: "Wired production API, public posture, data recovery, and Railway secret-prep checker tests into `npm run launch:check`.",
    productImpact: "The launch gate now exercises the same guard logic that protects account-access copy and production recovery evidence.",
  },
  {
    pr: "#185",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/185",
    title: "Simplify signed-in copy",
    agent: "Product Copy + QA",
    merged: "2026-05-19",
    notes: "Replaced remaining broad app framing with account, desk, chart-review, and execution-planning language; expanded posture scanning to AppShell, watchlist, and full chart.",
    productImpact: "Authenticated product surfaces now read more like a focused trading desk and less like a generic app shell.",
  },
  {
    pr: "#184",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/184",
    title: "Guard access checklist copy",
    agent: "Product Copy + Release Guard",
    merged: "2026-05-19",
    notes: "Cleaned the active account-access launch checklist and added posture guards for old broker-era and provider-trial wording.",
    productImpact: "Active operator checklists can no longer quietly reintroduce old tester-program framing before a launch batch.",
  },
  {
    pr: "#183",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/183",
    title: "Require full recovery evidence",
    agent: "Release + QA/Data Trust",
    merged: "2026-05-19",
    notes: "Split public API recovery from full app recovery and made `RUN_PRODUCTION_RECOVERY_SMOKE=1` require authenticated scanner/watchlist API evidence before signed-in browser smoke.",
    productImpact: "Operators cannot declare production recovered from public API checks alone; dashboard, scanner, watchlist, and chart evidence remain required.",
  },
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
    productImpact: "Release verification is less brittle, which keeps platform-quality cleanup moving without hiding backend regressions.",
  },
  {
    pr: "#176",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/176",
    title: "Refresh mission control recovery status",
    agent: "Manager + QA",
    merged: "2026-05-19",
    notes: "Aligned the `/agents` operator view with the current recovery cycle and Railway blocker.",
    productImpact: "The owner can see which agent lane owns recovery, QA, release, and blocker follow-up without reading chat history.",
  },
  {
    pr: "#175",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/175",
    title: "Add production smoke entrypoint",
    agent: "QA + Frontend + Release",
    merged: "2026-05-19",
    notes: "Added repeatable signed-in and production browser smoke commands for dashboard, scanner, watchlist, full chart, journal, settings, broker, and data status.",
    productImpact: "After Railway recovery, operators can prove the full signed-in workflow shows real data with one command instead of a manual checklist.",
  },
  {
    pr: "#174",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/174",
    title: "Align growth plan with account access",
    agent: "Product + QA + Release",
    merged: "2026-05-19",
    notes: "Replaced the active old launch plan with an account-access growth plan and hardened data-recovery checker tests.",
    productImpact: "Future agent work now inherits mature platform positioning and deterministic recovery checks instead of old tester-program framing.",
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
    title: "Polish access and recovery",
    agent: "Product + Frontend + QA",
    merged: "2026-05-18",
    notes: "Public and app copy presented AlphaVyuh with clear EOD data and broker-import posture.",
    productImpact: "Trader-facing pages sound like a serious product while still being honest about EOD data and disabled execution.",
  },
  {
    pr: "#99",
    href: "https://github.com/prasanth-cloud/AlphaVyuh/pull/99",
    title: "Tighten chart controls",
    agent: "Chart + Frontend + QA",
    merged: "2026-05-12",
    notes: "Full Chart controls moved toward compact Tools and indicator dropdown patterns.",
    productImpact: "The chart surface is less cluttered and closer to the focused TradingView-style experience users expect.",
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
