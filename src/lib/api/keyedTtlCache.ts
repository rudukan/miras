/** Sorgu bazlı (keyed) TTL önbelleği.
 *  Her benzersiz anahtar kendi slot'una sahip; kapasite dolunca en eski slot atılır (LRU-lite).
 *  Yahoo Finance arama endpoint'i için tasarlandı: farklı `q=` değerleri bağımsız cache'lenir.
 *  Saf + enjekte edilebilir (now?: () => number test desteği). */

export interface KeyedTtlCacheOptions {
  ttlMs: number;
  maxSize?: number;  // varsayılan 50 — dolunca en eski giriş atılır
  now?: () => number;
}

interface CacheSlot<T> {
  value: T;
  asOf: number;
}

export function createKeyedTtlCache<T>(
  opts: KeyedTtlCacheOptions,
): {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
} {
  const now = opts.now ?? Date.now;
  const maxSize = opts.maxSize ?? 50;
  const store = new Map<string, CacheSlot<T>>();

  return {
    get(key: string): T | undefined {
      const slot = store.get(key);
      if (!slot) return undefined;
      if (now() - slot.asOf >= opts.ttlMs) {
        store.delete(key);
        return undefined;
      }
      return slot.value;
    },
    set(key: string, value: T): void {
      // Kapasite doluysa en eski girişi at (Map insertion-order garantisi).
      if (store.size >= maxSize && !store.has(key)) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { value, asOf: now() });
    },
  };
}
