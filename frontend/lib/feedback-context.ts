const SENSITIVE_QUERY_KEYS = new Set([
  "code",
  "request_token",
  "state",
  "signature",
  "razorpay_signature",
]);

const SENSITIVE_KEY_FRAGMENTS = [
  "token",
  "secret",
  "password",
  "authorization",
  "api_key",
  "apikey",
  "signature",
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return SENSITIVE_QUERY_KEYS.has(normalized) || SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function redactSensitiveFeedbackUrl(value: string): string {
  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
  let url: URL;
  try {
    url = new URL(value, "https://alphavyuh.local");
  } catch {
    return value;
  }

  for (const key of Array.from(url.searchParams.keys())) {
    if (isSensitiveKey(key)) {
      url.searchParams.set(key, "[redacted]");
    }
  }

  if (isAbsolute) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

export function currentFeedbackHref(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  return redactSensitiveFeedbackUrl(window.location.href);
}
