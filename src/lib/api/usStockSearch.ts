import type { UsStockEntry } from '$lib/catalog/usStocks';

/** Yahoo Finance canlı arama sonucu — tek bir hisse kaydı. */
export interface UsSearchResult {
  symbol: string;
  name: string;
}

/** `/api/usSearch?q=...` proxy endpoint yanıtı. */
interface UsSearchResponse {
  results: UsSearchResult[];
}

/** Yahoo Finance canlı araması (server-side proxy üzerinden).
 *  Hata durumunda throw etmez — `[]` döner (UI'ı kırmaz).
 *  `fetchFn` enjekte edilebilir (test desteği). */
export async function searchUsStocksLive(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<UsStockEntry[]> {
  const q = query.trim();
  if (q === '') return [];
  try {
    const res = await fetchFn(`/api/usSearch?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const body = (await res.json()) as UsSearchResponse;
    return (body.results ?? []).map((r) => ({ symbol: r.symbol, name: r.name }));
  } catch {
    return [];
  }
}
