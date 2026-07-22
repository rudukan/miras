import type { PricePoint, PeriodId, SeriesSource } from '$lib/domain/series/series';
import { fetchPriceSeries } from '$lib/api/seriesClient';

export interface SeriesLoader {
	readonly points: PricePoint[];
	readonly loading: boolean;
}

/** id+source+period DEĞERİ değişince talep üzerine seri çeker (iptal korumalı; hata → boş dizi).
 *  Component init sırasında çağrılmalı ($effect kuralı) — AssetPopover + ChartOverlay ortak.
 *  id/source/period ayrı ayrı $derived: params() liveGameStore'un `prices` $derived'ından
 *  gelen bir row nesnesini okuyor, o nesne her fiyat tick'inde (saniyede bir) TÜM satırlarla
 *  birlikte yeniden üretiliyor — değerler aynı kalsa da referans değişiyor. $effect doğrudan
 *  params()'ı okusaydı bu referans churn'ünü "değişti" sayıp saniyede bir gereksiz yeniden
 *  fetch + loading flicker'ı yapardı (BÜYÜT/AssetPopover üzerinde hover tooltip'inin sürekli
 *  "yükleniyor" döngüsüne girmesine sebep oluyordu). Primitive $derived'lar value-equality
 *  ile bu churn'ü eler. */
export function createSeriesLoader(
	params: () => { id: string; source: SeriesSource; period: PeriodId },
): SeriesLoader {
	let points = $state<PricePoint[]>([]);
	let loading = $state(false);

	const id = $derived(params().id);
	const source = $derived(params().source);
	const period = $derived(params().period);

	$effect(() => {
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
