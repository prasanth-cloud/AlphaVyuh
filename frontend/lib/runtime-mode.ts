export function hasSupabasePublicEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function allowDevMockAuth() {
  return process.env.NODE_ENV !== "production" &&
    process.env.PLAYWRIGHT_MOCK_AUTH === "true" &&
    process.env.NEXT_PUBLIC_DATA_MODE === "mock";
}

export function allowPreviewMockAuth() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true" &&
    !hasSupabasePublicEnv();
}

export function allowMockAppAuth() {
  return allowDevMockAuth() || allowPreviewMockAuth();
}

export function allowClientMockFallback() {
  return process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true" &&
    (process.env.NEXT_PUBLIC_DATA_MODE === "mock" ||
      process.env.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK === "true" ||
      process.env.NODE_ENV === "development" ||
      !hasSupabasePublicEnv());
}
