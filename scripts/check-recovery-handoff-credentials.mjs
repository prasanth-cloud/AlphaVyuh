#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const defaultFiles = [
  "AGENTS/README.md",
  "AGENTS/data.md",
  "AGENTS/deploy.md",
  "AGENTS/qa.md",
  "AGENTS/REQUESTS.md",
  "docs/environments.md",
  "docs/release-readiness.md",
  "docs/customer-launch-runbook.md",
];

const requiredNames = [
  "PRODUCTION_API_BEARER_TOKEN",
  "PLAYWRIGHT_QA_EMAIL",
  "PLAYWRIGHT_QA_PASSWORD",
  "RUN_PRODUCTION_RECOVERY_SMOKE=1",
];

function filesToCheck() {
  const configured = process.env.RECOVERY_HANDOFF_FILES;
  if (!configured) return defaultFiles;
  return configured
    .split(/[,\n]/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function snippet(text, index) {
  return text
    .slice(Math.max(0, index - 80), Math.min(text.length, index + 160))
    .replace(/\s+/g, " ");
}

function gateOccurrences(body) {
  const marker = "RUN_PRODUCTION_RECOVERY_SMOKE=1";
  const indexes = [];
  let start = 0;
  while (start < body.length) {
    const index = body.indexOf(marker, start);
    if (index === -1) break;
    indexes.push(index);
    start = index + marker.length;
  }
  return indexes;
}

function fenceIndexes(body) {
  const indexes = [];
  let start = 0;
  while (start < body.length) {
    const index = body.indexOf("```", start);
    if (index === -1) break;
    indexes.push(index);
    start = index + 3;
  }
  return indexes;
}

function occurrenceContext(body, index) {
  const fences = fenceIndexes(body);
  const precedingFences = fences.filter((fenceIndex) => fenceIndex < index);
  if (precedingFences.length % 2 === 1) {
    const open = precedingFences[precedingFences.length - 1];
    const close = fences.find((fenceIndex) => fenceIndex > index) ?? body.length;
    return body.slice(open, close);
  }

  const before = body.slice(0, index);
  const after = body.slice(index);
  const paragraphStart = Math.max(before.lastIndexOf("\n\n"), before.lastIndexOf("\r\n\r\n"));
  const paragraphEndCandidates = [after.indexOf("\n\n"), after.indexOf("\r\n\r\n")]
    .filter((candidate) => candidate >= 0);
  const paragraphEnd = paragraphEndCandidates.length > 0
    ? index + Math.min(...paragraphEndCandidates)
    : body.length;

  return body.slice(paragraphStart >= 0 ? paragraphStart : 0, paragraphEnd);
}

try {
  const files = filesToCheck();
  if (files.length === 0) {
    throw new Error("No recovery handoff files configured.");
  }

  for (const file of files) {
    if (!existsSync(file)) {
      throw new Error(`Recovery handoff file not found: ${file}`);
    }

    const body = readFileSync(file, "utf8");
    for (const gateIndex of gateOccurrences(body)) {
      const context = occurrenceContext(body, gateIndex);
      const missing = requiredNames.filter((name) => !context.includes(name));
      if (missing.length === 0) continue;
      throw new Error(
        `${file} documents the production recovery gate without required credential names: ${missing.join(", ")}. ` +
        `Context: ${snippet(body, gateIndex)}`,
      );
    }
  }

  console.log(`Recovery handoff credential docs ok: checked ${files.length} active files.`);
} catch (error) {
  console.error(`Recovery handoff credential check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
