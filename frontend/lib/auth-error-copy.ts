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

export function getSafeAuthErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  if (SERVICE_RESTRICTION_MARKERS.some((marker) => normalized.includes(marker))) {
    return AUTH_SERVICE_RESTRICTED_MESSAGE;
  }

  if (INVALID_CREDENTIAL_MARKERS.some((marker) => normalized.includes(marker))) {
    return "Invalid email or password.";
  }

  return fallback;
}
