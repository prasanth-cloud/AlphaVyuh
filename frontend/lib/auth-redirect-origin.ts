import { isSafeRedirect } from "@/lib/safe-redirect";

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeVercelPreviewOrigin(value: string | undefined) {
  const generatedHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/i;
  if (!value || value !== value.trim()) return null;
  if (!value.startsWith("https://") && !generatedHost.test(value)) return null;
  try {
    const url = new URL(value.startsWith("https://") ? value : `https://${value}`);
    if (url.protocol !== "https:" || !generatedHost.test(url.hostname)
      || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getAuthRedirectOrigin(requestOrigin: string) {
  const configuredOrigin = normalizeOrigin(process.env.PUBLIC_SITE_URL)
    ?? normalizeOrigin(process.env.LIVE_URL)
    ?? normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configuredOrigin) return configuredOrigin;

  if (process.env.VERCEL_ENV === "preview") {
    const deploymentOrigin = normalizeVercelPreviewOrigin(process.env.VERCEL_URL);
    const branchOrigin = normalizeVercelPreviewOrigin(process.env.VERCEL_BRANCH_URL);
    const previewRequestOrigin = normalizeVercelPreviewOrigin(requestOrigin);
    // PKCE cookies stay on the exact trusted host that initiated signup.
    if (previewRequestOrigin && [deploymentOrigin, branchOrigin].includes(previewRequestOrigin)) {
      return previewRequestOrigin;
    }
    return deploymentOrigin ?? branchOrigin ?? "https://www.alphavyuh.com";
  }

  return process.env.NODE_ENV === "production" ? "https://www.alphavyuh.com" : requestOrigin;
}

export function resolveAuthCallbackNext(
  requestedNext: string | null | undefined,
  redirectOrigin: string,
  fallback = "/dashboard",
) {
  if (isSafeRedirect(requestedNext)) return requestedNext;
  if (!requestedNext) return fallback;

  try {
    const redirectUrl = new URL(requestedNext);
    if (redirectUrl.origin !== redirectOrigin || redirectUrl.pathname !== "/auth/callback") {
      return fallback;
    }
    const nestedNext = redirectUrl.searchParams.get("next");
    return isSafeRedirect(nestedNext) ? nestedNext : fallback;
  } catch {
    return fallback;
  }
}
