#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflowPath = process.env.DAILY_REFRESH_WORKFLOW_PATH || ".github/workflows/daily-refresh.yml";

function fail(message) {
  console.error(`Daily refresh workflow safety check failed: ${message}`);
  process.exit(1);
}

function runBlocks(body) {
  const lines = body.split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*\|/);
    if (!match) continue;
    const indent = match[1].length;
    const block = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() && (line.match(/^(\s*)/)?.[1].length ?? 0) <= indent) break;
      block.push(line);
      index = cursor;
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}

if (!existsSync(workflowPath)) {
  fail(`workflow not found: ${workflowPath}`);
}

const body = readFileSync(workflowPath, "utf8");
const blocks = runBlocks(body);
const runText = blocks.join("\n");

for (const block of blocks) {
  if (block.includes("${{ github.event.inputs.") || block.includes("${{ inputs.")) {
    fail("workflow_dispatch inputs must be bridged through env and not interpolated directly into shell run blocks");
  }
}

const requiredSnippets = [
  "INPUT_DATE: ${{ github.event.inputs.date || '' }}",
  "INPUT_YFINANCE_ONLY: ${{ github.event.inputs.yfinance_only || 'false' }}",
  "INPUT_DRY_RUN: ${{ github.event.inputs.dry_run || 'false' }}",
  '[[ ! "$INPUT_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]',
  'ARGS=(--yfinance-limit "${YFINANCE_LIMIT:-60}" --yfinance-time-budget-s "${YFINANCE_TIME_BUDGET_S:-180}")',
  'python scripts/daily_refresh.py "${ARGS[@]}"',
];

for (const snippet of requiredSnippets) {
  if (!body.includes(snippet) && !runText.includes(snippet)) {
    fail(`missing required safety snippet: ${snippet}`);
  }
}

console.log("Daily refresh workflow safety ok: dispatch inputs are validated as data before shell use.");
