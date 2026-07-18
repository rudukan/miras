<script lang="ts">
	import type { PriceRow as PriceRowData } from '$lib/stores/liveGameStore.svelte';
	import { groupByCategory, CATEGORY_LABELS } from './format';
	import { searchBist100 } from '$lib/catalog/bist100';
	import { searchUsStocks, registerDiscoveredUsStock } from '$lib/catalog/usStocks';
	import { createUsLiveSearch } from './usLiveSearch.svelte';
	import PriceRow from './PriceRow.svelte';
	import DataInfoModal from './ui/DataInfoModal.svelte';

	interface Props {
		prices: PriceRowData[];
		onSelect: (id: string) => void;
		onAddBist: (symbol: string) => void;
		onAddUs: (symbol: string) => void;
		onHover?: (id: string | null) => void;
		onOpenPopover?: (row: PriceRowData, anchor: DOMRect, variant: 'desktop' | 'mobile') => void;
	}

	let { prices, onSelect, onAddBist, onAddUs, onHover, onOpenPopover }: Props = $props();

	let q = $state('');
	let tab = $state('all');
	let infoOpen = $state(false);

	// 300ms debounce + race-condition koruması composable'da kapsüllendi.
	const live = createUsLiveSearch(() => q);

	const TABS: ReadonlyArray<{ id: string; label: string }> = [
		{ id: 'all', label: 'TÜMÜ' },
		{ id: 'crypto', label: CATEGORY_LABELS.crypto },
		{ id: 'bist', label: CATEGORY_LABELS.bist },
		{ id: 'us', label: CATEGORY_LABELS.us },
		{ id: 'commodity', label: CATEGORY_LABELS.commodity },
		{ id: 'fx', label: CATEGORY_LABELS.fx },
	];

	const searching = $derived(q.trim() !== '');

	// Arama her şeyi ezer (sekme yok sayılır); aramasızken sekme filtreler.
	const visible = $derived.by(() => {
		if (searching) {
			const needle = q.trim().toLowerCase();
			return prices.filter(
				(r) => r.label.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle)
			);
		}
		return tab === 'all' ? prices : prices.filter((r) => r.category === tab);
	});

	const groups = $derived(groupByCategory(visible));

	const hasAnyUs = $derived(prices.some((p) => p.category === 'us'));
	const showUsEmptyHint = $derived(tab === 'us' && !searching && !hasAnyUs);

	// Arama yapılınca: BIST100'den eşleşip henüz aktif sette OLMAYAN semboller.
	const addableBist = $derived.by(() => {
		if (!searching) return [];
		const activeIds = new Set(prices.map((p) => p.id));
		return searchBist100(q).filter((e) => !activeIds.has(e.symbol));
	});

	// Statik US sonuçları (anlık, sıfır gecikme).
	const staticUs = $derived.by(() => {
		if (!searching) return [];
		const activeIds = new Set(prices.map((p) => p.id));
		return searchUsStocks(q).filter((e) => !activeIds.has(e.symbol));
	});

	// Statik + canlı birleşimi (tekrar yok, activeIds filtresi canlıya da uygulanır).
	const addableUs = $derived.by(() => {
		const activeIds = new Set(prices.map((p) => p.id));
		const staticSymbols = new Set(staticUs.map((e) => e.symbol));
		const liveOnly = live.results.filter(
			(e) => !activeIds.has(e.symbol) && !staticSymbols.has(e.symbol)
		);
		return [...staticUs, ...liveOnly];
	});

	function handleAddBist(symbol: string) {
		onAddBist(symbol);
		q = '';
	}

	function handleAddUs(symbol: string, name: string) {
		registerDiscoveredUsStock(symbol, name); // session registry — usStockName fallback'i düzeltir
		onAddUs(symbol);
		q = '';
	}
</script>

