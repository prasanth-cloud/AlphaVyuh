#!/usr/bin/env node
import { strict as assert } from "node:assert";
import { resolveProductionSmokeQaEmail } from "./production-smoke-account-identity.mjs";

{
  const email = resolveProductionSmokeQaEmail("QA.SMOKE@AlphaVyuh.Local", {});
  assert.equal(email, "qa.smoke@alphavyuh.local");
}

{
  const email = resolveProductionSmokeQaEmail("qa.smoke@alphavyuh.local", {
    GITHUB_ACTIONS: "true",
    GITHUB_WORKFLOW: "Production Scanner Benchmark",
    GITHUB_RUN_ID: "26859239906",
    GITHUB_RUN_ATTEMPT: "1",
  });
  assert.equal(email, "qa.smoke+production-scanner-benchmark-26859239906-1@alphavyuh.local");
}

{
  const smokeEmail = resolveProductionSmokeQaEmail("qa.smoke@example.com", {
    GITHUB_ACTIONS: "true",
    GITHUB_WORKFLOW: "Production Signed-In Smoke",
    GITHUB_RUN_ID: "26859235370",
    GITHUB_RUN_ATTEMPT: "1",
  });
  const benchmarkEmail = resolveProductionSmokeQaEmail("qa.smoke@example.com", {
    GITHUB_ACTIONS: "true",
    GITHUB_WORKFLOW: "Production Scanner Benchmark",
    GITHUB_RUN_ID: "26859239906",
    GITHUB_RUN_ATTEMPT: "1",
  });
  assert.notEqual(smokeEmail, benchmarkEmail);
  assert.equal(smokeEmail, "qa.smoke+production-signed-in-smoke-26859235370-1@example.com");
  assert.equal(benchmarkEmail, "qa.smoke+production-scanner-benchmark-26859239906-1@example.com");
}

{
  const email = resolveProductionSmokeQaEmail("qa.shared@example.com", {
    GITHUB_ACTIONS: "true",
    PLAYWRIGHT_QA_EMAIL_UNIQUE_PER_RUN: "0",
    GITHUB_WORKFLOW: "Production Scanner Benchmark",
    GITHUB_RUN_ID: "26859239906",
    GITHUB_RUN_ATTEMPT: "1",
  });
  assert.equal(email, "qa.shared@example.com");
}

{
  const email = resolveProductionSmokeQaEmail("qa.smoke+old-tag@example.com", {
    PLAYWRIGHT_QA_EMAIL_UNIQUE_PER_RUN: "1",
    GITHUB_WORKFLOW: "Railway Backend Recovery",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2",
  });
  assert.equal(email, "qa.smoke+railway-backend-recovery-123-2@example.com");
}

console.log("production smoke account identity tests passed.");
