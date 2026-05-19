#!/usr/bin/env node

const required = [
  "PRODUCTION_API_BEARER_TOKEN",
  "PLAYWRIGHT_QA_EMAIL",
  "PLAYWRIGHT_QA_PASSWORD",
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (missing.length > 0) {
  console.error(`Production signed-in smoke is missing required environment values: ${missing.join(", ")}.`);
  console.error("Provide a short-lived production API smoke token and signed-in QA credentials before running the full production recovery gate.");
  process.exit(1);
}

console.log("Production signed-in smoke env ok: API token and QA login values are present.");
