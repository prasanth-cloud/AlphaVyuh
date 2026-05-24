#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(workflowPath) {
  const child = spawn(process.execPath, ["scripts/check-production-signed-in-smoke-workflow.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      PRODUCTION_SIGNED_IN_SMOKE_WORKFLOW_PATH: workflowPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");
  return { code, stdout, stderr };
}

const root = mkdtempSync(join(tmpdir(), "alphavyuh-prod-smoke-workflow-"));
const clean = join(root, "clean.yml");
const stale = join(root, "stale.yml");
const deploying = join(root, "deploying.yml");

writeFileSync(clean, `
name: Production Signed-In Smoke
on:
  workflow_dispatch:
steps:
  - name: Install frontend dependencies
    run: npm --prefix frontend ci
  - name: Install Playwright Chromium
    run: npm --prefix frontend exec playwright install --with-deps chromium
  - name: Prepare production smoke account
    env:
      SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: \${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
      PLAYWRIGHT_QA_EMAIL: \${{ secrets.PLAYWRIGHT_QA_EMAIL }}
    run: node scripts/prepare-production-smoke-account.mjs
  - name: Validate full production smoke credentials
    run: npm run check:production-smoke-env
  - name: Authenticated production API smoke
    run: npm run check:production-api
  - name: Strict production data recovery preflight
    env:
      VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
      SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      REQUIRE_AUTHENTICATED_SMOKE: "1"
    run: npm run check:data-recovery
  - name: Strict signed-in production browser smoke
    env:
      PLAYWRIGHT_BASE_URL: \${{ github.event.inputs.live_url }}
      PLAYWRIGHT_EXPECT_REAL_DATA: "true"
    run: npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/smoke-signed-in.spec.ts
`);

writeFileSync(stale, `
name: Production Signed-In Smoke
on:
  workflow_dispatch:
steps:
  - name: Install frontend dependencies
    run: npm --prefix frontend ci
  - name: Install Playwright Chromium
    run: npm --prefix frontend exec playwright install --with-deps chromium
  - name: Authenticated production API smoke
    run: npm run check:production-api
  - name: Strict signed-in production browser smoke
    env:
      PLAYWRIGHT_BASE_URL: \${{ github.event.inputs.live_url }}
      PLAYWRIGHT_EXPECT_REAL_DATA: "true"
    run: npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/smoke-signed-in.spec.ts
`);

writeFileSync(deploying, `
name: Production Signed-In Smoke
on:
  workflow_dispatch:
steps:
  - name: Install frontend dependencies
    run: npm --prefix frontend ci
  - name: Install Playwright Chromium
    run: npm --prefix frontend exec playwright install --with-deps chromium
  - name: Prepare production smoke account
    env:
      SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: \${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
      PLAYWRIGHT_QA_EMAIL: \${{ secrets.PLAYWRIGHT_QA_EMAIL }}
    run: node scripts/prepare-production-smoke-account.mjs
  - name: Validate full production smoke credentials
    run: npm run check:production-smoke-env
  - name: Recover backend
    run: npm run recover:railway-backend
  - name: Authenticated production API smoke
    run: npm run check:production-api
  - name: Strict production data recovery preflight
    env:
      VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
      SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      REQUIRE_AUTHENTICATED_SMOKE: "1"
    run: npm run check:data-recovery
  - name: Strict signed-in production browser smoke
    env:
      PLAYWRIGHT_BASE_URL: \${{ github.event.inputs.live_url }}
      PLAYWRIGHT_EXPECT_REAL_DATA: "true"
    run: npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/smoke-signed-in.spec.ts
`);

{
  const { code, stdout, stderr } = await run(clean);
  assert.equal(code, 0, `workflow check should pass on strict non-deploy workflow:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Production signed-in smoke workflow ok/);
}

{
  const { code, stderr } = await run(stale);
  assert.notEqual(code, 0, "workflow check should fail when credential prep and strict recovery preflight are missing");
  assert.match(stderr, /Prepare production smoke account|Validate full production smoke credentials|Strict production data recovery preflight/);
}

{
  const { code, stderr } = await run(deploying);
  assert.notEqual(code, 0, "workflow check should fail when deploy or recovery steps are present");
  assert.match(stderr, /must not deploy or recover backend/);
}

console.log("check-production-signed-in-smoke-workflow tests passed.");
