export function isDevMockWorkspaceEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true" &&
    (process.env.NEXT_PUBLIC_DATA_MODE === "mock" ||
      process.env.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK === "true")
  );
}

export function safeInternalNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
