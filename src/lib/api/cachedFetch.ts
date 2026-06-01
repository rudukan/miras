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
