#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(workflowPath) {
  const child = spawn(process.execPath, ["scripts/check-production-smoke-workflow.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      PRODUCTION_SMOKE_WORKFLOW_PATH: workflowPath,
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

const root = mkdtempSync(join(tmpdir(), "alphavyuh-production-smoke-workflow-"));
const clean = join(root, "clean.yml");
const staleWithDeploy = join(root, "stale-with-deploy.yml");
const staleWithoutBrowserSmoke = join(root, "stale-without-browser-smoke.yml");

writeFileSync(clean, `
name: Production Signed-In Smoke
on:
  workflow_dispatch:
    inputs:
      production_api_url:
      production_api_chart_symbols:
      live_url:
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: 22
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
  - name: Strict authenticated production data preflight
    env:
      VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
      SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      REQUIRE_AUTHENTICATED_SMOKE: "1"
      PRODUCTION_API_BEARER_TOKEN: from-github-env
      PLAYWRIGHT_QA_PASSWORD: from-github-env
      PLAYWRIGHT_SUPABASE_AUTH_COOKIES: from-github-env
    run: npm run check:data-recovery
  - name: Strict signed-in production browser smoke
    env:
      PLAYWRIGHT_BASE_URL: \${{ github.event.inputs.live_url }}
      PLAYWRIGHT_EXPECT_REAL_DATA: "true"
    run: npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/smoke-signed-in.spec.ts
`);

writeFileSync(staleWithDeploy, `
name: Production Signed-In Smoke
on:
  workflow_dispatch:
    inputs:
      production_api_url:
      production_api_chart_symbols:
      live_url:
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: 22
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
    env:
      RAILWAY_TOKEN: \${{ secrets.RAILWAY_TOKEN }}
    run: npm run recover:railway-backend
  - name: Strict authenticated production data preflight
    env:
      VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
      SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      REQUIRE_AUTHENTICATED_SMOKE: "1"
      PRODUCTION_API_BEARER_TOKEN: from-github-env
      PLAYWRIGHT_QA_PASSWORD: from-github-env
      PLAYWRIGHT_SUPABASE_AUTH_COOKIES: from-github-env
    run: npm run check:data-recovery
  - name: Strict signed-in production browser smoke
    env:
      PLAYWRIGHT_BASE_URL: \${{ github.event.inputs.live_url }}
      PLAYWRIGHT_EXPECT_REAL_DATA: "true"
    run: npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/smoke-signed-in.spec.ts
`);

writeFileSync(staleWithoutBrowserSmoke, `
name: Production Signed-In Smoke
on:
  workflow_dispatch:
    inputs:
      production_api_url:
      production_api_chart_symbols:
      live_url:
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: 22
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
  - name: Strict authenticated production data preflight
    env:
      VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
      SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      REQUIRE_AUTHENTICATED_SMOKE: "1"
      PRODUCTION_API_BEARER_TOKEN: from-github-env
      PLAYWRIGHT_QA_PASSWORD: from-github-env
      PLAYWRIGHT_SUPABASE_AUTH_COOKIES: from-github-env
    run: npm run check:data-recovery
`);

{
  const { code, stdout, stderr } = await run(clean);
  assert.equal(code, 0, `production smoke workflow check should pass on non-deploy workflow:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Production smoke workflow ok/);
}

{
  const { code, stderr } = await run(staleWithDeploy);
  assert.notEqual(code, 0, "production smoke workflow check should fail when a deploy/recovery step is present");
  assert.match(stderr, /must not deploy|Recover backend|RAILWAY_TOKEN|recover:railway-backend/);
}

{
  const { code, stderr } = await run(staleWithoutBrowserSmoke);
  assert.notEqual(code, 0, "production smoke workflow check should fail when signed-in browser smoke is missing");
  assert.match(stderr, /Strict signed-in production browser smoke|PLAYWRIGHT_EXPECT_REAL_DATA|smoke-signed-in\.spec\.ts/);
}

console.log("check-production-smoke-workflow tests passed.");