<div class="bg-term-panel border border-term-border font-mono text-xs flex flex-col h-full">
	<!-- Başlık + arama -->
	<div class="px-3 pt-3 pb-2 border-b border-term-border">
		<div class="flex items-center justify-between mb-2">
			<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold">
				PİYASA FİYATLARI
			</div>
			<button
				type="button"
				onclick={() => (infoOpen = true)}
				class="text-term-text opacity-50 hover:opacity-100 text-[10px] border border-term-border rounded-full w-4 h-4 flex items-center justify-center shrink-0"
				aria-label="Veri hakkında"
			>i</button>
		</div>
		<input
			type="text"
			placeholder="Ara..."
			bind:value={q}
			class="w-full bg-term-bg border border-term-border px-2 py-1 text-term-text placeholder-term-text placeholder-opacity-30 focus:outline-none focus:border-term-borderGlow text-xs"
		/>
	</div>

	<!-- Kategori sekmeleri (arama doluyken pasif görünür — arama her şeyi ezer) -->
	<div class="flex flex-wrap gap-1 px-3 py-2 border-b border-term-border">
		{#each TABS as t (t.id)}
			<button
				type="button"
				onclick={() => (tab = t.id)}
				class="px-2 py-0.5 text-[10px] border transition-colors duration-75
				       {tab === t.id && !searching
					? 'border-term-green text-term-green bg-term-panelLight'
					: 'border-term-border text-term-text opacity-60 hover:opacity-100'}"
			>
				{t.label}
			</button>
		{/each}
	</div>

	<!-- Liste: her durumda gruplu (tek render yolu) -->
	<div class="flex-1 overflow-y-auto">
		{#if showUsEmptyHint}
			<div class="px-4 py-6 text-center">
				<div class="text-term-text text-xs mb-1.5">Henüz ABD hissesi eklemedin</div>
				<div class="text-term-text opacity-50 text-[11px] leading-relaxed">
					Yukarıdaki arama kutusuna şirket adı veya sembol yaz<br />(ör. AAPL, Tesla, Microsoft) ve listeden ekle.
				</div>
			</div>
		{:else if groups.length === 0 && addableBist.length === 0 && addableUs.length === 0}
			<div class="px-3 py-4 text-term-text opacity-40 italic text-center">
				Sonuç bulunamadı
			</div>
		{:else}
			{#each groups as g (g.category)}
				<div class="px-3 py-1 text-[10px] uppercase tracking-widest text-term-blue opacity-60 bg-term-bg">
					{CATEGORY_LABELS[g.category] ?? g.category}{#if g.category === 'bist'}<span class="normal-case tracking-normal opacity-70"> · ~15 dk gecikmeli</span>{/if}
				</div>
				{#each g.rows as row (row.id)}
					<PriceRow {row} {onSelect} {onHover} {onOpenPopover} />
				{/each}
			{/each}
		{/if}

		{#if addableBist.length > 0}
			<div class="px-3 pt-3 pb-1 text-[10px] uppercase tracking-widest text-term-blue opacity-60 border-t border-term-border">
				BIST100 — Ekle
			</div>
			{#each addableBist as e (e.symbol)}
				<button
					type="button"
					onclick={() => handleAddBist(e.symbol)}
					class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
					       hover:bg-term-panelLight hover:border-term-borderGlow
					       focus:outline-none focus:bg-term-panelLight
					       transition-colors duration-75 cursor-pointer flex items-center justify-between gap-2"
				>
					<div class="flex flex-col min-w-0">
						<span class="text-term-text font-bold truncate">{e.name}</span>
						<span class="text-[10px] text-term-blue opacity-70 uppercase tracking-wide">{e.symbol}</span>
					</div>
					<span class="text-[10px] text-term-green font-bold shrink-0">+ EKLE</span>
				</button>
			{/each}
		{/if}

		{#if searching && (addableUs.length > 0 || live.searching)}
			<div class="px-3 pt-3 pb-1 text-[10px] uppercase tracking-widest text-term-blue opacity-60 border-t border-term-border flex items-center gap-2">
				ABD Borsası — Ekle
				{#if live.searching}
					<span class="text-term-text opacity-40 normal-case tracking-normal">aranıyor…</span>
				{/if}
			</div>
			{#each addableUs as e (e.symbol)}
				<button
					type="button"
					onclick={() => handleAddUs(e.symbol, e.name)}
					class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
					       hover:bg-term-panelLight hover:border-term-borderGlow
					       focus:outline-none focus:bg-term-panelLight
					       transition-colors duration-75 cursor-pointer flex items-center justify-between gap-2"
				>
					<div class="flex flex-col min-w-0">
						<span class="text-term-text font-bold truncate">{e.name}</span>
						<span class="text-[10px] text-term-blue opacity-70 uppercase tracking-wide">{e.symbol}</span>
					</div>
					<span class="text-[10px] text-term-green font-bold shrink-0">+ EKLE</span>
				</button>
			{/each}
		{/if}
	</div>
</div>

{#if infoOpen}
	<DataInfoModal onClose={() => (infoOpen = false)} />
{/if}
