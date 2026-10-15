#!/usr/bin/env node
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const workflow = readFileSync(join(root, ".github/workflows/check-migration-drift.yml"), "utf8");
const plan = spawnSync("bash", ["scripts/check-new-project-schema.sh", "--plan"], {
  cwd: root, env: { PATH: process.env.PATH }, encoding: "utf8",
});
assert.equal(plan.status, 0, plan.stderr);
const files = plan.stdout.trim().split("\n").map((line) => line.split(" ")[1]);
const history = files.map((file) => ({ version: file.split("_")[0], name: file.slice(file.indexOf("_") + 1, -4) }));
const added = files.at(-1);
const marker = "<!-- migration-applied-to-prod -->";
const syntheticToken = "unit-test-not-a-real-management-token";

function runBlock(name) {
  const section = workflow.split(`      - name: ${name}\n`)[1]?.split(/\n      - (?:name|uses):/)[0];
  const block = section?.split("        run: |\n")[1];
  assert.ok(block, `Missing workflow shell step: ${name}`);
  return block.split("\n").map((line) => line.replace(/^ {10}/, "")).join("\n")
    .replaceAll("${{ github.base_ref }}", "main")
    .replaceAll("${{ github.event.pull_request.number }}", "123");
}

function outputs(path) {
  const result = {};
  const lines = readFileSync(path, "utf8").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const multiline = lines[index].match(/^(\w+)<<(\w+)$/);
    if (multiline) {
      const values = [];
      while (lines[++index] !== multiline[2] && index < lines.length) values.push(lines[index]);
      result[multiline[1]] = values.join("\n");
    } else {
      const equals = lines[index].indexOf("=");
      if (equals > 0) result[lines[index].slice(0, equals)] = lines[index].slice(equals + 1);
    }
  }
  return result;
}

function fixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), "alphavyuh-migration-drift-"));
  try { return callback(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

function runComparator(payload, localPlan = plan.stdout) {
  return fixture((directory) => {
    const planFile = join(directory, "plan.txt");
    const historyFile = join(directory, "history.json");
    writeFileSync(planFile, localPlan);
    writeFileSync(historyFile, typeof payload === "string" ? payload : JSON.stringify(payload));
    return spawnSync(process.execPath, ["scripts/check-migration-drift.mjs", planFile, historyFile], {
      cwd: root, env: { PATH: process.env.PATH }, encoding: "utf8",
    });
  });
}

function runWorkflow(payload, { status = "200", token = syntheticToken, body = marker, curlExit = "0", ghExit = "0" } = {}) {
  return fixture((directory) => {
    const historyFile = join(directory, "fixture.json");
    const bodyFile = join(directory, "body.txt");
    const outputFile = join(directory, "outputs.txt");
    const urlFile = join(directory, "requested-url.txt");
    writeFileSync(historyFile, typeof payload === "string" ? payload : JSON.stringify(payload));
    writeFileSync(bodyFile, body);
    writeFileSync(outputFile, "");
    writeFileSync(join(directory, "curl"), `#!/bin/sh
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|--output) destination="$2"; shift ;;
    https://*) printf '%s' "$1" > "$FIXTURE_URL" ;;
  esac
  shift
done
cp "$FIXTURE_HISTORY" "$destination"
printf '%s' "$FIXTURE_STATUS"
exit "$FIXTURE_CURL_EXIT"
`, { mode: 0o755 });
    writeFileSync(join(directory, "gh"), '#!/bin/sh\n[ "$FIXTURE_GH_EXIT" = 0 ] || exit "$FIXTURE_GH_EXIT"\ncat "$FIXTURE_BODY"\n', { mode: 0o755 });
    const env = {
      PATH: `${directory}:${process.env.PATH}`, RUNNER_TEMP: directory, GITHUB_OUTPUT: outputFile,
      SUPABASE_ACCESS_TOKEN: token, FIXTURE_HISTORY: historyFile, FIXTURE_BODY: bodyFile,
      FIXTURE_STATUS: status, FIXTURE_URL: urlFile, FIXTURE_CURL_EXIT: curlExit, FIXTURE_GH_EXIT: ghExit,
    };
    const count = spawnSync("bash", ["-e", "-o", "pipefail", "-c", runBlock("Get prod migration count")], { cwd: root, env, encoding: "utf8" });
    const values = outputs(outputFile);
    let evidence;
    if (count.status === 0) {
      evidence = spawnSync("bash", ["-e", "-o", "pipefail", "-c", runBlock("Require migration evidence in PR description")], {
        cwd: root, encoding: "utf8", env: {
          ...env, ADDED_FILES: added, LOCAL_COUNT: values.local_count ?? "",
          REMOTE_COUNT: values.remote_count ?? "", REMOTE_VERSIONS: values.remote_versions ?? "",
          LOCAL_PLAN: values.local_plan ?? "", REMOTE_HISTORY_PATH: values.remote_history_path ?? "",
        },
      });
    }
    const text = count.stdout + count.stderr + (evidence?.stdout ?? "") + (evidence?.stderr ?? "");
    assert.ok(!text.includes(syntheticToken), "The workflow must not print its management token");
    return {
      status: count.status || evidence?.status || 0, values, text,
      url: token ? readFileSync(urlFile, "utf8") : "",
    };
  });
}

test("canonical inventory includes historical stubs and both dependency moves", () => {
  assert.equal(files.length, readdirSync(join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).length);
  assert.ok(files.includes("030_vcp_lookback_initial_stub.sql"));
  assert.ok(files.includes("031_vcp_lookback_optimise_stub.sql"));
  assert.ok(files.indexOf("041_schema_provenance_normalise.sql") < files.indexOf("037_chart_workspaces.sql"));
  assert.ok(files.indexOf("20260505014955_workflow_state.sql") < files.indexOf("039_journal_idea_context.sql"));
});

test("workflow rejects missing historical stub even while added versions are present", () => {
  assert.notEqual(runWorkflow(history.filter((item) => item.version !== "031")).status, 0);
});

test("workflow rejects an equal-size history that replaced a canonical version", () => {
  const replaced = history.map((item) => item.version === "001" ? { version: "99999999999999" } : item);
  assert.notEqual(runWorkflow(replaced).status, 0);
});

test("workflow rejects bare evidence text without the literal marker", () => {
  assert.notEqual(runWorkflow(history, { body: "No migration-applied-to-prod evidence supplied." }).status, 0);
});

test("workflow targets new production and counts all canonical versions", () => {
  const result = runWorkflow([...history].reverse());
  assert.equal(result.status, 0, result.text);
  assert.equal(result.url, "https://api.supabase.com/v1/projects/yodgbbrughcolslrnvqe/database/migrations");
  assert.equal(result.values.local_count, String(files.length));
});

test("comparator accepts shuffled canonical history and preserves allowed remote extras", () => {
  for (const payload of [[...history].reverse(), [...history, { version: "99999999999999" }]]) {
    const result = runComparator(payload);
    assert.equal(result.status, 0, result.stderr);
  }
});

const invalidHistories = {
  "empty history": [], "non-array history": { migrations: history }, "invalid JSON": "not JSON",
  "missing version": [...history, { name: "sensitive fixture detail" }],
  "numeric version": history.map((item) => item.version === "003" ? { version: 3 } : item),
  "lost leading zero": history.map((item) => item.version === "003" ? { version: "3" } : item),
  "duplicate history": [...history, history[0]], "null item": [...history, null],
  "non-numeric version": [...history, { version: "private fixture detail" }],
};
for (const [label, payload] of Object.entries(invalidHistories)) {
  test(`comparator fails closed on ${label}`, () => {
    const result = runComparator(payload);
    assert.notEqual(result.status, 0);
    assert.ok(!result.stderr.includes("fixture detail"));
  });
}

test("comparator rejects empty, malformed, and duplicate local plans", () => {
  const first = plan.stdout.split("\n")[0];
  for (const localPlan of ["", "invalid plan", `${plan.stdout}${first.replace(/^01 /, `${String(files.length + 1).padStart(2, "0")} `)}\n`]) {
    assert.notEqual(runComparator(history, localPlan).status, 0);
  }
});

for (const [label, options] of Object.entries({
  "missing token": { token: "" }, "expired token": { status: "401" }, "forbidden token": { status: "403" },
  "API failure": { status: "500" }, "rate limit": { status: "429" }, "transport failure": { curlExit: "28" },
  "missing evidence": { body: "" }, "PR lookup failure": { ghExit: "1" },
})) {
  test(`workflow fails closed on ${label}`, () => assert.notEqual(runWorkflow(history, options).status, 0));
}

test("workflow rejects malformed successful API responses", () => {
  for (const payload of ["invalid JSON", { migrations: history }, [...history, history[0]]]) {
    assert.notEqual(runWorkflow(payload).status, 0);
  }
});

for (const change of ["M", "R", "D"]) {
  test(`append-only detection catches ${change} migration changes`, () => fixture((directory) => {
    const outputFile = join(directory, "outputs.txt");
    writeFileSync(outputFile, "");
    writeFileSync(join(directory, "git"), `#!/bin/sh
[ "$1" = fetch ] && exit 0
for argument in "$@"; do
  case "$argument" in --diff-filter=*) flags="\${argument#*=}" ;; esac
done
case "$flags" in *"$FIXTURE_CHANGE"*) printf '%s\\n' 'supabase/migrations/001_users.sql' ;; esac
`, { mode: 0o755 });
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", runBlock("Detect migration changes")], {
      cwd: root, encoding: "utf8", env: {
        PATH: `${directory}:${process.env.PATH}`, GITHUB_OUTPUT: outputFile, FIXTURE_CHANGE: change,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(outputs(outputFile).has_modified, "true");
  }));
}
