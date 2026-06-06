import { createClient } from '../supabase/client'
import { allowClientMockFallback } from '../runtime-mode'

const forceLiveData = process.env.NEXT_PUBLIC_FORCE_LIVE_DATA === "true";
export const liveQuotePollingEnabled =
  process.env.NEXT_PUBLIC_ENABLE_LIVE_QUOTES === "true";
export const isMockMode =
  !forceLiveData && allowClientMockFallback();

let tokenCache: { token: string | null; expiresAt: number } | null = null;
let tokenPromise: Promise<string | null> | null = null;
type ClientCacheEntry<T> = { value: T; expiresAt: number };
const clientCache = new Map<string, ClientCacheEntry<unknown>>();
const clientCachePromises = new Map<string, Promise<unknown>>();

function readClientCache<T>(key: string): T | null {
  const cached = clientCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.value as T;
}

function writeClientCache<T>(key: string, value: T, ttlMs: number): T {
  clientCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function cachedClientRequest<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = readClientCache<T>(key);
  if (cached !== null) return cached;

  const pending = clientCachePromises.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetcher()
    .then((value) => writeClientCache(key, value, ttlMs))
    .finally(() => {
      clientCachePromises.delete(key);
    });
  clientCachePromises.set(key, promise);
  return promise;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

export function invalidateClientCache(prefixes: string[]) {
  for (const key of clientCache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      clientCache.delete(key);
    }
  }
}

export function routeBackedE2eMocksEnabled(): boolean {
  if (
    typeof window === "undefined" ||
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_DATA_MODE !== "mock"
  ) {
    return false;
  }

  try {
    return window.localStorage.getItem("alphavyuh-e2e-route-mocks") === "true";
  } catch {
    return false;
  }
}

export function shouldUseMockFallback(): boolean {
  if (routeBackedE2eMocksEnabled()) return false;

  return isMockMode;
}

async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const sb = createClient()
      const { data } = await sb.auth.getSession()
      const token = data.session?.access_token ?? null
      tokenCache = { token, expiresAt: Date.now() + 30_000 }
      return token
    } catch {
      tokenCache = { token: null, expiresAt: Date.now() + 5_000 }
      return null
    } finally {
      tokenPromise = null
    }
  })();

  return tokenPromise;
}

export function clearAuthHeaderCache() {
  tokenCache = null;
  tokenPromise = null;
  clientCache.clear();
  clientCachePromises.clear();
}

export async function authHeaders(): Promise<HeadersInit> {
  const token = await getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function responseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
  return fallback;
}

export function unavailablePayloadMessage(data: unknown, fallback: string): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { mode?: unknown; status?: unknown; message?: unknown; detail?: unknown };
  if (payload.mode !== "unavailable" && payload.status !== "unavailable") return null;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail;
  return fallback;
}
