#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflowPath = process.env.RAILWAY_RECOVERY_WORKFLOW_PATH || ".github/workflows/railway-backend-recovery.yml";

const requiredSnippets = [
  "if: github.ref == 'refs/heads/main'",
  "environment: production",
  "Install frontend dependencies",
  "npm --prefix frontend ci",
  "Install Railway CLI",
  "@railway/cli@4.66.1",
  "Install Vercel CLI",
  "vercel@54.7.1",
  "Install Playwright Chromium",
  "npm --prefix frontend exec playwright install --with-deps chromium",
  "Validate trusted production targets",
  "node scripts/validate-production-workflow-targets.mjs",
  "Prepare production smoke account",
  "node scripts/prepare-production-smoke-account.mjs",
  "Validate full recovery smoke credentials",
  "npm run check:production-smoke-env",
  "Recover backend",
  "Strict production data recovery preflight",
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
  "RAILWAY_PROJECT_ID: ${{ secrets.RAILWAY_PROJECT_ID }}",
  "RAILWAY_ENVIRONMENT: production",
  "RAILWAY_SERVICE: ${{ secrets.RAILWAY_SERVICE }}",
];

const forbiddenSnippets = [
  "@latest",
  "RAILWAY_PROJECT_ID: ${{ github.event.inputs",
  "RAILWAY_ENVIRONMENT: ${{ github.event.inputs",
  "RAILWAY_SERVICE: ${{ github.event.inputs",
  "RAILWAY_WORKSPACE: ${{ github.event.inputs",
  "PRODUCTION_API_URL: ${{ github.event.inputs.production_api_url }}",
  "PLAYWRIGHT_BASE_URL: ${{ github.event.inputs.live_url }}",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  assert(existsSync(workflowPath), `Railway recovery workflow not found: ${workflowPath}`);
  const body = readFileSync(workflowPath, "utf8");

  for (const snippet of requiredSnippets) {
    assert(body.includes(snippet), `Railway recovery workflow is missing: ${snippet}`);
  }
  for (const snippet of forbiddenSnippets) {
    assert(!body.includes(snippet), `Railway recovery workflow must not use unsafe production dispatch inputs: ${snippet}`);
  }

  const targetValidationIndex = body.indexOf("Validate trusted production targets");
  const prepareAccountIndex = body.indexOf("Prepare production smoke account");
  const credentialIndex = body.indexOf("Validate full recovery smoke credentials");
  const recoverIndex = body.indexOf("Recover backend");
  const strictPreflightIndex = body.indexOf("Strict production data recovery preflight");
  const browserSmokeIndex = body.indexOf("Strict signed-in production browser smoke");
  assert(
    targetValidationIndex < prepareAccountIndex,
    "Railway recovery workflow must validate production targets before preparing credentials.",
  );
  assert(
    prepareAccountIndex < credentialIndex,
    "Railway recovery workflow must prepare runtime smoke credentials before validating them.",
  );
  assert(
    credentialIndex < recoverIndex,
    "Railway recovery workflow must validate full smoke credentials before deploying the backend.",
  );
  assert(
    recoverIndex < strictPreflightIndex,
    "Railway recovery workflow must run strict data recovery preflight after backend recovery.",
  );
  assert(
    strictPreflightIndex < browserSmokeIndex,
    "Railway recovery workflow must run signed-in browser smoke after strict data recovery preflight.",
  );

  console.log("Railway recovery workflow ok: strict smoke credentials, post-recovery preflight, and signed-in browser smoke are wired.");
} catch (error) {
  console.error(`Railway recovery workflow check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
