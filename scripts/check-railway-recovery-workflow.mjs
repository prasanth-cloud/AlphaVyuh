#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflowPath = process.env.RAILWAY_RECOVERY_WORKFLOW_PATH || ".github/workflows/railway-backend-recovery.yml";

const requiredSnippets = [
  "Validate full recovery smoke credentials",
  "npm run check:production-smoke-env",
  "Recover backend",
  "Strict production data recovery preflight",
  "npm run check:data-recovery",
  'REQUIRE_AUTHENTICATED_SMOKE: "1"',
  "PRODUCTION_API_BEARER_TOKEN",
  "PLAYWRIGHT_QA_EMAIL",
  "PLAYWRIGHT_QA_PASSWORD",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
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

  const credentialIndex = body.indexOf("Validate full recovery smoke credentials");
  const recoverIndex = body.indexOf("Recover backend");
  const strictPreflightIndex = body.indexOf("Strict production data recovery preflight");
  assert(
    credentialIndex < recoverIndex,
    "Railway recovery workflow must validate full smoke credentials before deploying the backend.",
  );
  assert(
    recoverIndex < strictPreflightIndex,
    "Railway recovery workflow must run strict data recovery preflight after backend recovery.",
  );

  console.log("Railway recovery workflow ok: strict smoke credentials and post-recovery preflight are wired.");
} catch (error) {
  console.error(`Railway recovery workflow check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
