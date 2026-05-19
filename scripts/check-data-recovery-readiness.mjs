#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const repo = process.env.GITHUB_REPOSITORY || process.env.ALPHAVYUH_GITHUB_REPO || "prasanth-cloud/AlphaVyuh";
const apiUrl = normalizeUrl(process.env.PRODUCTION_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://alphavyuh-production.up.railway.app");
const backendDir = process.env.ALPHAVYUH_BACKEND_DIR || path.join(rootDir, "backend");
const backendEnv = readEnvFile(path.join(backendDir, ".env"));
const supabaseUrl = normalizeUrl(process.env.SUPABASE_URL || backendEnv.SUPABASE_URL || "");
const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || backendEnv.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const productionApiBearerToken = String(process.env.PRODUCTION_API_BEARER_TOKEN || process.env.PRODUCTION_API_AUTH_TOKEN || "").trim();
const requireAuthenticatedSmoke = process.env.REQUIRE_AUTHENTICATED_SMOKE === "1";
const productionApiChartSymbols = parseChartSymbols(process.env.PRODUCTION_API_CHART_SYMBOLS || "RELIANCE,ITC,AUBANK");
const ghCommand = process.env.ALPHAVYUH_GH_BIN || "gh";
const railwayCommand = process.env.ALPHAVYUH_RAILWAY_BIN || "railway";
const vercelCommand = process.env.ALPHAVYUH_VERCEL_BIN || "vercel";

const requiredGithubSecrets = ["RAILWAY_TOKEN", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE"];
const optionalGithubSecrets = ["RAILWAY_WORKSPACE", "PRODUCTION_API_BEARER_TOKEN", "PRODUCTION_API_CHART_SYMBOLS"];
const results = [];
const resultOrder = [
  "Production API data smoke",
  "Vercel production env",
  "Supabase EOD data",
  "Chart smoke config",
  "Authenticated app smoke",
  "GitHub recovery secrets",
  "Railway recovery workflow",
  "Local Railway CLI",
  "Local Railway project link",
];

function normalizeUrl(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/[\r\n\t]/g, "")
    .replace(/\/+$/, "");
}

function readEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const values = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index <= 0) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

function parseChartSymbols(raw) {
  return String(raw || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
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

function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
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

async function checkVercelProductionEnv() {
  if (process.env.SKIP_VERCEL_ENV_CHECK === "1") return null;

  const envPath = path.join(
    fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "alphavyuh-vercel-env-")),
    ".env.production.local",
  );

  try {
    const { code, stdout, stderr } = await run(vercelCommand, ["env", "pull", envPath, "--environment=production"]);
    if (code !== 0) {
      addResult(
        "warn",
        "Vercel production env",
        summarizeOutput(stderr || stdout) || "Could not inspect Vercel production environment variables.",
        "Run `vercel env pull --environment=production` from a linked/authenticated checkout if frontend env drift is suspected.",
      );
      return null;
    }

    const values = parseEnvText(fs.readFileSync(envPath, "utf8"));
    const frontendApiUrl = normalizeUrl(values.NEXT_PUBLIC_API_URL || "");
    const dataMode = values.NEXT_PUBLIC_DATA_MODE || "unset";
    const mockFallback = String(values.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK || "").toLowerCase();

    if (!frontendApiUrl) {
      addResult(
        "fail",
        "Vercel production env",
        "NEXT_PUBLIC_API_URL is missing from the production frontend environment.",
        "Set NEXT_PUBLIC_API_URL to the recovered backend API URL, then redeploy the frontend.",
      );
      return false;
    }

    if (frontendApiUrl !== apiUrl) {
      addResult(
        "fail",
        "Vercel production env",
        `NEXT_PUBLIC_API_URL does not match the recovery API URL. Frontend target is ${frontendApiUrl}; recovery target is ${apiUrl}.`,
        "Update the Vercel production frontend env or rerun this preflight with the actual production API URL.",
      );
      return false;
    }

    if (mockFallback === "true") {
      addResult(
        "fail",
        "Vercel production env",
        `Frontend points at the recovery API URL, but NEXT_PUBLIC_ALLOW_MOCK_FALLBACK is ${values.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK}.`,
        "Disable production mock fallback before declaring real data recovery complete.",
      );
      return false;
    }

    addResult(
      "pass",
      "Vercel production env",
      `Frontend points at the recovery API URL; data mode is ${dataMode}; mock fallback is ${values.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK || "unset"}.`,
    );
    return true;
  } catch (error) {
    addResult(
      "warn",
      "Vercel production env",
      error instanceof Error ? error.message : String(error),
      "Inspect Vercel production env manually before treating this as frontend env drift.",
    );
    return null;
  } finally {
    try {
      fs.rmSync(path.dirname(envPath), { recursive: true, force: true });
    } catch {
      // ignore temp cleanup failures
    }
  }
}

