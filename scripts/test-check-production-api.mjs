#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(404, {
      "content-type": "application/json",
      "x-railway-fallback": "true",
    });
    response.end(JSON.stringify({
      status: "error",
      code: 404,
      message: "Application not found",
    }));
    return;
  }

  response.writeHead(500, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "unexpected path" }));
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  const { port } = server.address();
  const child = spawn(process.execPath, ["scripts/check-production-api.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRODUCTION_API_URL: `http://127.0.0.1:${port}`,
      ALLOW_LOCAL_API_CHECK: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const [code] = await once(child, "exit");
  assert.notEqual(code, 0, "production API check should fail on Railway fallback");
  assert.match(
    stderr,
    /Railway is returning its fallback response/,
    `stderr should explain Railway fallback, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );

  console.log("check-production-api Railway fallback test passed.");
} finally {
  server.close();
}
