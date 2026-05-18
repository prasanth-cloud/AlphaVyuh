#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

const pageCopy = {
  "/": "Professional Access · EOD market data · Request access",
  "/login": "Sign in to AlphaVyuh. Professional Access · Broker import only",
  "/access": "Operate your EOD trading workflow. Data and execution policy. No live/sandbox broker order placement. Professional Access",
};

async function withServer(handler, test) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    await test(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function runChecker(siteUrl) {
  const child = spawn(process.execPath, ["scripts/check-public-posture.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PUBLIC_SITE_URL: siteUrl,
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

function servePages(overrides = {}) {
  return (request, response) => {
    if (request.url === "/beta") {
      response.writeHead(overrides.betaStatus ?? 302, {
        location: overrides.betaLocation ?? "/access",
      });
      response.end();
      return;
    }

    const body = overrides[request.url] ?? pageCopy[request.url];
    if (!body) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }

    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<html><body>${body}</body></html>`);
  };
}

await withServer(servePages(), async (siteUrl) => {
  const { code, stdout, stderr } = await runChecker(siteUrl);
  assert.equal(code, 0, `public posture check should pass on clean copy:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Public posture ok/);
});

await withServer(servePages({ "/": `${pageCopy["/"]} Private beta workspace` }), async (siteUrl) => {
  const { code, stdout, stderr } = await runChecker(siteUrl);
  assert.notEqual(code, 0, "public posture check should fail on forbidden beta copy");
  assert.match(
    stderr,
    /contains forbidden public posture copy/,
    `stderr should explain forbidden copy:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

await withServer(servePages({ "/": `${pageCopy["/"]} Early access to new features` }), async (siteUrl) => {
  const { code, stdout, stderr } = await runChecker(siteUrl);
  assert.notEqual(code, 0, "public posture check should fail on early-access positioning");
  assert.match(
    stderr,
    /contains forbidden public posture copy/,
    `stderr should explain early-access copy:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

await withServer(servePages({ "/login": "Sign in to AlphaVyuh. Broker import only" }), async (siteUrl) => {
  const { code, stdout, stderr } = await runChecker(siteUrl);
  assert.notEqual(code, 0, "public posture check should fail on missing Professional Access copy");
  assert.match(
    stderr,
    /\/login did not include expected copy: \/Professional Access\/i/,
    `stderr should explain missing required copy:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

await withServer(servePages({ betaLocation: "/" }), async (siteUrl) => {
  const { code, stdout, stderr } = await runChecker(siteUrl);
  assert.notEqual(code, 0, "public posture check should fail when /beta does not redirect to /access");
  assert.match(
    stderr,
    /\/beta should resolve to \/access/,
    `stderr should explain bad legacy route redirect:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

console.log("check-public-posture tests passed.");
