#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(workflowDir) {
  const child = spawn(process.execPath, ["scripts/check-ci-action-runtime.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI_ACTION_RUNTIME_WORKFLOW_DIR: workflowDir,
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

const root = mkdtempSync(join(tmpdir(), "alphavyuh-ci-actions-"));

const clean = join(root, "clean");
const stale = join(root, "stale");
await import("node:fs/promises").then(async ({ mkdir }) => {
  await mkdir(clean);
  await mkdir(stale);
});

writeFileSync(join(clean, "workflow.yml"), `
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
    with:
      node-version: 22
  - uses: actions/setup-python@v6
  - uses: actions/github-script@v9
  - uses: actions/upload-artifact@v7
`);

writeFileSync(join(stale, "workflow.yml"), `
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 20
  - uses: actions/setup-python@v5
  - uses: actions/github-script@v7
  - uses: actions/upload-artifact@v4
`);

{
  const { code, stdout, stderr } = await run(clean);
  assert.equal(code, 0, `CI runtime check should pass on current action majors:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /CI action runtime ok/);
}

{
  const { code, stderr } = await run(stale);
  assert.notEqual(code, 0, "CI runtime check should fail on deprecated action/runtime versions");
  assert.match(stderr, /actions\/checkout@v4 should be v6\+/);
  assert.match(stderr, /node-version 20/);
  assert.match(stderr, /actions\/github-script@v7 should be v9\+/);
}

console.log("check-ci-action-runtime tests passed.");
