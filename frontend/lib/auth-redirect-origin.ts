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

export function getAuthRedirectOrigin(requestOrigin: string) {
  return normalizeOrigin(process.env.PUBLIC_SITE_URL)
    ?? normalizeOrigin(process.env.LIVE_URL)
    ?? normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL)
    ?? (process.env.NODE_ENV === "production" ? "https://www.alphavyuh.com" : requestOrigin);
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
