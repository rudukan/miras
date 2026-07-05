/**
 * Canlı ABD hisse arama composable'ı (Svelte 5 runes — .svelte.ts).
 * 300ms debounce + race-condition koruması (sıra numarası).
 * `searchUsStocksLive` proxy çağrısını PriceList.svelte'den ayırır.
 */
import type { UsStockEntry } from '$lib/catalog/usStocks';
import { searchUsStocksLive } from '$lib/api/usStockSearch';

export function createUsLiveSearch(getQuery: () => string) {
	let results = $state<UsStockEntry[]>([]);
	let searching = $state(false);
	let seq = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const q = getQuery().trim();
		clearTimeout(timer);
		results = [];
		if (q === '') {
			searching = false;
			return;
		}
		searching = true;
		const mySeq = ++seq;
		timer = setTimeout(async () => {
			const res = await searchUsStocksLive(q);
			if (mySeq !== seq) return;
			results = res;
			searching = false;
		}, 300);
	});

	return {
		get results() { return results; },
		get searching() { return searching; },
	};
}
