const DEFAULT_QA_EMAIL = "qa.smoke@alphavyuh.local";

function normalizeEmail(value) {
  return String(value || DEFAULT_QA_EMAIL).trim().toLowerCase() || DEFAULT_QA_EMAIL;
}

function normalizeSlug(value, fallback, maxLength = 32) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return slug || fallback;
}

function isRunScopedEmailEnabled(env = process.env) {
  const raw = String(env.PLAYWRIGHT_QA_EMAIL_UNIQUE_PER_RUN ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return String(env.GITHUB_ACTIONS || "").toLowerCase() === "true";
}

function plusAddress(email, tag) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return normalized;

  const domain = normalized.slice(atIndex + 1);
  const baseLocal = normalized.slice(0, atIndex).split("+")[0] || "qa";
  const suffix = `+${tag}`;
  const localLimit = Math.max(1, 64 - suffix.length);
  return `${baseLocal.slice(0, localLimit)}${suffix}@${domain}`;
}

export function resolveProductionSmokeQaEmail(rawEmail, env = process.env) {
  const baseEmail = normalizeEmail(rawEmail);
  if (!isRunScopedEmailEnabled(env)) return baseEmail;

  const runId = normalizeSlug(env.GITHUB_RUN_ID || env.CI_RUN_ID, "");
  if (!runId) return baseEmail;

  const workflow = normalizeSlug(env.GITHUB_WORKFLOW, "workflow", 28);
  const attempt = normalizeSlug(env.GITHUB_RUN_ATTEMPT || "1", "1", 4);
  return plusAddress(baseEmail, `${workflow}-${runId}-${attempt}`);
}
