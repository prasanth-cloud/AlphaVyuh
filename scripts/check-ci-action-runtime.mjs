#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowDir = process.env.CI_ACTION_RUNTIME_WORKFLOW_DIR || ".github/workflows";

const minimumActionMajors = new Map([
  ["actions/checkout", 6],
  ["actions/setup-node", 6],
  ["actions/setup-python", 6],
  ["actions/github-script", 9],
  ["actions/upload-artifact", 7],
]);

function fail(message) {
  console.error(`CI action runtime check failed: ${message}`);
  process.exit(1);
}

if (!existsSync(workflowDir)) {
  fail(`workflow directory not found: ${workflowDir}`);
}

const workflowFiles = readdirSync(workflowDir)
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .map((file) => join(workflowDir, file));

const failures = [];

for (const file of workflowFiles) {
  const body = readFileSync(file, "utf8");
  const relativeFile = file.replace(`${workflowDir}/`, "");

  for (const match of body.matchAll(/uses:\s*(actions\/[A-Za-z0-9_-]+)@v(\d+)/g)) {
    const [, action, majorText] = match;
    const minimumMajor = minimumActionMajors.get(action);
    if (minimumMajor && Number(majorText) < minimumMajor) {
      failures.push(`${relativeFile}: ${action}@v${majorText} should be v${minimumMajor}+`);
    }
  }

  if (/node-version:\s*["']?20["']?\b/.test(body)) {
    failures.push(`${relativeFile}: node-version 20 is past the supported CI baseline; use Node 22+`);
  }
}

if (failures.length > 0) {
  fail(failures.join("\n"));
}

console.log("CI action runtime ok: workflows use current action runtimes and Node 22+ for Node jobs.");
