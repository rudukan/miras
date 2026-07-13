import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTtlCache } from '$lib/api/cachedFetch';
import type { FxValue } from '$lib/api/types';
import { fetchFxValue, YAHOO_FALLBACK, DEFAULT_BIST, YAHOO_TTL_MS } from '$lib/api/yahooSource';
import { parseSymbolList } from '$lib/api/symbolLimit';

// Varsayılan sembol seti için modül-seviyesi 5s önbellek (US içermez — varsayılan set sabit).
const cache = createTtlCache<FxValue>({
  ttlMs: YAHOO_TTL_MS,
  fallback: YAHOO_FALLBACK,
  fetcher: () => fetchFxValue(DEFAULT_BIST, [], fetch),
});

export const GET: RequestHandler = async ({ url }) => {
  const bistParam = url.searchParams.get('bist');
  const usParam = url.searchParams.get('us');
  const headers = { 'cache-control': 'public, max-age=5' };

  // Özel sembol istenirse cache'i bypass et (basit v1; varsayılan set cache'lenir).
  if (bistParam || usParam) {
    const bist = parseSymbolList(bistParam);
    const us = parseSymbolList(usParam);
    try {
      const value = await fetchFxValue(bist, us, fetch);
      return json({ value, asOf: Date.now(), stale: false }, { headers });
    } catch (err) {
      console.error('[api/yahoo] ?bist=/?us= fetch başarısız, fallback dönülüyor', err);
      return json({ value: YAHOO_FALLBACK, asOf: 0, stale: true }, { headers });
    }
  }
  return json(await cache(), { headers });
};
