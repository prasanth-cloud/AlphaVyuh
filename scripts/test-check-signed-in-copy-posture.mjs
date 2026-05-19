#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(files) {
  const child = spawn(process.execPath, ["scripts/check-signed-in-copy-posture.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      SIGNED_IN_COPY_POSTURE_FILES: files.join(","),
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

const root = mkdtempSync(join(tmpdir(), "alphavyuh-copy-posture-"));
const clean = join(root, "clean.ts");
const stale = join(root, "stale.ts");
const professionalBranding = join(root, "professional.ts");

writeFileSync(clean, 'export const copy = "Focused trading desk and chart review surface.";');
writeFileSync(stale, 'export const copy = "Simplify workspace copy for the generic workspace.";');
writeFileSync(professionalBranding, 'export const copy = "Professional Access account.";');

{
  const { code, stdout, stderr } = await run([clean]);
  assert.equal(code, 0, `signed-in posture check should pass on clean copy:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Signed-in copy posture ok/);
}

{
  const { code, stderr } = await run([clean, stale]);
  assert.notEqual(code, 0, "signed-in posture check should fail on stale workspace copy");
  assert.match(stderr, /old workspace cleanup title|generic workspace positioning/);
}

{
  const { code, stderr } = await run([clean, professionalBranding]);
  assert.notEqual(code, 0, "signed-in posture check should fail on professional branding");
  assert.match(stderr, /professional access branding|professional-as-brand positioning/);
}

console.log("check-signed-in-copy-posture tests passed.");
