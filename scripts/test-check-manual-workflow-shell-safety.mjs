#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(workflowPaths) {
  const child = spawn(process.execPath, ["scripts/check-manual-workflow-shell-safety.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      MANUAL_WORKFLOW_SHELL_SAFETY_PATHS: workflowPaths.join(","),
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

const root = mkdtempSync(join(tmpdir(), "alphavyuh-manual-workflow-shell-safety-"));
const clean = join(root, "clean.yml");
const unsafe = join(root, "unsafe.yml");

writeFileSync(clean, `
name: Safe Manual Workflow
on:
  workflow_dispatch:
    inputs:
      label:
        default: safe
jobs:
  safe:
    runs-on: ubuntu-latest
    steps:
      - name: Safe env bridge
        env:
          INPUT_LABEL: \${{ github.event.inputs.label || 'safe' }}
        run: |
          set -euo pipefail
          case "$INPUT_LABEL" in (*[!A-Za-z0-9._-]*|'') exit 1;; esac
          printf '%s\\n' "$INPUT_LABEL"
`);

writeFileSync(unsafe, `
name: Unsafe Manual Workflow
on:
  workflow_dispatch:
    inputs:
      label:
        default: unsafe
jobs:
  unsafe:
    runs-on: ubuntu-latest
    steps:
      - name: Unsafe direct interpolation
        run: |
          echo "\${{ github.event.inputs.label }}"
`);

{
  const { code, stdout, stderr } = await run([clean]);
  assert.equal(code, 0, `clean workflow should pass:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Manual workflow shell safety ok/);
}

{
  const { code, stderr } = await run([unsafe]);
  assert.notEqual(code, 0, "unsafe workflow should fail");
  assert.match(stderr, /interpolates workflow_dispatch inputs directly into shell/);
}

console.log("check-manual-workflow-shell-safety tests passed.");