async function fetchSupabase(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    headers: {
      apikey: supabaseServiceKey,
      authorization: `Bearer ${supabaseServiceKey}`,
      ...(options.count ? { Prefer: "count=exact" } : {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${JSON.stringify(data).slice(0, 160)}`);
  }
  return { data, count: response.headers.get("content-range")?.split("/")?.[1] };
}

async function checkSupabaseEodFreshness() {
  if (!supabaseUrl || !supabaseServiceKey) {
    addResult(
      "warn",
      "Supabase EOD data",
      "Skipped because SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY was not available in the environment or backend/.env.",
      "Run from a configured machine or add Supabase env vars to verify the raw EOD store.",
    );
    return false;
  }

  try {
    const latest = await fetchSupabase("daily_ohlcv?select=trade_date&order=trade_date.desc&limit=1");
    const tradeDate = latest.data?.[0]?.trade_date;
    if (!tradeDate) {
      addResult("fail", "Supabase EOD data", "No daily_ohlcv rows were found.", "Run the EOD ingest before recovering the API host.");
      return false;
    }

    const coverage = await fetchSupabase(
      `daily_ohlcv?select=symbol&trade_date=eq.${encodeURIComponent(tradeDate)}&limit=1`,
      { count: true },
    );
    const universe = await fetchSupabase("stock_universe?select=symbol&limit=1", { count: true });
    const coverageCount = Number(coverage.count || 0);
    const universeCount = Number(universe.count || 0);
    const coverageRatio = universeCount > 0 ? coverageCount / universeCount : 0;

    if (coverageCount < 100 || coverageRatio < 0.5) {
      addResult(
        "fail",
        "Supabase EOD data",
        `Latest daily_ohlcv date ${tradeDate} has weak coverage: ${coverageCount}/${universeCount || "unknown"} symbols.`,
        "Run or inspect the EOD ingest before recovering the API host.",
      );
      return false;
    }

    addResult(
      "pass",
      "Supabase EOD data",
      `Latest daily_ohlcv date ${tradeDate} has ${coverageCount}/${universeCount || "unknown"} symbols (${Math.round(coverageRatio * 100)}% coverage).`,
    );
    return true;
  } catch (error) {
    addResult(
      "warn",
      "Supabase EOD data",
      error instanceof Error ? error.message : String(error),
      "Inspect Supabase credentials/connectivity before treating this as an empty-data problem.",
    );
    return false;
  }
}

async function checkGithubSecrets() {
  const { code, stdout, stderr } = await run(ghCommand, ["secret", "list", "--repo", repo]);

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
      "Export Railway values and run `npm run prepare:railway-recovery-secrets -- --apply`, then run the manual Railway Backend Recovery workflow.",
    );
    return false;
  }

  const optionalDetail = missingOptional.length > 0
    ? ` Optional secrets not set: ${missingOptional.join(", ")}.`
    : " Optional scanner/workspace secrets are present.";
  addResult("pass", "GitHub recovery secrets", `Required Railway recovery secrets are present.${optionalDetail}`);
  return true;
}

function checkChartSmokeConfig() {
  if (productionApiChartSymbols.length === 0) {
    addResult(
      "fail",
      "Chart smoke config",
      "No chart smoke symbols are configured.",
      "Set PRODUCTION_API_CHART_SYMBOLS=RELIANCE,ITC,AUBANK or equivalent active watchlist symbols.",
    );
    return false;
  }

  addResult(
    "pass",
    "Chart smoke config",
    `Production chart smoke will verify: ${productionApiChartSymbols.join(", ")}.`,
  );
  return true;
}

async function checkRecoveryWorkflowRuns() {
  const { code, stdout, stderr } = await run(ghCommand, [
    "run",
    "list",
    "--repo",
    repo,
    "--workflow",
    "Railway Backend Recovery",
    "--limit",
    "1",
    "--json",
    "status,conclusion,createdAt,url,displayTitle",
  ]);

  if (code !== 0) {
    addResult(
      "warn",
      "Railway recovery workflow",
      summarizeOutput(stderr || stdout) || "Could not inspect Railway Backend Recovery workflow runs.",
      "Check GitHub Actions manually after adding Railway secrets.",
    );
    return false;
  }

  let runs = [];
  try {
    runs = JSON.parse(stdout || "[]");
  } catch {
    addResult(
      "warn",
      "Railway recovery workflow",
      `Could not parse workflow run output: ${summarizeOutput(stdout)}`,
      "Check GitHub Actions manually after adding Railway secrets.",
    );
    return false;
  }

  const latest = runs[0];
  if (!latest) {
    addResult(
      "warn",
      "Railway recovery workflow",
      "No Railway Backend Recovery workflow runs found.",
      "After adding Railway secrets, run the manual Railway Backend Recovery workflow or `npm run prepare:railway-recovery-secrets -- --apply --run-workflow`.",
    );
    return false;
  }

  const status = latest.status === "completed"
    ? latest.conclusion || "completed"
    : latest.status || "unknown";
  const detail = `Latest run ${latest.createdAt || "unknown time"} is ${status}${latest.url ? `: ${latest.url}` : ""}.`;
  if (latest.status === "completed" && latest.conclusion === "success") {
    addResult("pass", "Railway recovery workflow", detail);
    return true;
  }

  addResult(
    "warn",
    "Railway recovery workflow",
    detail,
    "Inspect the latest workflow logs or rerun after fixing Railway secrets/project inputs.",
  );
  return false;
}

async function checkLocalRailway() {
  const whoami = await run(railwayCommand, ["whoami"], { cwd: backendDir });
  if (whoami.code !== 0) {
    addResult(
      "warn",
      "Local Railway CLI",
      summarizeOutput(whoami.stderr || whoami.stdout) || "Railway CLI is not authenticated locally.",
      "Run `npm run recover:railway-backend:login` to refresh Railway auth, recover the backend, and rerun verification.",
    );
    return false;
  }

  const status = await run(railwayCommand, ["status", "--json"], { cwd: backendDir });
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

function checkAuthenticatedSmokeCoverage(productionApiOk) {
  if (!productionApiOk) return false;

  if (!productionApiBearerToken) {
    addResult(
      requireAuthenticatedSmoke ? "fail" : "warn",
      "Authenticated app smoke",
      "Skipped scanner/watchlist authenticated API verification because PRODUCTION_API_BEARER_TOKEN was not available.",
      "Provide a short-lived production smoke token before declaring dashboard → scanner → watchlist → chart verification complete.",
    );
    return false;
  }

  addResult(
    "pass",
    "Authenticated app smoke",
    "Production API check included authenticated scanner verification.",
  );
  return true;
}

function printResults({ productionApiOk, supabaseFresh, githubRecoveryReady, recoveryWorkflowReady, localRailwayReady, authenticatedSmokeOk }) {
  console.log(`AlphaVyuh production data recovery preflight`);
  console.log(`API URL: ${apiUrl}`);
  console.log(`GitHub repo: ${repo}`);
  console.log("");

  const orderedResults = [...results].sort((left, right) => {
    const leftIndex = resultOrder.indexOf(left.name);
    const rightIndex = resultOrder.indexOf(right.name);
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });

  for (const result of orderedResults) {
    const marker = result.status === "pass" ? "PASS" : result.status === "warn" ? "WARN" : "FAIL";
    console.log(`[${marker}] ${result.name}`);
    console.log(`  ${result.detail}`);
    if (result.nextStep) console.log(`  Next: ${result.nextStep}`);
  }

  console.log("");
  if (productionApiOk) {
    console.log("Public API recovery status: production data API is serving real EOD smoke data.");
    if (authenticatedSmokeOk) {
      console.log("Full app recovery status: authenticated scanner verification passed; run the signed-in browser smoke before launch.");
    } else {
      console.log("Full app recovery status: not complete until authenticated scanner/watchlist and signed-in browser smoke pass.");
    }
    return;
  }

  if (supabaseFresh) {
    console.log("Data store status: Supabase EOD data is present; the remaining issue is API hosting/recovery.");
  }

  if (githubRecoveryReady || recoveryWorkflowReady || localRailwayReady) {
    console.log("Recovery status: backend still needs recovery, but at least one deploy path appears ready.");
    console.log("Run `npm run recover:railway-backend:login` locally or the manual Railway Backend Recovery GitHub workflow.");
    return;
  }

  console.log("Recovery status: backend is down and no deploy path is ready yet.");
  console.log("Add Railway GitHub secrets or run `npm run recover:railway-backend:login`, then recover the backend.");
}

try {
  const [productionApiOk, , supabaseFresh, githubRecoveryReady, recoveryWorkflowReady, localRailwayReady] = await Promise.all([
    checkProductionApi(),
    checkVercelProductionEnv(),
    checkSupabaseEodFreshness(),
    checkGithubSecrets(),
    checkRecoveryWorkflowRuns(),
    checkLocalRailway(),
  ]);
  checkChartSmokeConfig();
  const authenticatedSmokeOk = checkAuthenticatedSmokeCoverage(productionApiOk);

  printResults({ productionApiOk, supabaseFresh, githubRecoveryReady, recoveryWorkflowReady, localRailwayReady, authenticatedSmokeOk });
  process.exit(productionApiOk && (!requireAuthenticatedSmoke || authenticatedSmokeOk) ? 0 : 1);
} catch (error) {
  console.error(`Production data recovery preflight failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
