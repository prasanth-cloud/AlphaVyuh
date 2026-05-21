#!/usr/bin/env node

const required = [
  "PRODUCTION_API_BEARER_TOKEN",
  "PLAYWRIGHT_QA_EMAIL",
  "PLAYWRIGHT_QA_PASSWORD",
  "PLAYWRIGHT_SUPABASE_AUTH_COOKIES",
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (missing.length > 0) {
  console.error(`Production signed-in smoke is missing required environment values: ${missing.join(", ")}.`);
  console.error("Provide a short-lived production API smoke token and signed-in QA credentials before running the full production recovery gate.");
  process.exit(1);
}

try {
  const cookies = JSON.parse(process.env.PLAYWRIGHT_SUPABASE_AUTH_COOKIES);
  if (!Array.isArray(cookies) || cookies.length === 0 || cookies.some((cookie) => !cookie?.name || !cookie?.value)) {
    throw new Error("expected a non-empty array of cookie names and values");
  }
} catch (error) {
  console.error(`Production signed-in smoke has invalid PLAYWRIGHT_SUPABASE_AUTH_COOKIES: ${error instanceof Error ? error.message : String(error)}.`);
  process.exit(1);
}

console.log("Production signed-in smoke env ok: API token, QA login values, and Supabase session cookies are present.");
