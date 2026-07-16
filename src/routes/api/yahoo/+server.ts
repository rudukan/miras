import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createKeyedTtlFetchCache } from '$lib/api/cachedFetch';
import type { FxValue } from '$lib/api/types';
import { fetchFxValue, YAHOO_FALLBACK, DEFAULT_BIST, YAHOO_TTL_MS } from '$lib/api/yahooSource';
import { parseSymbolList } from '$lib/api/symbolLimit';

/** Sembol listesini normalize eder: dedupe + sort + join — sırası farklı istekler
 *  (`THYAO,EREGL` vs `EREGL,THYAO`) aynı cache key'ine düşsün (audit P1). */
function normalizeSymbols(list: readonly string[]): string {
  return Array.from(new Set(list)).sort().join(',');
}

function cacheKey(bist: readonly string[], us: readonly string[]): string {
  return `${normalizeSymbols(bist)}|${normalizeSymbols(us)}`;
}

// Sembol-set-başına 5s TTL önbellek + inflight dedup (audit P1: parametreli istekler artık
// cache'i bypass etmiyor — tek kod yolu, ?bist=/?us= dahil).
const cache = createKeyedTtlFetchCache<FxValue>({
  ttlMs: YAHOO_TTL_MS,
  fallback: YAHOO_FALLBACK,
  fetcher: (key) => {
    const [bistKey, usKey] = key.split('|');
    return fetchFxValue(bistKey ? bistKey.split(',') : [], usKey ? usKey.split(',') : [], fetch);
  },
});

export const GET: RequestHandler = async ({ url }) => {
  const hasParams = url.searchParams.has('bist') || url.searchParams.has('us');
  const bist = hasParams ? parseSymbolList(url.searchParams.get('bist')) : DEFAULT_BIST;
  const us = parseSymbolList(url.searchParams.get('us'));
  const headers = { 'cache-control': 'public, max-age=5' };
  return json(await cache(cacheKey(bist, us)), { headers });
};
