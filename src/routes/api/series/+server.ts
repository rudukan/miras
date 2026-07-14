import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Cached } from '$lib/api/types';
import type { PricePoint, PeriodId } from '$lib/domain/series/series';
import { PERIODS } from '$lib/domain/series/series';
import { fetchSeries, SERIES_TTL_MS } from '$lib/api/seriesSource';
import { createTtlCache } from '$lib/api/cachedFetch';
import { createBoundedRegistry } from '$lib/api/boundedRegistry';

const VALID_PERIODS = new Set(PERIODS.map((p) => p.id));
const VALID_SYMBOL_RE = /^[A-Z0-9]{1,12}$/;
const EMPTY: PricePoint[] = [];

// (symbol+source+period) başına ayrı TTL cache — talep üzerine lazy oluşturulur.
// symbol kullanıcı-kontrollü → sınırsız büyümeyi önlemek için sınırlı registry (güvenlik denetimi P1-3).
const MAX_SERIES_CACHES = 200;
const caches = createBoundedRegistry<() => Promise<Cached<PricePoint[]>>>(MAX_SERIES_CACHES);

function cacheFor(symbol: string, source: 'crypto' | 'yahoo', period: PeriodId) {
	const key = `${source}:${symbol}:${period}`;
	return caches.getOrCreate(key, () =>
		createTtlCache<PricePoint[]>({
			ttlMs: SERIES_TTL_MS[period],
			fallback: EMPTY,
			fetcher: () => fetchSeries(symbol, source, period, fetch),
		}),
	);
}

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol')?.trim();
	const source = url.searchParams.get('source');
	const period = url.searchParams.get('period') as PeriodId | null;

	if (!symbol || !VALID_SYMBOL_RE.test(symbol) || (source !== 'crypto' && source !== 'yahoo') || !period || !VALID_PERIODS.has(period)) {
		return json({ error: 'geçersiz parametre' }, { status: 400 });
	}
	const headers = { 'cache-control': 'public, max-age=5' };
	return json(await cacheFor(symbol, source, period)(), { headers });
};
