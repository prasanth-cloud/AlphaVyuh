#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { strict as assert } from "node:assert";

function writeExecutable(dir, name, body) {
  writeFileSync(join(dir, name), body, { mode: 0o755 });
}

function makeFakeBin() {
  const dir = mkdtempSync(join(tmpdir(), "alphavyuh-railway-recovery-script-"));
  writeExecutable(dir, "railway", `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "link") {
  process.stderr.write("Unauthorized. Please check that your RAILWAY_TOKEN is valid.\\n");
  process.exit(1);
}
if (args[0] === "up") {
  process.stdout.write("Queued deploy with explicit project flags.\\n");
  process.exit(0);
}
if (args[0] === "logs" || args[0] === "list" || args[0] === "status") {
  process.stdout.write("{}\\n");
  process.exit(0);
}
process.stderr.write(\`unexpected railway args: \${args.join(" ")}\\n\`);
process.exit(1);
`);
  writeExecutable(dir, "curl", `#!/usr/bin/env node
process.stdout.write('{"status":"ok"}\\n');
`);
  writeExecutable(dir, "npm", `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "run" && args[1] === "check:production-api") {
  process.stdout.write("production contract ok\\n");
  process.exit(0);
}
process.stderr.write(\`unexpected npm args: \${args.join(" ")}\\n\`);
process.exit(1);
`);
  return dir;
}

async function runRecovery(extraEnv = {}) {
  const fakeBin = makeFakeBin();
  const child = spawn("bash", ["scripts/recover-railway-backend.sh"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
      PRODUCTION_API_URL: "https://alphavyuh-production.up.railway.app",
      RAILWAY_PROJECT_ID: "project-id",
      RAILWAY_SERVICE: "backend",
      RAILWAY_ENVIRONMENT: "production",
      ...extraEnv,
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

{
  const { code, stdout, stderr } = await runRecovery({ RAILWAY_TOKEN: "service-scoped-token" });
  assert.equal(code, 0, `explicit project deploy should continue when railway link is not allowed:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Railway token and project ID detected; deploying with explicit project flags/);
  assert.match(stdout, /Deploying backend/);
  assert.match(stdout, /Skipping Railway deployment status wait because no Railway project is linked/);
  assert.match(stdout, /Waiting for production API contract smoke to pass/);
  assert.match(stderr, /Railway project link failed, but explicit project flags are available/);
}

{
  const { code, stderr } = await runRecovery();
  assert.notEqual(code, 0, "local recovery should fail when railway link fails and no explicit token deploy path is available");
  assert.match(stderr, /Railway project link failed and no explicit token\/project deploy path is available/);
}

console.log("recover-railway-backend script tests passed.");
