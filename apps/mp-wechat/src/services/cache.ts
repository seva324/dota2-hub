import Taro from '@tarojs/taro';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function readCache<T>(key: string): T | null {
  try {
    const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memoryEntry && Date.now() <= memoryEntry.expiresAt) {
      return memoryEntry.value;
    }

    const entry = Taro.getStorageSync(key) as CacheEntry<T> | undefined;
    if (!entry || !entry.value || typeof entry.expiresAt !== 'number') {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
      Taro.removeStorageSync(key);
      return null;
    }
    memoryCache.set(key, entry as CacheEntry<unknown>);
    return entry.value;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T, ttlMs: number): void {
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
  };

  memoryCache.set(key, entry as CacheEntry<unknown>);

  try {
    Taro.setStorageSync(key, entry satisfies CacheEntry<T>);
  } catch {
    // Ignore storage failures and keep network fetches working.
  }
}

export function removeCache(key: string): void {
  memoryCache.delete(key);
  try {
    Taro.removeStorageSync(key);
  } catch {
    // Ignore storage failures.
  }
}
