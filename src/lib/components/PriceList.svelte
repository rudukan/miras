<script lang="ts">
	import type { PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { displayTry, marketBadge, dailyChangeBadge } from './format';
	import { searchBist100 } from '$lib/catalog/bist100';

	interface Props {
		prices: PriceRow[];
		onSelect: (id: string) => void;
		onAddBist: (symbol: string) => void;
	}

	let { prices, onSelect, onAddBist }: Props = $props();

	let q = $state('');

	const filtered = $derived(
		q.trim() === ''
			? prices
			: prices.filter(
					(r) =>
						r.label.toLowerCase().includes(q.toLowerCase()) ||
						r.id.toLowerCase().includes(q.toLowerCase())
			  )
	);

	// Arama yapılınca: BIST100'den eşleşip henüz aktif sette OLMAYAN semboller ("eklenebilir").
	const addable = $derived.by(() => {
		if (q.trim() === '') return [];
		const activeIds = new Set(prices.map((p) => p.id));
		return searchBist100(q).filter((e) => !activeIds.has(e.symbol));
	});

	function handleAdd(symbol: string) {
		onAddBist(symbol);
		q = ''; // aramayı temizle → yeni eklenen aktif listede görünür
	}

	const categoryLabel: Record<string, string> = {
		bist: 'BIST',
		crypto: 'KRİPTO',
		commodity: 'EMTİA',
		fx: 'DÖVİZ',
	};

	const categoryColor: Record<string, string> = {
		bist: 'text-term-blue',
		crypto: 'text-term-amber',
		commodity: 'text-term-green',
		fx: 'text-term-text',
	};
</script>

<div class="bg-term-panel border border-term-border font-mono text-xs flex flex-col h-full">
	<!-- Başlık -->
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

	<!-- Liste -->
	<div class="flex-1 overflow-y-auto">
		{#if filtered.length === 0 && addable.length === 0}
			<div class="px-3 py-4 text-term-text opacity-40 italic text-center">
				Sonuç bulunamadı
			</div>
		{:else}
			{#each filtered as row (row.id)}
				{@const badge = marketBadge(row.marketOpen)}
				{@const chg = dailyChangeBadge(row.changePct)}
				<button
					type="button"
					onclick={() => onSelect(row.id)}
					class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
					       hover:bg-term-panelLight hover:border-term-borderGlow
					       focus:outline-none focus:bg-term-panelLight
					       transition-colors duration-75 cursor-pointer"
				>
					<div class="flex items-center justify-between gap-2">
						<!-- Sol: isim + kategori -->
						<div class="flex flex-col min-w-0">
							<span class="text-term-text font-bold truncate">{row.label}</span>
							<span class="text-[10px] {categoryColor[row.category] ?? 'text-term-text'} opacity-70 uppercase tracking-wide">
								{categoryLabel[row.category] ?? row.category}
							</span>
						</div>
						<!-- Sağ: fiyat + günlük değişim + market rozeti -->
						<div class="flex flex-col items-end shrink-0">
							<span class="text-term-green font-bold">
								{displayTry(row.priceTry)}
							</span>
							<div class="flex items-center gap-2">
								{#if chg}
									<span class="text-[10px] {chg.cls} font-bold">{chg.text}</span>
								{/if}
								<span class="text-[10px] {badge.cls}">
									{badge.text}
								</span>
							</div>
						</div>
					</div>
				</button>
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
