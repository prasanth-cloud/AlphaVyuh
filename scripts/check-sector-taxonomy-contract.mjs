#!/usr/bin/env node
import { readFileSync } from "node:fs";

const REQUIRED_SECTORAL_INDEX_LABELS = [
  "Nifty Auto Index",
  "Nifty Bank Index",
  "Nifty Financial Services Index",
  "Nifty FMCG Index",
  "Nifty Healthcare Index",
  "Nifty IT Index",
  "Nifty Metal Index",
  "Nifty Pharma Index",
  "Nifty Realty Index",
  "Nifty Oil and Gas Index",
];

function normalizeBaseUrl(raw) {
  let cleaned = String(raw ?? "")
    .trim()
    .replace(/\\+[rnt]/g, "")
    .replace(/[\r\n\t]/g, "")
    .trim();

  while (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith("`") && cleaned.endsWith("`")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned.replace(/\\+$/g, "").replace(/\/+$/g, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const parsed = { fixture: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") {
      parsed.fixture = argv[index + 1] ?? "";
      index += 1;
    }
  }
  return parsed;
}

function loadFixture(path) {
  assert(path, "--fixture requires a JSON file path.");
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildAuditUrl() {
  const explicitUrl = normalizeBaseUrl(process.env.SECTOR_AUDIT_URL);
  if (explicitUrl) return explicitUrl;

  const baseUrl = normalizeBaseUrl(
    process.env.PRODUCTION_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.LIVE_URL,
  );
  if (!baseUrl) return "";
  return `${baseUrl}/api/v1/market/sectors/audit`;
}

async function fetchAudit(url) {
  if (
    process.env.ALLOW_LOCAL_API_CHECK !== "1" &&
    /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(url)
  ) {
    console.log(`Skipping sector taxonomy check for local URL: ${url}`);
    console.log("Set ALLOW_LOCAL_API_CHECK=1 to run the same data contract against a local backend.");
    process.exit(0);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "AlphaVyuhSectorTaxonomyCheck/1.0" },
      signal: controller.signal,
    });
    const body = await response.text();
    let data = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      data = { raw: body.slice(0, 200) };
    }
    assert(response.ok, `${url} returned ${response.status}: ${JSON.stringify(data).slice(0, 220)}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function validateSectorTaxonomyContract(payload, options = {}) {
  const metadata = payload?.metadata ?? payload;
  const minActiveCount = options.minActiveCount ?? numberFromEnv("SECTOR_AUDIT_MIN_ACTIVE_COUNT", 1000);
  const minSectorCount = options.minSectorCount ?? numberFromEnv("SECTOR_AUDIT_MIN_SECTOR_COUNT", 10);

  assert(metadata && typeof metadata === "object", "Sector audit response did not include metadata.");
  assert(metadata.source === "stock_universe.sector", `Unexpected sector taxonomy source: ${metadata.source}`);
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(String(metadata.contract_as_of ?? "")),
    `Sector taxonomy contract_as_of was not an ISO date: ${metadata.contract_as_of}`,
  );
  assert(
    metadata.reference?.relationship === "reference_only_not_equity_universe_source",
    "Sector reference must be marked as reference-only, not the equity-universe source.",
  );
  assert(
    metadata.reference?.url === "https://www.nseindia.com/static/products-services/indices-sectoral",
    `Unexpected NSE sectoral reference URL: ${metadata.reference?.url}`,
  );
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(String(metadata.reference?.as_of ?? "")),
    `NSE sectoral reference as_of was not an ISO date: ${metadata.reference?.as_of}`,
  );
  assert(
    metadata.universe_taxonomy?.source === "stock_universe.sector",
    "Universe taxonomy must identify stock_universe.sector as the AlphaVyuh sector source.",
  );

  assert(Number(metadata.active_count) >= minActiveCount, `Active universe count looked too low: ${metadata.active_count}`);
  assert(Number(metadata.sector_count) >= minSectorCount, `Sector count looked too low: ${metadata.sector_count}`);
  assert(Array.isArray(metadata.unmapped_symbols), "Sector metadata must expose unmapped_symbols.");
  assert(Number.isFinite(Number(metadata.unmapped_count)), `unmapped_count was not numeric: ${metadata.unmapped_count}`);
  assert(
    metadata.display_filter?.minimum_active_symbols === 1,
    `Sector audit must not hide small sectors; minimum_active_symbols=${metadata.display_filter?.minimum_active_symbols}`,
  );
  assert(
    metadata.display_filter?.hidden_sector_count === 0,
    `Sector audit is still hiding ${metadata.display_filter?.hidden_sector_count} sectors.`,
  );

  assert(Array.isArray(metadata.sector_counts), "sector_counts must be an array.");
  assert(
    metadata.sector_counts.length === Number(metadata.sector_count),
    `sector_count ${metadata.sector_count} did not match sector_counts length ${metadata.sector_counts.length}.`,
  );
  for (const item of metadata.sector_counts) {
    assert(typeof item?.sector === "string" && item.sector.trim(), "Every sector count needs a sector label.");
    assert(Number.isFinite(Number(item.active_count)), `Sector ${item.sector} active_count was not numeric.`);
    assert(item.hidden_by_filter === false, `Sector ${item.sector} should not be hidden in the audit contract.`);
    assert(Array.isArray(item.related_sectoral_indices), `Sector ${item.sector} must expose related_sectoral_indices.`);
  }

  assert(Array.isArray(metadata.sectoral_indices), "sectoral_indices must be an array.");
  const labels = new Set(metadata.sectoral_indices.map((item) => item?.label).filter(Boolean));
  for (const label of REQUIRED_SECTORAL_INDEX_LABELS) {
    assert(labels.has(label), `Missing NSE sectoral index reference label: ${label}`);
  }

  return {
    activeCount: Number(metadata.active_count),
    sectorCount: Number(metadata.sector_count),
    unmappedCount: Number(metadata.unmapped_count),
    contractAsOf: metadata.contract_as_of,
    referenceAsOf: metadata.reference.as_of,
  };
}

const args = parseArgs(process.argv.slice(2));
const sourceLabel = args.fixture || buildAuditUrl();

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!sourceLabel) {
    console.log("Skipping sector taxonomy check: set SECTOR_AUDIT_URL, PRODUCTION_API_URL, NEXT_PUBLIC_API_URL, PUBLIC_SITE_URL, or LIVE_URL.");
    process.exit(0);
  }

  try {
    const payload = args.fixture ? loadFixture(args.fixture) : await fetchAudit(sourceLabel);
    const summary = validateSectorTaxonomyContract(payload);
    console.log(
      `Sector taxonomy ok: ${summary.sectorCount} sectors, ${summary.activeCount} active symbols, ` +
        `${summary.unmappedCount} unmapped, contract ${summary.contractAsOf}, NSE reference ${summary.referenceAsOf}.`,
    );
  } catch (error) {
    console.error(`Sector taxonomy check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
