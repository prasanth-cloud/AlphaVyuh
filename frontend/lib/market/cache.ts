type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const MARKET_CACHE_TTL_MS = 60 * 60 * 1000;
const marketCache = new Map<string, CacheEntry<unknown>>();

export function getCachedMarketData<T>(key: string): T | null {
  const entry = marketCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    marketCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCachedMarketData<T>(key: string, value: T, ttlMs = MARKET_CACHE_TTL_MS): T {
  marketCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}
