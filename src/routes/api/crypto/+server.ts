import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createKeyedTtlFetchCache } from '$lib/api/cachedFetch';
import type { CryptoValue } from '$lib/api/types';
import { fetchCryptoValue, CRYPTO_FALLBACK, DEFAULT_COINS, CRYPTO_TTL_MS } from '$lib/api/cryptoSource';
import { parseSymbolList } from '$lib/api/symbolLimit';

/** Coin listesini normalize eder: dedupe + sort + join — sırası farklı istekler
 *  (`BTC,ETH` vs `ETH,BTC`) aynı cache key'ine düşsün (audit P1). */
function normalizeSymbols(list: readonly string[]): string {
  return Array.from(new Set(list)).sort().join(',');
}

// Coin-set-başına 5s TTL önbellek + inflight dedup (audit P1: parametreli istekler artık
// cache'i bypass etmiyor — tek kod yolu, ?coins= dahil).
const cache = createKeyedTtlFetchCache<CryptoValue>({
  ttlMs: CRYPTO_TTL_MS,
  fallback: CRYPTO_FALLBACK,
  fetcher: (key) => fetchCryptoValue(key ? key.split(',') : [], fetch),
});

export const GET: RequestHandler = async ({ url }) => {
  const hasParams = url.searchParams.has('coins');
  const coins = hasParams ? parseSymbolList(url.searchParams.get('coins')) : DEFAULT_COINS;
  const headers = { 'cache-control': 'public, max-age=5' };
  return json(await cache(normalizeSymbols(coins)), { headers });
};
