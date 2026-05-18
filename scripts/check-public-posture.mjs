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
  /join beta/i,
  /beta waitlist/i,
  /launch surface/i,
  /market command center/i,
  /early access/i,
  /FOUNDER100/i,
  /founder plan/i,
  /founder code/i,
];

const pages = [
  {
    path: "/",
    mustInclude: [/Professional Access/i, /EOD market data/i, /Request access/i],
  },
  {
    path: "/login",
    mustInclude: [/Sign in to AlphaVyuh/i, /Professional Access/i, /Broker import only/i],
  },
  {
    path: "/access",
    mustInclude: [/Operate your EOD trading workflow/i, /Data and execution policy/i, /No live\/sandbox broker order placement/i],
  },
  {
    path: "/beta",
    finalPath: "/access",
    mustInclude: [/Operate your EOD trading workflow/i, /Professional Access/i],
  },
];

const staticFiles = [
  "frontend/lib/agentMissionControl.ts",
  "pitch/index.html",
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

  console.log(`Public posture ok at ${baseUrl}: Professional Access copy present, legacy beta posture absent.`);
} catch (error) {
  console.error(`Public posture check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
