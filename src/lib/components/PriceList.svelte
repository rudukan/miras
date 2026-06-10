<script lang="ts">
	import type { PriceRow as PriceRowData } from '$lib/stores/liveGameStore.svelte';
	import { groupByCategory, CATEGORY_LABELS } from './format';
	import { searchBist100 } from '$lib/catalog/bist100';
	import PriceRow from './PriceRow.svelte';

	interface Props {
		prices: PriceRowData[];
		onSelect: (id: string) => void;
		onAddBist: (symbol: string) => void;
	}

	let { prices, onSelect, onAddBist }: Props = $props();

	let q = $state('');
	let tab = $state('all');

	const TABS: ReadonlyArray<{ id: string; label: string }> = [
		{ id: 'all', label: 'TÜMÜ' },
		{ id: 'crypto', label: CATEGORY_LABELS.crypto },
		{ id: 'bist', label: CATEGORY_LABELS.bist },
		{ id: 'commodity', label: CATEGORY_LABELS.commodity },
		{ id: 'fx', label: CATEGORY_LABELS.fx },
	];

	const searching = $derived(q.trim() !== '');

	// Arama her şeyi ezer (sekme yok sayılır); aramasızken sekme filtreler.
	// Tek render yolu: sonuç her durumda gruplu çizilir.
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

	// Arama yapılınca: BIST100'den eşleşip henüz aktif sette OLMAYAN semboller ("eklenebilir").
	const addable = $derived.by(() => {
		if (!searching) return [];
		const activeIds = new Set(prices.map((p) => p.id));
		return searchBist100(q).filter((e) => !activeIds.has(e.symbol));
	});

	function handleAdd(symbol: string) {
		onAddBist(symbol);
		q = ''; // aramayı temizle → yeni eklenen aktif listede görünür
	}
</script>

<div class="bg-term-panel border border-term-border font-mono text-xs flex flex-col h-full">
	<!-- Başlık + arama -->
	<div class="px-3 pt-3 pb-2 border-b border-term-border">
		<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold mb-2">
			PİYASA FİYATLARI
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
		{#if groups.length === 0 && addable.length === 0}
			<div class="px-3 py-4 text-term-text opacity-40 italic text-center">
				Sonuç bulunamadı
			</div>
		{:else}
			{#each groups as g (g.category)}
				<div class="px-3 py-1 text-[10px] uppercase tracking-widest text-term-blue opacity-60 bg-term-bg">
					{CATEGORY_LABELS[g.category] ?? g.category}
				</div>
				{#each g.rows as row (row.id)}
					<PriceRow {row} {onSelect} />
				{/each}
			{/each}
		{/if}

		{#if addable.length > 0}
			<div class="px-3 pt-3 pb-1 text-[10px] uppercase tracking-widest text-term-blue opacity-60 border-t border-term-border">
				BIST100 — Ekle
			</div>
			{#each addable as e (e.symbol)}
				<button
					type="button"
					onclick={() => handleAdd(e.symbol)}
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
