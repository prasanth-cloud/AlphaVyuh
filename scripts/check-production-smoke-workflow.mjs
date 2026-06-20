#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflowPath = process.env.PRODUCTION_SMOKE_WORKFLOW_PATH || ".github/workflows/production-signed-in-smoke.yml";

const requiredSnippets = [
  "name: Production Signed-In Smoke",
  "workflow_dispatch:",
  "production_api_url:",
  "production_api_chart_symbols:",
  "live_url:",
  "uses: actions/checkout@v6",
  "uses: actions/setup-node@v6",
  "node-version: 22",
  "Install frontend dependencies",
  "npm --prefix frontend ci",
  "Install Vercel CLI",
  "vercel@54.7.1",
  "Install Playwright Chromium",
  "npm --prefix frontend exec playwright install --with-deps chromium",
  "Validate trusted production targets",
  "node scripts/validate-production-workflow-targets.mjs",
  "Prepare production smoke account",
  "node scripts/prepare-production-smoke-account.mjs",
  "Validate full production smoke credentials",
  "npm run check:production-smoke-env",
  "Strict authenticated production data preflight",
  "npm run check:data-recovery",
  'REQUIRE_AUTHENTICATED_SMOKE: "1"',
  "Strict signed-in production browser smoke",
  "LIVE_URL_INPUT",
  'REQUIRE_LIVE_URL: "1"',
  'PLAYWRIGHT_EXPECT_REAL_DATA: "true"',
  "npm --prefix frontend exec -- playwright test",
  "frontend/tests/e2e/smoke-signed-in.spec.ts",
  "PLAYWRIGHT_QA_EMAIL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  'PLAYWRIGHT_QA_EMAIL_UNIQUE_PER_RUN: "1"',
  "VERCEL_TOKEN",
];

const forbiddenSnippets = [
  "Recover backend",
  "recover:railway-backend",
  "RAILWAY_TOKEN",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE",
  "@railway/cli",
  "@latest",
  "PLAYWRIGHT_BASE_URL: ${{ github.event.inputs.live_url }}",
  "PRODUCTION_API_URL: ${{ github.event.inputs.production_api_url }}",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  assert(existsSync(workflowPath), `Production smoke workflow not found: ${workflowPath}`);
  const body = readFileSync(workflowPath, "utf8");

  for (const snippet of requiredSnippets) {
    assert(body.includes(snippet), `Production smoke workflow is missing: ${snippet}`);
  }

  for (const snippet of forbiddenSnippets) {
    assert(!body.includes(snippet), `Production smoke workflow must not deploy or require Railway recovery: ${snippet}`);
  }

  const prepareAccountIndex = body.indexOf("Prepare production smoke account");
  const targetValidationIndex = body.indexOf("Validate trusted production targets");
  const credentialIndex = body.indexOf("Validate full production smoke credentials");
  const strictPreflightIndex = body.indexOf("Strict authenticated production data preflight");
  const browserSmokeIndex = body.indexOf("Strict signed-in production browser smoke");
  assert(
    targetValidationIndex < prepareAccountIndex,
    "Production smoke workflow must validate production targets before preparing credentials.",
  );
  assert(
    prepareAccountIndex < credentialIndex,
    "Production smoke workflow must prepare runtime smoke credentials before validating them.",
  );
  assert(
    credentialIndex < strictPreflightIndex,
    "Production smoke workflow must validate credentials before strict authenticated data preflight.",
  );
  assert(
    strictPreflightIndex < browserSmokeIndex,
    "Production smoke workflow must run signed-in browser smoke after strict authenticated data preflight.",
  );

  console.log("Production smoke workflow ok: non-deploy authenticated data and signed-in browser smoke are wired.");
} catch (error) {
  console.error(`Production smoke workflow check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
