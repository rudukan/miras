import type { Cached } from './types';

export interface TtlCacheOptions<T> {
  ttlMs: number;
  fallback: T;
  fetcher: () => Promise<T>;
  now?: () => number; // enjekte edilebilir saat (test determinizmi)
}

/** TTL'li, hata-toleranslı önbellek. TTL içinde son başarılı değeri çağrısız döner;
 *  süresi dolunca fetcher'ı dener. Başarısızsa son-bilinen değeri `stale:true` ile,
 *  hiç başarı yoksa `fallback`'i `stale:true` ile döner. Hatalar cache'lenmez (her
 *  çağrıda yeniden denenir). Eşzamanlı çağrılar aynı uçuştaki (inflight) çekimi
 *  paylaşır — thundering herd önlenir, 5s server-cache garantisi korunur.
 *  Saf + enjekte edilebilir. */
export function createTtlCache<T>(opts: TtlCacheOptions<T>): () => Promise<Cached<T>> {
  const now = opts.now ?? Date.now;
  let value: T = opts.fallback;
  let asOf = 0;
  let everSucceeded = false;
  let inflight: Promise<T> | null = null;

  return async function get(): Promise<Cached<T>> {
    if (everSucceeded && now() - asOf < opts.ttlMs) {
      return { value, asOf, stale: false };
    }
    try {
      // Eşzamanlı çağrılar tek çekimi paylaşır (thundering herd önlenir, 5s cache korunur).
      if (!inflight) inflight = opts.fetcher();
      const fetched = await inflight;
      value = fetched;
      asOf = now();
      everSucceeded = true;
      return { value, asOf, stale: false };
    } catch {
      return { value, asOf, stale: true };
    } finally {
      inflight = null;
    }
  };
}

export interface KeyedTtlFetchCacheOptions<T> {
  ttlMs: number;
  fallback: T;
  maxKeys?: number; // varsayılan 64
  fetcher: (key: string) => Promise<T>;
  now?: () => number;
}

/** `createTtlCache`'i key-başına saran sınırlı (bounded) önbellek. Her benzersiz key kendi
 *  TTL/inflight/stale semantiğine sahip bağımsız `createTtlCache` örneğine sahiptir. Kapasite
 *  (`maxKeys`) dolunca en az yakın zamanda ERİŞİLEN (LRU) key düşer — her `get(key)` çağrısı
 *  Map'te o key'i sona taşıyarak (delete + set) tazelenir, salt insertion-order değil. */
export function createKeyedTtlFetchCache<T>(
  opts: KeyedTtlFetchCacheOptions<T>,
): (key: string) => Promise<Cached<T>> {
  const maxKeys = opts.maxKeys ?? 64;
  const entries = new Map<string, () => Promise<Cached<T>>>();

  return function get(key: string): Promise<Cached<T>> {
    let entry = entries.get(key);
    if (entry) {
      // LRU tazeleme: mevcut key'i Map'in sonuna taşı (en son erişilen = en az "eski").
      entries.delete(key);
    } else {
      entry = createTtlCache<T>({
        ttlMs: opts.ttlMs,
        fallback: opts.fallback,
        fetcher: () => opts.fetcher(key),
        now: opts.now,
      });
      if (entries.size >= maxKeys) {
        // Map insertion-order garantisi: ilk key = en az yakın zamanda erişilen (LRU tazeleme sayesinde).
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
    }
    entries.set(key, entry);
    return entry();
  };
}
