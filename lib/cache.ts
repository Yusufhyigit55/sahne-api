type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<any>>();

// Bellek şişmesin diye üst sınır
const MAX_ENTRIES = 500;

/** Önbellekten oku. Yoksa veya süresi dolmuşsa null. */
export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }

  return entry.value as T;
}

/** Önbelleğe yaz. ttl = saniye cinsinden yaşam süresi. */
export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  // Sınıra ulaşıldıysa en eskiyi at
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }

  store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Önbellekli çağrı sarmalayıcısı.
 * Varsa önbellekten döner, yoksa fn'i çalıştırıp önbelleğe yazar.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;

  const value = await fn();
  cacheSet(key, value, ttlSeconds);
  return value;
}

/** Belirli bir öneki olan tüm kayıtları sil. */
export function cacheInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}