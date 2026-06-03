#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflowPath = process.env.SCANNER_BENCHMARK_WORKFLOW_PATH || ".github/workflows/production-scanner-benchmark.yml";

const requiredSnippets = [
  "name: Production Scanner Benchmark",
  "workflow_dispatch:",
  "production_api_url:",
  "run_label:",
  "runs:",
  "warmup_runs:",
  "min_query_reduction_pct:",
  "min_speedup:",
  "baseline_json:",
  "uses: actions/checkout@v6",
  "uses: actions/setup-node@v6",
  "node-version: 22",
  "cache-dependency-path: frontend/package-lock.json",
  "Install frontend dependencies",
  "npm --prefix frontend ci",
  "Validate trusted production target",
  "node scripts/validate-production-workflow-targets.mjs",
  "Prepare production benchmark account",
  "SUPABASE_URL: ${{ secrets.SUPABASE_URL }}",
  "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}",
  'PLAYWRIGHT_QA_EMAIL_UNIQUE_PER_RUN: "1"',
  "node scripts/prepare-production-smoke-account.mjs",
  "Validate production benchmark credentials",
  "npm run check:production-smoke-env",
  "Run authenticated scanner benchmark",
  "PRODUCTION_API_URL_INPUT",
  "SCANNER_BENCHMARK_RUNS:",
  "SCANNER_BENCHMARK_WARMUP_RUNS:",
  "SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT:",
  "SCANNER_BENCHMARK_MIN_SPEEDUP:",
  "SCANNER_BENCHMARK_BASELINE_JSON:",
  "SCANNER_BENCHMARK_OUTPUT_JSON:",
  "npm run check:scanner-benchmark",
  "Upload benchmark JSON",
  "uses: actions/upload-artifact@v7",
  "retention-days: 30",
];

const forbiddenSnippets = [
  "Recover backend",
  "recover:railway-backend",
  "RAILWAY_TOKEN",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE",
  "@railway/cli",
  "vercel deploy",
  "vercel build",
  "VERCEL_TOKEN",
  "PRODUCTION_API_BEARER_TOKEN: ${{ secrets.PRODUCTION_API_BEARER_TOKEN }}",
  "PRODUCTION_API_URL: ${{ github.event.inputs.production_api_url }}",
  "@latest",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  assert(existsSync(workflowPath), `Scanner benchmark workflow not found: ${workflowPath}`);
  const body = readFileSync(workflowPath, "utf8");

  for (const snippet of requiredSnippets) {
    assert(body.includes(snippet), `Scanner benchmark workflow is missing: ${snippet}`);
  }

  for (const snippet of forbiddenSnippets) {
    assert(!body.includes(snippet), `Scanner benchmark workflow must not deploy or require recovery credentials: ${snippet}`);
  }

  const prepareIndex = body.indexOf("Prepare production benchmark account");
  const targetValidationIndex = body.indexOf("Validate trusted production target");
  const validateIndex = body.indexOf("Validate production benchmark credentials");
  const benchmarkIndex = body.indexOf("Run authenticated scanner benchmark");
  const uploadIndex = body.indexOf("Upload benchmark JSON");
  assert(targetValidationIndex < prepareIndex, "Scanner benchmark workflow must validate production target before preparing credentials.");
  assert(prepareIndex < validateIndex, "Scanner benchmark workflow must prepare runtime credentials before validating them.");
  assert(validateIndex < benchmarkIndex, "Scanner benchmark workflow must validate runtime credentials before benchmarking.");
  assert(benchmarkIndex < uploadIndex, "Scanner benchmark workflow must upload JSON only after running the benchmark.");

  console.log("Scanner benchmark workflow ok: runtime-authenticated non-deploy benchmark and artifact upload are wired.");
} catch (error) {
  console.error(`Scanner benchmark workflow check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
