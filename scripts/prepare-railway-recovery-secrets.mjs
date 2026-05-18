#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";

const repo = valueAfter("--repo") || process.env.GITHUB_REPOSITORY || process.env.ALPHAVYUH_GITHUB_REPO || "prasanth-cloud/AlphaVyuh";
const apply = hasFlag("--apply");
const runWorkflow = hasFlag("--run-workflow");
const productionApiUrl = valueAfter("--production-api-url") || process.env.PRODUCTION_API_URL || "https://alphavyuh-production.up.railway.app";
const railwayEnvironment = valueAfter("--railway-environment") || process.env.RAILWAY_ENVIRONMENT || "production";

const requiredSecrets = [
  ["RAILWAY_TOKEN", process.env.RAILWAY_TOKEN],
  ["RAILWAY_PROJECT_ID", process.env.RAILWAY_PROJECT_ID],
  ["RAILWAY_SERVICE", process.env.RAILWAY_SERVICE],
];

const optionalSecrets = [
  ["RAILWAY_WORKSPACE", process.env.RAILWAY_WORKSPACE],
  ["PRODUCTION_API_BEARER_TOKEN", process.env.PRODUCTION_API_BEARER_TOKEN || process.env.PRODUCTION_API_AUTH_TOKEN],
];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return "";
  return process.argv[index + 1] || "";
}

function mask(value) {
  const text = String(value || "");
  if (!text) return "(missing)";
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", (error) => { stderr += error.message; });
  const [code] = await Promise.race([
    once(child, "exit"),
    once(child, "error").then(() => [127]),
  ]);
  if (options.allowFailure) return { code, stdout, stderr };
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(stderr || stdout).trim()}`);
  }
  return { code, stdout, stderr };
}

async function setSecret(name, value) {
  await run("gh", ["secret", "set", name, "--repo", repo, "--body", String(value)]);
}

async function dispatchWorkflow() {
  const args = [
    "workflow",
    "run",
    "Railway Backend Recovery",
    "--repo",
    repo,
    "-f",
    `production_api_url=${productionApiUrl}`,
    "-f",
    `railway_environment=${railwayEnvironment}`,
  ];
  await run("gh", args);
}

const missingRequired = requiredSecrets
  .filter(([, value]) => !String(value || "").trim())
  .map(([name]) => name);

console.log("AlphaVyuh Railway recovery secret preparation");
console.log(`GitHub repo: ${repo}`);
console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
console.log("");

for (const [name, value] of requiredSecrets) {
  console.log(`[required] ${name}: ${mask(value)}`);
}
for (const [name, value] of optionalSecrets) {
  console.log(`[optional] ${name}: ${mask(value)}`);
}
console.log("");

if (missingRequired.length > 0) {
  console.error(`Missing required environment variables: ${missingRequired.join(", ")}`);
  console.error("");
  console.error("Export the Railway values, then rerun:");
  console.error("  export RAILWAY_TOKEN=...");
  console.error("  export RAILWAY_PROJECT_ID=...");
  console.error("  export RAILWAY_SERVICE=...");
  console.error("  npm run prepare:railway-recovery-secrets -- --apply");
  process.exit(1);
}

const ghStatus = await run("gh", ["auth", "status"], { allowFailure: true });
if (ghStatus.code !== 0) {
  console.error("GitHub CLI is not authenticated. Run `gh auth login`, then rerun this script.");
  process.exit(1);
}

if (!apply) {
  console.log("Dry run only. No GitHub secrets were changed.");
  console.log("Run with `-- --apply` to set required Railway recovery secrets.");
  process.exit(0);
}

for (const [name, value] of [...requiredSecrets, ...optionalSecrets]) {
  if (!String(value || "").trim()) continue;
  await setSecret(name, value);
  console.log(`Set ${name}.`);
}

if (runWorkflow) {
  await dispatchWorkflow();
  console.log("Dispatched Railway Backend Recovery workflow.");
} else {
  console.log("Secrets are ready. Run the Railway Backend Recovery workflow, or rerun with `-- --apply --run-workflow`.");
}
