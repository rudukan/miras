// @vitest-environment happy-dom
// ($effect gerçek client reaktivitesiyle çalışsın diye — varsayılan `environment: 'node'`
//  Svelte modüllerini SSR/'server' modunda derler, orada $effect.root callback'i hiç
//  çalışmaz. Bu dosyaya özel happy-dom, diğer (saf TS) testleri etkilemez.)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tick } from 'svelte';
import { createSeriesLoader, type SeriesLoader } from './useSeries.svelte';
import { fetchPriceSeries } from '$lib/api/seriesClient';

vi.mock('$lib/api/seriesClient', () => ({
	fetchPriceSeries: vi.fn(async () => []),
}));

afterEach(() => {
	vi.mocked(fetchPriceSeries).mockClear();
});

describe('createSeriesLoader', () => {
	it('params() yeni obje referansı dönse de id/source/period DEĞERİ aynıysa yeniden fetch etmez', async () => {
		// liveGameStore'daki `prices` $derived'ı her fiyat tick'inde TÜM PriceRow'ları
		// yeniden üretir (aynı id/source olsa da obje referansı değişir). Bu test o
		// churn'ü simüle eder: setRow her seferinde TAZE bir obje atar.
		let setRow!: (r: { id: string; source: 'us' }) => void;
		let loader!: SeriesLoader;

		const cleanup = $effect.root(() => {
			let row = $state({ id: 'VRT', source: 'us' as const });
			setRow = (r) => {
				row = r;
			};
			loader = createSeriesLoader(() => ({ id: row.id, source: row.source, period: '1G' }));
		});

		await tick();
		expect(fetchPriceSeries).toHaveBeenCalledTimes(1);

		setRow({ id: 'VRT', source: 'us' }); // yeni obje, aynı değerler
		await tick();

		expect(fetchPriceSeries).toHaveBeenCalledTimes(1);
		expect(loader.loading).toBe(false);

		cleanup();
	});
});
