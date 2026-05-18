#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const rootDir = process.cwd();
const repo = process.env.GITHUB_REPOSITORY || process.env.ALPHAVYUH_GITHUB_REPO || "prasanth-cloud/AlphaVyuh";
const apiUrl = normalizeUrl(process.env.PRODUCTION_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://alphavyuh-production.up.railway.app");
const backendDir = process.env.ALPHAVYUH_BACKEND_DIR || path.join(rootDir, "backend");

const requiredGithubSecrets = ["RAILWAY_TOKEN", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE"];
const optionalGithubSecrets = ["RAILWAY_WORKSPACE", "PRODUCTION_API_BEARER_TOKEN"];
const results = [];

function normalizeUrl(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/\/+$/, "");
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || rootDir,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", (error) => {
    stderr += error.message;
  });

  const [code] = await Promise.race([
    once(child, "exit"),
    once(child, "error").then(() => [127]),
  ]);
  return { code, stdout, stderr };
}

function addResult(status, name, detail, nextStep = "") {
  results.push({ status, name, detail, nextStep });
}

function summarizeOutput(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

async function checkProductionApi() {
  const { code, stdout, stderr } = await run(process.execPath, ["scripts/check-production-api.mjs"], {
    env: {
      PRODUCTION_API_URL: apiUrl,
    },
  });

  if (code === 0) {
    addResult("pass", "Production API data smoke", summarizeOutput(stdout));
    return true;
  }

  addResult(
    "fail",
    "Production API data smoke",
    summarizeOutput(stderr || stdout) || "Production API smoke failed.",
    "Recover/reattach the Railway backend, then rerun this preflight.",
  );
  return false;
}

async function checkGithubSecrets() {
  const { code, stdout, stderr } = await run("gh", ["secret", "list", "--repo", repo]);

  if (code !== 0) {
    addResult(
      "warn",
      "GitHub recovery secrets",
      summarizeOutput(stderr || stdout) || "Could not inspect GitHub repository secrets.",
      "Run `gh auth status`, then rerun this command, or check repository secrets manually.",
    );
    return false;
  }

  const available = new Set(
    stdout
      .split(/\r?\n/)
      .map((line) => line.split(/\s+/)[0])
      .filter(Boolean),
  );
  const missingRequired = requiredGithubSecrets.filter((secret) => !available.has(secret));
  const missingOptional = optionalGithubSecrets.filter((secret) => !available.has(secret));

  if (missingRequired.length > 0) {
    addResult(
      "fail",
      "GitHub recovery secrets",
      `Missing required secrets: ${missingRequired.join(", ")}.`,
      "Add the missing secrets, then run the manual Railway Backend Recovery workflow.",
    );
    return false;
  }

  const optionalDetail = missingOptional.length > 0
    ? ` Optional secrets not set: ${missingOptional.join(", ")}.`
    : " Optional scanner/workspace secrets are present.";
  addResult("pass", "GitHub recovery secrets", `Required Railway recovery secrets are present.${optionalDetail}`);
  return true;
}

async function checkLocalRailway() {
  const whoami = await run("railway", ["whoami"], { cwd: backendDir });
  if (whoami.code !== 0) {
    addResult(
      "warn",
      "Local Railway CLI",
      summarizeOutput(whoami.stderr || whoami.stdout) || "Railway CLI is not authenticated locally.",
      "Run `railway login` if you want to recover from this machine instead of GitHub Actions.",
    );
    return false;
  }

  const status = await run("railway", ["status", "--json"], { cwd: backendDir });
  if (status.code !== 0) {
    addResult(
      "warn",
      "Local Railway project link",
      summarizeOutput(status.stderr || status.stdout) || "Railway project/service is not linked locally.",
      "Run `cd backend && railway link`, then rerun this command.",
    );
    return false;
  }

  addResult("pass", "Local Railway CLI", "Railway CLI is authenticated and backend project status is available.");
  return true;
}

function printResults({ productionApiOk, githubRecoveryReady, localRailwayReady }) {
  console.log(`AlphaVyuh production data recovery preflight`);
  console.log(`API URL: ${apiUrl}`);
  console.log(`GitHub repo: ${repo}`);
  console.log("");

  for (const result of results) {
    const marker = result.status === "pass" ? "PASS" : result.status === "warn" ? "WARN" : "FAIL";
    console.log(`[${marker}] ${result.name}`);
    console.log(`  ${result.detail}`);
    if (result.nextStep) console.log(`  Next: ${result.nextStep}`);
  }

  console.log("");
  if (productionApiOk) {
    console.log("Recovery status: production data API is serving real EOD smoke data.");
    return;
  }

  if (githubRecoveryReady || localRailwayReady) {
    console.log("Recovery status: backend still needs recovery, but at least one deploy path appears ready.");
    console.log("Run `npm run recover:railway-backend` locally or the manual Railway Backend Recovery GitHub workflow.");
    return;
  }

  console.log("Recovery status: backend is down and no deploy path is ready yet.");
  console.log("Add Railway GitHub secrets or refresh local `railway login`, then recover the backend.");
}

try {
  const [productionApiOk, githubRecoveryReady, localRailwayReady] = await Promise.all([
    checkProductionApi(),
    checkGithubSecrets(),
    checkLocalRailway(),
  ]);

  printResults({ productionApiOk, githubRecoveryReady, localRailwayReady });
  process.exit(productionApiOk ? 0 : 1);
} catch (error) {
  console.error(`Production data recovery preflight failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
