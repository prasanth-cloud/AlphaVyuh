#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflowPath = process.env.RAILWAY_RECOVERY_WORKFLOW_PATH || ".github/workflows/railway-backend-recovery.yml";

const requiredSnippets = [
  "Install frontend dependencies",
  "npm --prefix frontend ci",
  "Install Playwright Chromium",
  "npm --prefix frontend exec playwright install --with-deps chromium",
  "Prepare production smoke account",
  "node scripts/prepare-production-smoke-account.mjs",
  "Validate full recovery smoke credentials",
  "npm run check:production-smoke-env",
  "Recover backend",
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
  'PLAYWRIGHT_QA_EMAIL_UNIQUE_PER_RUN: "1"',
  "VERCEL_TOKEN",
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

  const prepareAccountIndex = body.indexOf("Prepare production smoke account");
  const credentialIndex = body.indexOf("Validate full recovery smoke credentials");
  const recoverIndex = body.indexOf("Recover backend");
  const strictPreflightIndex = body.indexOf("Strict production data recovery preflight");
  const browserSmokeIndex = body.indexOf("Strict signed-in production browser smoke");
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
