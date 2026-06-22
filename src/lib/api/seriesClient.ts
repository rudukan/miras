import type { PricePoint, PeriodId } from '../domain/series/series';
import type { Cached } from './types';

/** Tarayıcı → /api/series ince istemci. Hata/boş → boş dizi (grafik "veri yok" gösterir). */
export async function fetchPriceSeries(
	assetId: string,
	source: 'crypto' | 'yahoo',
	period: PeriodId,
	fetchFn: typeof fetch = fetch,
): Promise<PricePoint[]> {
	const res = await fetchFn(
		`/api/series?symbol=${encodeURIComponent(assetId)}&source=${source}&period=${period}`,
	);
	if (!res.ok) return [];
	const body = (await res.json()) as Cached<PricePoint[]>;
	return Array.isArray(body.value) ? body.value : [];
}
