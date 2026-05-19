#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const defaultFiles = [
  "frontend/lib/agentMissionControl.ts",
  "frontend/app/(app)/_style-guide/page.tsx",
];

const forbidden = [
  { pattern: /Simplify workspace copy/i, label: "old workspace cleanup title" },
  { pattern: /workspace framing/i, label: "old workspace framing" },
  { pattern: /generic workspace/i, label: "generic workspace positioning" },
  { pattern: /chart workspace/i, label: "chart workspace positioning" },
  { pattern: /workspace tags/i, label: "workspace tag guidance" },
  { pattern: /SCANNER WORKSPACE/i, label: "uppercase workspace tag example" },
  { pattern: /Professional Access/i, label: "professional access branding" },
  { pattern: /\bprofessional\b/i, label: "professional-as-brand positioning" },
];

function filesToCheck() {
  const configured = process.env.SIGNED_IN_COPY_POSTURE_FILES;
  if (!configured) return defaultFiles;
  return configured
    .split(/[,\n]/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function snippet(text, index) {
  return text
    .slice(Math.max(0, index - 80), Math.min(text.length, index + 120))
    .replace(/\s+/g, " ");
}

try {
  const files = filesToCheck();
  if (files.length === 0) {
    throw new Error("No signed-in copy posture files configured.");
  }

  for (const file of files) {
    if (!existsSync(file)) {
      throw new Error(`Signed-in copy posture file not found: ${file}`);
    }

    const body = readFileSync(file, "utf8");
    for (const { pattern, label } of forbidden) {
      const match = body.match(pattern);
      if (match?.index !== undefined) {
        throw new Error(`${file} contains ${label} ${pattern}: ${snippet(body, match.index)}`);
      }
    }
  }

  console.log(`Signed-in copy posture ok: checked ${files.length} active operator source files.`);
} catch (error) {
  console.error(`Signed-in copy posture check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
