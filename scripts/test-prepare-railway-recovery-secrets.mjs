#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

function makeFakeGh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alphavyuh-gh-"));
  const gh = `#!/usr/bin/env bash
if [[ "$1" == "auth" && "$2" == "status" ]]; then
  echo "Logged in"
  exit 0
fi
if [[ "$1" == "secret" && "$2" == "set" ]]; then
  echo "$3" >> "$ALPHAVYUH_FAKE_GH_LOG"
  exit 0
fi
if [[ "$1" == "workflow" && "$2" == "run" ]]; then
  echo "workflow:$3" >> "$ALPHAVYUH_FAKE_GH_LOG"
  exit 0
fi
echo "unexpected gh args: $*" >&2
exit 1
`;
  fs.writeFileSync(path.join(dir, "gh"), gh, { mode: 0o755 });
  return dir;
}

async function runHelper(extraEnv = {}, args = []) {
  const fakeGh = makeFakeGh();
  const logFile = path.join(os.tmpdir(), `alphavyuh-gh-${Date.now()}-${Math.random()}.log`);
  const child = spawn(process.execPath, ["scripts/prepare-railway-recovery-secrets.mjs", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${fakeGh}${path.delimiter}${process.env.PATH}`,
      ALPHAVYUH_FAKE_GH_LOG: logFile,
      RAILWAY_TOKEN: "",
      RAILWAY_PROJECT_ID: "",
      RAILWAY_SERVICE: "",
      RAILWAY_WORKSPACE: "",
      PRODUCTION_API_BEARER_TOKEN: "",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  return { code, stdout, stderr, log };
}

{
  const result = await runHelper();
  assert.notEqual(result.code, 0, "helper should fail without required Railway values");
  assert.match(result.stderr, /Missing required environment variables: RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_SERVICE/);
  assert.equal(result.log, "");
}

{
  const result = await runHelper({
    RAILWAY_TOKEN: "token-secret",
    RAILWAY_PROJECT_ID: "project-123",
    RAILWAY_SERVICE: "backend",
  });
  assert.equal(result.code, 0, `dry run should pass:\n${result.stderr}`);
  assert.match(result.stdout, /Dry run only/);
  assert.equal(result.log, "");
}

{
  const result = await runHelper({
    RAILWAY_TOKEN: "token-secret",
    RAILWAY_PROJECT_ID: "project-123",
    RAILWAY_SERVICE: "backend",
    RAILWAY_WORKSPACE: "workspace-123",
  }, ["--apply", "--run-workflow"]);
  assert.equal(result.code, 0, `apply should pass:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.match(result.log, /RAILWAY_TOKEN/);
  assert.match(result.log, /RAILWAY_PROJECT_ID/);
  assert.match(result.log, /RAILWAY_SERVICE/);
  assert.match(result.log, /RAILWAY_WORKSPACE/);
  assert.match(result.log, /workflow:Railway Backend Recovery/);
}

console.log("prepare-railway-recovery-secrets tests passed.");
