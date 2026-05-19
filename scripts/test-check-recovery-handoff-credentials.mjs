#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(files) {
  const child = spawn(process.execPath, ["scripts/check-recovery-handoff-credentials.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      RECOVERY_HANDOFF_FILES: files.join(","),
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

const root = mkdtempSync(join(tmpdir(), "alphavyuh-recovery-handoff-"));
const clean = join(root, "clean.md");
const stale = join(root, "stale.md");
const unrelated = join(root, "unrelated.md");

writeFileSync(clean, [
  "# Recovery",
  "# export PRODUCTION_API_BEARER_TOKEN=...",
  "# export PLAYWRIGHT_QA_EMAIL=...",
  "# export PLAYWRIGHT_QA_PASSWORD=...",
  "RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check",
].join("\n"));
writeFileSync(stale, [
  "# Recovery",
  "# export PRODUCTION_API_BEARER_TOKEN=...",
  "RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check",
].join("\n"));
writeFileSync(unrelated, "# No production gate here.");

{
  const { code, stdout, stderr } = await run([clean, unrelated]);
  assert.equal(code, 0, `recovery handoff check should pass when documented credentials are complete:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Recovery handoff credential docs ok/);
}

{
  const { code, stderr } = await run([stale]);
  assert.notEqual(code, 0, "recovery handoff check should fail when QA credentials are missing");
  assert.match(stderr, /PLAYWRIGHT_QA_EMAIL/);
  assert.match(stderr, /PLAYWRIGHT_QA_PASSWORD/);
}

console.log("check-recovery-handoff-credentials tests passed.");
