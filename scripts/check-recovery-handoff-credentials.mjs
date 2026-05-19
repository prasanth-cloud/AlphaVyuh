#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const defaultFiles = [
  "AGENTS/README.md",
  "AGENTS/data.md",
  "AGENTS/deploy.md",
  "AGENTS/qa.md",
  "AGENTS/REQUESTS.md",
  "docs/environments.md",
  "docs/release-readiness.md",
  "docs/customer-launch-runbook.md",
];

const requiredNames = [
  "PRODUCTION_API_BEARER_TOKEN",
  "PLAYWRIGHT_QA_EMAIL",
  "PLAYWRIGHT_QA_PASSWORD",
  "RUN_PRODUCTION_RECOVERY_SMOKE=1",
];

function filesToCheck() {
  const configured = process.env.RECOVERY_HANDOFF_FILES;
  if (!configured) return defaultFiles;
  return configured
    .split(/[,\n]/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function snippet(text, index) {
  return text
    .slice(Math.max(0, index - 80), Math.min(text.length, index + 160))
    .replace(/\s+/g, " ");
}

try {
  const files = filesToCheck();
  if (files.length === 0) {
    throw new Error("No recovery handoff files configured.");
  }

  for (const file of files) {
    if (!existsSync(file)) {
      throw new Error(`Recovery handoff file not found: ${file}`);
    }

    const body = readFileSync(file, "utf8");
    const mentionsRecoveryGate = body.includes("RUN_PRODUCTION_RECOVERY_SMOKE=1");
    if (!mentionsRecoveryGate) continue;

    const missing = requiredNames.filter((name) => !body.includes(name));
    if (missing.length > 0) {
      const gateIndex = body.indexOf("RUN_PRODUCTION_RECOVERY_SMOKE=1");
      throw new Error(
        `${file} documents the production recovery gate without required credential names: ${missing.join(", ")}. ` +
        `Context: ${snippet(body, gateIndex)}`,
      );
    }
  }

  console.log(`Recovery handoff credential docs ok: checked ${files.length} active files.`);
} catch (error) {
  console.error(`Recovery handoff credential check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
