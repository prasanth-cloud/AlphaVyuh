#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

function normalizeBaseUrl(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/\/+$/, "");
}

const baseUrl = normalizeBaseUrl(process.env.PUBLIC_SITE_URL || process.env.LIVE_URL);

if (!baseUrl) {
  console.log("Skipping public posture check: set PUBLIC_SITE_URL or LIVE_URL.");
  process.exit(0);
}

const forbidden = [
  /private beta/i,
  /founder beta/i,
  /market beta/i,
  /beta access/i,
  /beta broker/i,
  /broker beta/i,
  /join beta/i,
  /beta waitlist/i,
  /live-beta/i,
  /beta wording/i,
  /launch surface/i,
  /market command center/i,
  /early access/i,
  /FOUNDER100/i,
  /founder plan/i,
  /founder code/i,
  /\bprofessional\b/i,
  /Professional Access workspace/i,
  /free workspace/i,
  /Full chart workspace/i,
  /Professional chart workspace/i,
  /analysis workspace/i,
  /execution workspace/i,
  /visual workspace/i,
  /AlphaVyuh workspace/i,
  /Workspace access/i,
  /This workspace is not available/i,
];

const pages = [
  {
    path: "/",
    mustInclude: [/Account access/i, /EOD market data/i, /Get started/i],
  },
  {
    path: "/login",
    mustInclude: [/<h1[^>]*>\s*Sign in\s*<\/h1>|\bSign in\b/i, /EOD market data/i, /Broker import only/i],
  },
  {
    path: "/access",
    mustInclude: [/Operate your EOD trading workflow/i, /Data and execution policy/i, /No live\/sandbox broker order placement/i],
  },
  {
    path: "/beta",
    finalPath: "/access",
    mustInclude: [/Operate your EOD trading workflow/i, /Account Access/i],
  },
];

const staticFiles = [
  "frontend/lib/agentMissionControl.ts",
  "frontend/app/page.tsx",
  "frontend/app/access/page.tsx",
  "frontend/app/not-found.tsx",
  "frontend/components/auth/LoginForm.tsx",
  "frontend/components/auth/SignupForm.tsx",
  "frontend/components/AppShell.tsx",
  "frontend/app/(app)/watchlist/page.tsx",
  "frontend/app/(app)/charts/[symbol]/page.tsx",
  "supabase/templates/magic-link.html",
  "supabase/templates/confirmation.html",
  "supabase/templates/invite.html",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function snippet(text, index) {
  return text.slice(Math.max(0, index - 80), Math.min(text.length, index + 120)).replace(/\s+/g, " ");
}

function assertNoForbiddenCopy(label, body) {
  for (const pattern of forbidden) {
    const match = body.match(pattern);
    if (match?.index !== undefined) {
      throw new Error(`${label} contains forbidden public posture copy ${pattern}: ${snippet(body, match.index)}`);
    }
  }
}

async function fetchPage(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    headers: {
      "user-agent": "AlphaVyuhLaunchCheck/1.0",
    },
  });
  const body = await response.text();
  assert(response.ok, `${path} returned ${response.status}`);
  return { response, body };
}

try {
  for (const page of pages) {
    const { response, body } = await fetchPage(page.path);

    if (page.finalPath) {
      const finalUrl = new URL(response.url);
      assert(
        finalUrl.pathname === page.finalPath,
        `${page.path} should resolve to ${page.finalPath}, got ${finalUrl.pathname}`,
      );
    }

    for (const pattern of page.mustInclude) {
      assert(pattern.test(body), `${page.path} did not include expected copy: ${pattern}`);
    }

    assertNoForbiddenCopy(page.path, body);
  }

  for (const file of staticFiles) {
    if (!existsSync(file)) continue;
    assertNoForbiddenCopy(file, readFileSync(file, "utf8"));
  }

  console.log(`Public posture ok at ${baseUrl}: account-access copy present, legacy beta/professional-brand posture absent.`);
} catch (error) {
  console.error(`Public posture check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
