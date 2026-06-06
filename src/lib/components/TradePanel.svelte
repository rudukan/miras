<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { CATALOG } from '$lib/catalog/liveAssets';
	import { bistName } from '$lib/catalog/bist100';
	import { displayUsd, maxUnitsAffordable } from './format';

	interface Props {
		store: LiveGameStore;
		selectedAssetId: string | null;
	}

	let { store, selectedAssetId }: Props = $props();

	// Hızlı-tutar düğmesi ortak stili (MAX için)
	const chipCls =
		'px-1.5 py-0.5 bg-term-bg border border-term-border text-term-blue text-[10px] ' +
		'hover:border-term-borderGlow hover:text-term-green transition-colors';

	// USD nakit + seçili varlık USD fiyatı (MAX / maliyet yankısı için)
	const usdBalance = $derived(store.game.usdBalance.amount);
	const selectedAssetUsd = $derived(
		selectedAssetId ? store.assetUsdPrice(selectedAssetId) : undefined,
	);

	// ── Al/Sat durumu ────────────────────────────────────────────────────────────
	let units = $state(0);

	function maxUnits() {
		units = maxUnitsAffordable(usdBalance, selectedAssetUsd);
	}

	const assetLabel = $derived(
		selectedAssetId ? (CATALOG[selectedAssetId]?.label ?? bistName(selectedAssetId)) : null,
	);

	function handleBuy() {
		if (!selectedAssetId || units <= 0) return;
		store.buy(selectedAssetId, units);
		units = 0;
	}

	function handleSell() {
		if (!selectedAssetId || units <= 0) return;
		store.sell(selectedAssetId, units);
		units = 0;
	}
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-4">
	<!-- Başlık -->
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		İŞLEM PANELI
	</div>

	<!-- Al / Sat (USD nakitten oto-takas) -->
	<div class="space-y-2">
		<div class="text-term-text opacity-60 text-[10px] uppercase tracking-wider">
			Al / Sat
		</div>
		<div class="text-term-amber text-[10px] leading-relaxed">
			Tüm işlemler USD nakitten yapılır. BIST/altın/gümüş alımında kur otomatik takas edilir.
		</div>

		{#if selectedAssetId === null}
			<div class="text-term-text opacity-40 italic py-2 text-center">
				Soldan bir varlık seç
			</div>
		{:else}
			<div class="text-term-green font-bold mb-2">
				{assetLabel}
				<span class="text-term-text opacity-50 font-normal ml-1 text-[10px]">({selectedAssetId})</span>
			</div>

			<div class="space-y-1">
				<div class="flex items-center gap-2">
					<label for="trade-units" class="text-term-text opacity-50 shrink-0 w-20">Adet</label>
					<input
						type="number"
						min="0"
						id="trade-units"
						step="0.0001"
						bind:value={units}
						class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
						       focus:outline-none focus:border-term-borderGlow text-xs w-full"
					/>
					<button type="button" onclick={maxUnits} class="shrink-0 {chipCls}">MAX</button>
				</div>
				<div class="flex justify-end">
					<span class="text-term-text opacity-50 text-[10px]">
						≈ {displayUsd(selectedAssetUsd !== undefined ? usd(units * selectedAssetUsd) : null)}
					</span>
				</div>
			</div>

			<div class="flex gap-2 mt-1">
				<button
					type="button"
					onclick={handleBuy}
					class="flex-1 py-1.5 bg-term-bg border border-term-green text-term-green font-bold
					       hover:bg-term-panelLight glow-border-green transition-colors"
				>
					AL
				</button>
				<button
					type="button"
					onclick={handleSell}
					class="flex-1 py-1.5 bg-term-bg border border-term-red text-term-red font-bold
					       hover:bg-term-panelLight transition-colors"
				>
					SAT
				</button>
			</div>
		{/if}
	</div>

	<!-- Hata bandı -->
	{#if store.lastError !== null}
		<div class="border border-term-red bg-term-bg px-3 py-2 text-term-red text-[11px] leading-snug">
			<span class="font-bold mr-1">HATA:</span>{store.lastError}
		</div>
	{/if}
</div>
