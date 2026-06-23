#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(workflowPath) {
  const child = spawn(process.execPath, ["scripts/check-daily-refresh-workflow-safety.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      DAILY_REFRESH_WORKFLOW_PATH: workflowPath,
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

const root = mkdtempSync(join(tmpdir(), "alphavyuh-daily-refresh-workflow-safety-"));
const safe = join(root, "safe.yml");
const unsafe = join(root, "unsafe.yml");

writeFileSync(safe, `
name: Daily NSE data refresh
on:
  workflow_dispatch:
    inputs:
      date:
        required: false
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Run daily refresh
        env:
          INPUT_DATE: \${{ github.event.inputs.date || '' }}
          INPUT_YFINANCE_ONLY: \${{ github.event.inputs.yfinance_only || 'false' }}
          INPUT_DRY_RUN: \${{ github.event.inputs.dry_run || 'false' }}
        run: |
          if [ -n "$INPUT_DATE" ] && [[ ! "$INPUT_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
            exit 64
          fi
          ARGS=(--yfinance-limit "\${YFINANCE_LIMIT:-60}" --yfinance-time-budget-s "\${YFINANCE_TIME_BUDGET_S:-180}")
          python scripts/daily_refresh.py "\${ARGS[@]}"
`);

writeFileSync(unsafe, `
name: Daily NSE data refresh
on:
  workflow_dispatch:
    inputs:
      date:
        required: false
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Run daily refresh
        run: |
          python scripts/daily_refresh.py --date "\${{ github.event.inputs.date }}"
`);

{
  const { code, stdout, stderr } = await run(safe);
  assert.equal(code, 0, `safe workflow should pass\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Daily refresh workflow safety ok/);
}

{
  const { code, stderr } = await run(unsafe);
  assert.notEqual(code, 0, "unsafe workflow should fail");
  assert.match(stderr, /must be bridged through env/);
}

console.log("check-daily-refresh-workflow-safety tests passed.");
