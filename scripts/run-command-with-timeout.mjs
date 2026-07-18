#!/usr/bin/env node
import { spawn } from "node:child_process";

function fail(message) {
  console.error(message);
  process.exit(2);
}

const separator = process.argv.indexOf("--");
if (separator === -1 || separator === process.argv.length - 1) {
  fail("Usage: run-command-with-timeout.mjs --name <label> --timeout <seconds> -- <command> [args...]");
}

const options = process.argv.slice(2, separator);
const command = process.argv[separator + 1];
const args = process.argv.slice(separator + 2);
let name = command;
let timeoutSeconds = 900;

for (let index = 0; index < options.length; index += 2) {
  const key = options[index];
  const value = options[index + 1];
  if (!value) fail(`Missing value for ${key ?? "option"}`);
  if (key === "--name") name = value;
  else if (key === "--timeout") timeoutSeconds = Number(value);
  else fail(`Unknown option: ${key}`);
}

if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  fail("--timeout must be a positive number of seconds");
}

const detached = process.platform !== "win32";
const child = spawn(command, args, {
  stdio: "inherit",
  detached,
});

let timedOut = false;
let forceKillTimer;

function terminate(signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (detached && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

const timeout = setTimeout(() => {
  timedOut = true;
  console.error(`[launch timeout] ${name} exceeded ${timeoutSeconds} seconds; terminating process group.`);
  terminate("SIGTERM");
  forceKillTimer = setTimeout(() => terminate("SIGKILL"), 5_000);
  forceKillTimer.unref();
}, timeoutSeconds * 1_000);

function forward(signal) {
  terminate(signal);
}

process.once("SIGINT", () => forward("SIGINT"));
process.once("SIGTERM", () => forward("SIGTERM"));

child.once("error", (error) => {
  clearTimeout(timeout);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  console.error(`[launch runner] Failed to start ${name}: ${error.message}`);
  process.exitCode = 127;
});

child.once("exit", (code, signal) => {
  clearTimeout(timeout);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  if (timedOut) {
    process.exitCode = 124;
    return;
  }
  if (code !== null) {
    process.exitCode = code;
    return;
  }
  console.error(`[launch runner] ${name} exited from signal ${signal ?? "unknown"}.`);
  process.exitCode = 1;
});
