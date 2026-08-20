import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(
  ".github/workflows/check-migration-drift.yml",
  "utf8",
);

assert.match(
  workflow,
  /SUPABASE_URL:\s*\$\{\{ secrets\.SUPABASE_URL \}\}/,
  "migration drift must use the repository Supabase URL secret",
);
assert.match(
  workflow,
  /\[\[\s*"\$SUPABASE_URL"\s*=~\s*\^https:\/\/\(\[a-z0-9\]\+\)\\\.supabase\\\.co\/\?\$\s+\]\]/,
  "migration drift must validate and parse the Supabase project URL",
);
assert.match(
  workflow,
  /v1\/projects\/\$PROJECT_REF\/database\/migrations/,
  "migration drift must derive the management API project ref",
);
assert.doesNotMatch(
  workflow,
  /v1\/projects\/fyxltykqdvacbdgmeucf\/database\/migrations/,
  "migration drift must not hard-code a historical project ref",
);

console.log("check-migration-drift-workflow tests passed.");
