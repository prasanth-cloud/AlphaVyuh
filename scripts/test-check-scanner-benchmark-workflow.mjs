#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(workflowPath) {
  const child = spawn(process.execPath, ["scripts/check-scanner-benchmark-workflow.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      SCANNER_BENCHMARK_WORKFLOW_PATH: workflowPath,
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

const root = mkdtempSync(join(tmpdir(), "alphavyuh-scanner-benchmark-workflow-"));
const clean = join(root, "clean.yml");
const staleWithDeploy = join(root, "stale-with-deploy.yml");
const staleWithoutArtifact = join(root, "stale-without-artifact.yml");

writeFileSync(clean, `
name: Production Scanner Benchmark
on:
  workflow_dispatch:
    inputs:
      production_api_url:
      run_label:
      runs:
      warmup_runs:
      min_query_reduction_pct:
      min_speedup:
      baseline_json:
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: 22
  - name: Run authenticated scanner benchmark
    env:
      PRODUCTION_API_URL: \${{ github.event.inputs.production_api_url }}
      PRODUCTION_API_BEARER_TOKEN: \${{ secrets.PRODUCTION_API_BEARER_TOKEN }}
      SCANNER_BENCHMARK_RUNS: \${{ github.event.inputs.runs }}
      SCANNER_BENCHMARK_WARMUP_RUNS: \${{ github.event.inputs.warmup_runs }}
      SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT: \${{ github.event.inputs.min_query_reduction_pct }}
      SCANNER_BENCHMARK_MIN_SPEEDUP: \${{ github.event.inputs.min_speedup }}
      SCANNER_BENCHMARK_BASELINE_JSON: \${{ github.event.inputs.baseline_json }}
      SCANNER_BENCHMARK_OUTPUT_JSON: /tmp/scanner-benchmark-\${{ github.run_id }}.json
    run: npm run check:scanner-benchmark
  - name: Upload benchmark JSON
    uses: actions/upload-artifact@v7
    with:
      path: /tmp/scanner-benchmark-\${{ github.run_id }}.json
      retention-days: 30
`);

writeFileSync(staleWithDeploy, `
name: Production Scanner Benchmark
on:
  workflow_dispatch:
    inputs:
      production_api_url:
      run_label:
      runs:
      warmup_runs:
      min_query_reduction_pct:
      min_speedup:
      baseline_json:
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: 22
  - name: Run authenticated scanner benchmark
    env:
      PRODUCTION_API_URL: \${{ github.event.inputs.production_api_url }}
      PRODUCTION_API_BEARER_TOKEN: \${{ secrets.PRODUCTION_API_BEARER_TOKEN }}
      VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
      SCANNER_BENCHMARK_RUNS: \${{ github.event.inputs.runs }}
      SCANNER_BENCHMARK_WARMUP_RUNS: \${{ github.event.inputs.warmup_runs }}
      SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT: \${{ github.event.inputs.min_query_reduction_pct }}
      SCANNER_BENCHMARK_MIN_SPEEDUP: \${{ github.event.inputs.min_speedup }}
      SCANNER_BENCHMARK_BASELINE_JSON: \${{ github.event.inputs.baseline_json }}
      SCANNER_BENCHMARK_OUTPUT_JSON: /tmp/scanner-benchmark-\${{ github.run_id }}.json
    run: npm run check:scanner-benchmark && vercel deploy --prod
  - name: Upload benchmark JSON
    uses: actions/upload-artifact@v7
    with:
      path: /tmp/scanner-benchmark-\${{ github.run_id }}.json
      retention-days: 30
`);

writeFileSync(staleWithoutArtifact, `
name: Production Scanner Benchmark
on:
  workflow_dispatch:
    inputs:
      production_api_url:
      run_label:
      runs:
      warmup_runs:
      min_query_reduction_pct:
      min_speedup:
      baseline_json:
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: 22
  - name: Run authenticated scanner benchmark
    env:
      PRODUCTION_API_URL: \${{ github.event.inputs.production_api_url }}
      PRODUCTION_API_BEARER_TOKEN: \${{ secrets.PRODUCTION_API_BEARER_TOKEN }}
      SCANNER_BENCHMARK_RUNS: \${{ github.event.inputs.runs }}
      SCANNER_BENCHMARK_WARMUP_RUNS: \${{ github.event.inputs.warmup_runs }}
      SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT: \${{ github.event.inputs.min_query_reduction_pct }}
      SCANNER_BENCHMARK_MIN_SPEEDUP: \${{ github.event.inputs.min_speedup }}
      SCANNER_BENCHMARK_BASELINE_JSON: \${{ github.event.inputs.baseline_json }}
      SCANNER_BENCHMARK_OUTPUT_JSON: /tmp/scanner-benchmark-\${{ github.run_id }}.json
    run: npm run check:scanner-benchmark
`);

{
  const { code, stdout, stderr } = await run(clean);
  assert.equal(code, 0, `scanner benchmark workflow check should pass:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Scanner benchmark workflow ok/);
}

{
  const { code, stderr } = await run(staleWithDeploy);
  assert.notEqual(code, 0, "scanner benchmark workflow check should fail when deploy credentials/actions are present");
  assert.match(stderr, /must not deploy|VERCEL_TOKEN|vercel deploy/);
}

{
  const { code, stderr } = await run(staleWithoutArtifact);
  assert.notEqual(code, 0, "scanner benchmark workflow check should fail without artifact upload");
  assert.match(stderr, /Upload benchmark JSON|actions\/upload-artifact/);
}

console.log("check-scanner-benchmark-workflow tests passed.");
