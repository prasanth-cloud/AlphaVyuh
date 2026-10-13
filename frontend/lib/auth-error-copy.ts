const SERVICE_RESTRICTION_MARKERS = [
  "exceed_db_size_quota",
  "restricted due to the following violations",
  "remove spend caps",
  "upgrade their plan",
];

const INVALID_CREDENTIAL_MARKERS = [
  "invalid login credentials",
  "invalid credentials",
  "invalid email or password",
];

export const AUTH_SERVICE_RESTRICTED_MESSAGE =
  "Account access is temporarily unavailable while AlphaVyuh restores production service. No password change is needed.";

export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  "Account access is temporarily unavailable. Please try again shortly. No password change is needed.";

export const AUTH_EMAIL_NOT_CONFIRMED_MESSAGE =
  "Confirm your email before signing in. You can request a fresh confirmation link.";

function getAuthErrorDetails(error: unknown) {
  const record = typeof error === "object" && error !== null ? error : null;
  return {
    message: (record && "message" in record && typeof record.message === "string"
      ? record.message : typeof error === "string" ? error : "").toLowerCase(),
    code: record && "code" in record && typeof record.code === "string" ? record.code : "",
    name: record && "name" in record && typeof record.name === "string" ? record.name : "",
    status: record && "status" in record && typeof record.status === "number" ? record.status : 0,
  };
}

export function getAuthErrorStatus(error: unknown, fallback: number) {
  const { message, code, name, status } = getAuthErrorDetails(error);
  if (SERVICE_RESTRICTION_MARKERS.some((marker) => message.includes(marker))) return 503;
  if (status >= 500 || status === 408 || code === "unexpected_failure" || code === "request_timeout"
    || name === "AuthRetryableFetchError") return 503;
  if (status === 429 || ["over_request_rate_limit", "over_email_send_rate_limit", "over_sms_send_rate_limit"].includes(code)
    || message.includes("rate limit") || message.includes("too many requests")) return 429;
  return fallback;
}

export function isDuplicateAuthAccountError(error: unknown) {
  const { code, message } = getAuthErrorDetails(error);
  return ["user_already_exists", "email_exists"].includes(code)
    || message.includes("already registered") || message.includes("already exists");
}

export function isUnconfirmedAuthEmailError(error: unknown) {
  const { code, message } = getAuthErrorDetails(error);
  return code === "email_not_confirmed" || message.includes("email not confirmed");
}

export function isNeutralAuthResendError(error: unknown) {
  const { code, message } = getAuthErrorDetails(error);
  return isDuplicateAuthAccountError(error) || code === "user_not_found"
    || message.includes("already confirmed") || message.includes("user not found")
    || message.includes("email not found");
}

export function getSafeAuthErrorMessage(error: unknown, fallback: string) {
  const { message, code } = getAuthErrorDetails(error);

  if (SERVICE_RESTRICTION_MARKERS.some((marker) => message.includes(marker))) {
    return AUTH_SERVICE_RESTRICTED_MESSAGE;
  }

  const status = getAuthErrorStatus(error, 400);
  if (status === 503) return AUTH_SERVICE_UNAVAILABLE_MESSAGE;
  if (status === 429) return "Please wait a minute before trying again.";
  if (isUnconfirmedAuthEmailError(error)) return AUTH_EMAIL_NOT_CONFIRMED_MESSAGE;

  if (code === "invalid_credentials" || INVALID_CREDENTIAL_MARKERS.some((marker) => message.includes(marker))) {
    return "Invalid email or password.";
  }

  return fallback;
}
