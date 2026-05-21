#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(workflowPath) {
  const child = spawn(process.execPath, ["scripts/check-railway-recovery-workflow.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      RAILWAY_RECOVERY_WORKFLOW_PATH: workflowPath,
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

const root = mkdtempSync(join(tmpdir(), "alphavyuh-railway-workflow-"));
const clean = join(root, "clean.yml");
const stale = join(root, "stale.yml");

writeFileSync(clean, `
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
  - name: Validate full recovery smoke credentials
    run: npm run check:production-smoke-env
  - name: Recover backend
    run: npm run recover:railway-backend
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
steps:
  - name: Install frontend dependencies
    run: npm --prefix frontend ci
  - name: Install Playwright Chromium
    run: npm --prefix frontend exec playwright install --with-deps chromium
  - name: Recover backend
    run: npm run recover:railway-backend
  - name: Strict production data recovery preflight
    env:
      REQUIRE_AUTHENTICATED_SMOKE: "1"
    run: npm run check:data-recovery
  - name: Strict signed-in production browser smoke
    env:
      PLAYWRIGHT_BASE_URL: \${{ github.event.inputs.live_url }}
      PLAYWRIGHT_EXPECT_REAL_DATA: "true"
      PLAYWRIGHT_QA_EMAIL: \${{ secrets.PLAYWRIGHT_QA_EMAIL }}
      PLAYWRIGHT_QA_PASSWORD: \${{ secrets.PLAYWRIGHT_QA_PASSWORD }}
    run: npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/smoke-signed-in.spec.ts
`);

{
  const { code, stdout, stderr } = await run(clean);
  assert.equal(code, 0, `workflow check should pass on strict workflow:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Railway recovery workflow ok/);
}

{
  const { code, stderr } = await run(stale);
  assert.notEqual(code, 0, "workflow check should fail when smoke credential validation is missing");
  assert.match(stderr, /Prepare production smoke account|Validate full recovery smoke credentials|check:production-smoke-env/);
}

{
  const staleWithoutBrowserSmoke = join(root, "stale-without-browser-smoke.yml");
  writeFileSync(staleWithoutBrowserSmoke, `
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
    run: node scripts/prepare-production-smoke-account.mjs
  - name: Validate full recovery smoke credentials
    run: npm run check:production-smoke-env
  - name: Recover backend
    run: npm run recover:railway-backend
  - name: Strict production data recovery preflight
    env:
      VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
      SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      REQUIRE_AUTHENTICATED_SMOKE: "1"
    run: npm run check:data-recovery
`);
  const { code, stderr } = await run(staleWithoutBrowserSmoke);
  assert.notEqual(code, 0, "workflow check should fail when signed-in browser smoke is missing");
  assert.match(stderr, /Strict signed-in production browser smoke|PLAYWRIGHT_EXPECT_REAL_DATA|smoke-signed-in\.spec\.ts/);
}

console.log("check-railway-recovery-workflow tests passed.");
