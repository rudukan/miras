import type { PricePoint, PeriodId } from '$lib/domain/series/series';
import { fetchPriceSeries } from '$lib/api/seriesClient';

export interface SeriesLoader {
	readonly points: PricePoint[];
	readonly loading: boolean;
}

/** id+source+period değişince talep üzerine seri çeker (iptal korumalı; hata → boş dizi).
 *  Component init sırasında çağrılmalı ($effect kuralı) — AssetPopover + ChartOverlay ortak. */
export function createSeriesLoader(
	params: () => { id: string; source: 'crypto' | 'yahoo'; period: PeriodId },
): SeriesLoader {
	let points = $state<PricePoint[]>([]);
	let loading = $state(false);

	$effect(() => {
		const { id, source, period } = params();
		loading = true;
		let cancelled = false;
		fetchPriceSeries(id, source, period)
			.then((s) => { if (!cancelled) points = s; })
			.catch(() => { if (!cancelled) points = []; })
			.finally(() => { if (!cancelled) loading = false; });
		return () => { cancelled = true; };
	});

	return {
		get points() { return points; },
		get loading() { return loading; },
	};
}
