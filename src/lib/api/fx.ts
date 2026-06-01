import type { Cached, FxValue } from './types';

export interface FxSnapshotOptions {
  bist?: string[];        // özel BIST sembolleri (yoksa proxy varsayılan setini kullanır)
  fetchFn?: typeof fetch; // enjekte edilebilir (test)
}

/** Yahoo proxy'sinden (sunucu 5s cache'li) güncel FX anlık görüntüsünü çeker.
 *  Zarfı (`value`/`asOf`/`stale`) aynen yüzeyler — store "veri eski" rozetini buradan türetir. */
export async function fetchFxSnapshot(opts: FxSnapshotOptions = {}): Promise<Cached<FxValue>> {
  const fetchFn = opts.fetchFn ?? fetch;
  const qs = opts.bist?.length ? `?bist=${opts.bist.join(',')}` : '';
  const res = await fetchFn(`/api/yahoo${qs}`);
  if (!res.ok) throw new Error(`/api/yahoo: HTTP ${res.status}`);
  return (await res.json()) as Cached<FxValue>;
}
