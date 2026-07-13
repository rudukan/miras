import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTtlCache } from '$lib/api/cachedFetch';
import type { CryptoValue } from '$lib/api/types';
import { fetchCryptoValue, CRYPTO_FALLBACK, DEFAULT_COINS, CRYPTO_TTL_MS } from '$lib/api/cryptoSource';
import { parseSymbolList } from '$lib/api/symbolLimit';

const cache = createTtlCache<CryptoValue>({
  ttlMs: CRYPTO_TTL_MS,
  fallback: CRYPTO_FALLBACK,
  fetcher: () => fetchCryptoValue(DEFAULT_COINS, fetch),
});

export const GET: RequestHandler = async ({ url }) => {
  const coinsParam = url.searchParams.get('coins');
  const headers = { 'cache-control': 'public, max-age=5' };

  if (coinsParam) {
    const coins = parseSymbolList(coinsParam);
    try {
      const value = await fetchCryptoValue(coins, fetch);
      return json({ value, asOf: Date.now(), stale: false }, { headers });
    } catch (err) {
      console.error('[api/crypto] ?coins= fetch başarısız, fallback dönülüyor', err);
      return json({ value: CRYPTO_FALLBACK, asOf: 0, stale: true }, { headers });
    }
  }
  return json(await cache(), { headers });
};
