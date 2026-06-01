<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd, tryM } from '$lib/domain/money';
	import { CATALOG } from '$lib/catalog/liveAssets';

	interface Props {
		store: LiveGameStore;
		selectedAssetId: string | null;
	}

	let { store, selectedAssetId }: Props = $props();

	// ── Çevrim durumu ───────────────────────────────────────────────────────────
	let usdAmt = $state(0);
	let tryAmt = $state(0);

	function handleUsdToTry() {
		if (usdAmt <= 0) return;
		store.usdToTry(usd(usdAmt));
		usdAmt = 0;
	}

	function handleTryToUsd() {
		if (tryAmt <= 0) return;
		store.tryToUsd(tryM(tryAmt));
		tryAmt = 0;
	}

	// ── Al/Sat durumu ────────────────────────────────────────────────────────────
	let units = $state(0);

	const assetLabel = $derived(
		selectedAssetId ? (CATALOG[selectedAssetId]?.label ?? selectedAssetId) : null
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

	<!-- (A) Döviz Çevirimi ──────────────────────────────────────────────────────── -->
	<div class="space-y-2">
		<div class="text-term-text opacity-60 text-[10px] uppercase tracking-wider">
			Döviz Çevirimi
		</div>
		<div class="text-term-amber text-[10px] leading-relaxed">
			Al/sat için önce USD→TRY çevir. İşlemler TRY ile gerçekleşir.
		</div>

		<!-- USD → TRY -->
		<div class="flex items-center gap-2">
			<label for="usd-amt" class="text-term-text opacity-50 shrink-0 w-20">USD miktar</label>
			<input
				type="number"
				min="0"
				id="usd-amt"
				step="100"
				bind:value={usdAmt}
				class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-green
				       focus:outline-none focus:border-term-borderGlow text-xs w-full"
			/>
			<button
				type="button"
				onclick={handleUsdToTry}
				class="shrink-0 px-3 py-1 bg-term-bg border border-term-border text-term-blue
				       hover:border-term-borderGlow hover:text-term-green transition-colors"
			>
				USD→TRY
			</button>
		</div>

		<!-- TRY → USD -->
		<div class="flex items-center gap-2">
			<label for="try-amt" class="text-term-text opacity-50 shrink-0 w-20">TRY miktar</label>
			<input
				type="number"
				min="0"
				id="try-amt"
				step="1000"
				bind:value={tryAmt}
				class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-amber
				       focus:outline-none focus:border-term-borderGlow text-xs w-full"
			/>
			<button
				type="button"
				onclick={handleTryToUsd}
				class="shrink-0 px-3 py-1 bg-term-bg border border-term-border text-term-blue
				       hover:border-term-borderGlow hover:text-term-green transition-colors"
			>
				TRY→USD
			</button>
		</div>
	</div>

	<!-- Ayraç -->
	<div class="border-t border-term-border border-opacity-50"></div>

	<!-- (B) Al / Sat ─────────────────────────────────────────────────────────────── -->
	<div class="space-y-2">
		<div class="text-term-text opacity-60 text-[10px] uppercase tracking-wider">
			Al / Sat
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

	<!-- (C) Hata bandı ──────────────────────────────────────────────────────────── -->
	{#if store.lastError !== null}
		<div class="border border-term-red bg-term-bg px-3 py-2 text-term-red text-[11px] leading-snug">
			<span class="font-bold mr-1">HATA:</span>{store.lastError}
		</div>
	{/if}
</div>
