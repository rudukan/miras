import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Cached } from '$lib/api/types';
import type { PricePoint, PeriodId } from '$lib/domain/series/series';
import { PERIODS } from '$lib/domain/series/series';
import { fetchSeries, SERIES_TTL_MS } from '$lib/api/seriesSource';
import { createTtlCache } from '$lib/api/cachedFetch';

const VALID_PERIODS = new Set(PERIODS.map((p) => p.id));
const EMPTY: PricePoint[] = [];

// (symbol+source+period) başına ayrı TTL cache — talep üzerine lazy oluşturulur.
const caches = new Map<string, () => Promise<Cached<PricePoint[]>>>();

function cacheFor(symbol: string, source: 'crypto' | 'yahoo', period: PeriodId) {
	const key = `${source}:${symbol}:${period}`;
	let c = caches.get(key);
	if (!c) {
		c = createTtlCache<PricePoint[]>({
			ttlMs: SERIES_TTL_MS[period],
			fallback: EMPTY,
			fetcher: () => fetchSeries(symbol, source, period, fetch),
		});
		caches.set(key, c);
	}
	return c;
}

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol')?.trim();
	const source = url.searchParams.get('source');
	const period = url.searchParams.get('period') as PeriodId | null;

	if (!symbol || (source !== 'crypto' && source !== 'yahoo') || !period || !VALID_PERIODS.has(period)) {
		return json({ error: 'geçersiz parametre' }, { status: 400 });
	}
	const headers = { 'cache-control': 'public, max-age=5' };
	return json(await cacheFor(symbol, source, period)(), { headers });
};
