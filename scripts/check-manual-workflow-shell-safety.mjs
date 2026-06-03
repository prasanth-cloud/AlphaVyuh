#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const workflowPaths = (
  process.env.MANUAL_WORKFLOW_SHELL_SAFETY_PATHS
  || ".github/workflows/benchmark-vcp.yml,.github/workflows/daily-refresh.yml"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runBlocks(body) {
  const lines = body.split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*\|/);
    if (!match) continue;
    const indent = match[1].length;
    const startLine = index + 1;
    const block = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() && line.match(/^(\s*)/)?.[1].length <= indent) break;
      block.push(line);
      index = cursor;
    }
    blocks.push({ startLine, text: block.join("\n") });
  }
  return blocks;
}

try {
  for (const workflowPath of workflowPaths) {
    assert(existsSync(workflowPath), `Workflow not found: ${workflowPath}`);
    const body = readFileSync(workflowPath, "utf8");
    assert(body.includes("workflow_dispatch:"), `${workflowPath} must stay manually auditable as a workflow_dispatch workflow.`);

    for (const block of runBlocks(body)) {
      assert(
        !block.text.includes("${{ github.event.inputs."),
        `${workflowPath} run block starting near line ${block.startLine} interpolates workflow_dispatch inputs directly into shell.`,
      );
      assert(
        !block.text.includes("${{ inputs."),
        `${workflowPath} run block starting near line ${block.startLine} interpolates inputs directly into shell.`,
      );
    }
  }

  console.log("Manual workflow shell safety ok: dispatch inputs are not interpolated directly into shell run blocks.");
} catch (error) {
  console.error(`Manual workflow shell safety check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
