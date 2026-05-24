#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflowPath = process.env.PRODUCTION_SIGNED_IN_SMOKE_WORKFLOW_PATH || ".github/workflows/production-signed-in-smoke.yml";

const requiredSnippets = [
  "Production Signed-In Smoke",
  "workflow_dispatch",
  "Install frontend dependencies",
  "npm --prefix frontend ci",
  "Install Playwright Chromium",
  "npm --prefix frontend exec playwright install --with-deps chromium",
  "Prepare production smoke account",
  "node scripts/prepare-production-smoke-account.mjs",
  "Validate full production smoke credentials",
  "npm run check:production-smoke-env",
  "Authenticated production API smoke",
  "npm run check:production-api",
  "Strict production data recovery preflight",
  "npm run check:data-recovery",
  'REQUIRE_AUTHENTICATED_SMOKE: "1"',
  "Strict signed-in production browser smoke",
  "PLAYWRIGHT_BASE_URL",
  'PLAYWRIGHT_EXPECT_REAL_DATA: "true"',
  "npm --prefix frontend exec -- playwright test",
  "frontend/tests/e2e/smoke-signed-in.spec.ts",
  "PLAYWRIGHT_QA_EMAIL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "VERCEL_TOKEN",
];

const forbiddenSnippets = [
  "Recover backend",
  "npm run recover:railway-backend",
  "RAILWAY_TOKEN",
  "railway deploy",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  assert(existsSync(workflowPath), `Production signed-in smoke workflow not found: ${workflowPath}`);
  const body = readFileSync(workflowPath, "utf8");

  for (const snippet of requiredSnippets) {
    assert(body.includes(snippet), `Production signed-in smoke workflow is missing: ${snippet}`);
  }

  for (const snippet of forbiddenSnippets) {
    assert(!body.includes(snippet), `Production signed-in smoke workflow must not deploy or recover backend: ${snippet}`);
  }

  const prepareAccountIndex = body.indexOf("Prepare production smoke account");
  const credentialIndex = body.indexOf("Validate full production smoke credentials");
  const apiSmokeIndex = body.indexOf("Authenticated production API smoke");
  const strictPreflightIndex = body.indexOf("Strict production data recovery preflight");
  const browserSmokeIndex = body.indexOf("Strict signed-in production browser smoke");
  assert(
    prepareAccountIndex < credentialIndex,
    "Production signed-in smoke workflow must prepare runtime smoke credentials before validating them.",
  );
  assert(
    credentialIndex < apiSmokeIndex,
    "Production signed-in smoke workflow must validate credentials before API smoke.",
  );
  assert(
    apiSmokeIndex < strictPreflightIndex,
    "Production signed-in smoke workflow must run authenticated API smoke before strict recovery preflight.",
  );
  assert(
    strictPreflightIndex < browserSmokeIndex,
    "Production signed-in smoke workflow must run signed-in browser smoke after strict data recovery preflight.",
  );

  console.log("Production signed-in smoke workflow ok: authenticated data and browser smoke are wired without deploy steps.");
} catch (error) {
  console.error(`Production signed-in smoke workflow check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
