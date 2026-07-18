#!/usr/bin/env node
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

async function run(args) {
  const child = spawn(process.execPath, ["scripts/run-command-with-timeout.mjs", ...args], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");
  return { code, stdout, stderr };
}

const source = await readFile("scripts/launch-readiness-check.sh", "utf8");
const setupReviewSource = await readFile("scripts/test-setup-review-contract.sh", "utf8");
assert.match(source, /npm --prefix frontend audit --audit-level=moderate/);
assert.match(source, /run-command-with-timeout\.mjs/);
assert.match(source, /STEP_TIMEOUT_SECONDS:-900/);
assert.match(source, /PYTEST_CMD=\(\)/);
assert.match(source, /uv run --with-requirements backend\/requirements\.txt python -m pytest/);
assert.match(source, /PIP_AUDIT_CMD=\(\)/);
assert.match(setupReviewSource, /SKIP_BROWSER_SMOKE:-/);
assert.match(setupReviewSource, /Skipping setup review browser workflow smoke/);

const success = await run([
  "--name", "quick check",
  "--timeout", "5",
  "--",
  process.execPath,
  "-e",
  "console.log('runner-ok')",
]);
assert.equal(success.code, 0, success.stderr);
assert.match(success.stdout, /runner-ok/);

const timeout = await run([
  "--name", "intentional stall",
  "--timeout", "0.1",
  "--",
  process.execPath,
  "-e",
  "setInterval(() => {}, 1000)",
]);
assert.equal(timeout.code, 124, `expected timeout exit 124, got ${timeout.code}\n${timeout.stderr}`);
assert.match(timeout.stderr, /intentional stall exceeded 0\.1 seconds/);

console.log("launch readiness runner tests passed.");
