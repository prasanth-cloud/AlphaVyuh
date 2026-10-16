#!/usr/bin/env node
// Compare canonical bootstrap identities without assuming execution/history order.
import { readFileSync } from "node:fs";

function fail(message) {
  throw new Error(message);
}

function canonicalVersions(plan) {
  if (!plan.trim()) fail("Canonical migration plan is empty.");
  const versions = new Map();
  for (const [index, line] of plan.trim().split(/\r?\n/).entries()) {
    const match = line.match(/^(\d+) (\d+_.+\.sql) sha256=[a-f0-9]{64}$/);
    if (!match || Number(match[1]) !== index + 1) {
      fail(`Canonical migration plan entry ${index + 1} is invalid.`);
    }
    const file = match[2];
    const version = file.slice(0, file.indexOf("_"));
    if (versions.has(version)) fail("Canonical migration plan contains duplicate versions.");
    versions.set(version, file);
  }
  return versions;
}

function appliedVersions(history) {
  let records;
  try { records = JSON.parse(history); } catch { fail("Production migration history is not valid JSON."); }
  if (!Array.isArray(records)) fail("Production migration history must be an array.");
  const versions = new Set();
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object" || Array.isArray(record)
      || typeof record.version !== "string" || !/^\d+$/.test(record.version)) {
      fail(`Production migration history entry ${index + 1} must contain a numeric string version.`);
    }
    if (versions.has(record.version)) fail("Production migration history contains duplicate versions.");
    versions.add(record.version);
  }
  return versions;
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 2) fail("Usage: node scripts/check-migration-drift.mjs <canonical-plan> <production-history-json>");
  const canonical = canonicalVersions(readFileSync(args[0], "utf8"));
  const applied = appliedVersions(readFileSync(args[1], "utf8"));
  const missing = [...canonical].filter(([version]) => !applied.has(version)).map(([, file]) => file);
  if (missing.length) fail(`Canonical migrations missing from production history: ${missing.join(", ")}`);
  console.log(`Migration identities verified: all ${canonical.size} canonical versions are present in ${applied.size} production records.`);
} catch (error) {
  console.error(`Migration drift check failed: ${error.message}`);
  process.exitCode = 1;
}
