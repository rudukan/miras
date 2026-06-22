<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { CATALOG } from '$lib/catalog/liveAssets';
	import { bistName } from '$lib/catalog/bist100';
	import { maxUnitsAffordable, heldUnits, tradeToastMessage } from './format';

	interface Props {
		store: LiveGameStore;
		assetId: string | null;
		/** Boş durumda gösterilecek metin (panel: "Soldan bir varlık seç"). */
		emptyText?: string;
		onTradeSuccess?: (message: string) => void;
	}
	let { store, assetId, emptyText = 'Bir varlık seç', onTradeSuccess }: Props = $props();

	const chipCls =
		'px-1.5 py-0.5 bg-term-bg border border-term-border text-term-blue text-[10px] ' +
		'hover:border-term-borderGlow hover:text-term-green transition-colors';

	const usdBalance = $derived(store.game.usdBalance.amount);
	const assetUsd = $derived(assetId ? store.assetUsdPrice(assetId) : undefined);
	const heldUnitsSel = $derived(heldUnits(store.positions, assetId));
	const assetLabel = $derived(
		assetId ? (CATALOG[assetId]?.label ?? bistName(assetId)) : null,
	);

	let units = $state(0);
	let dollarAmount = $state(0);

	// Varlık değişince formu sıfırla (pop-up farklı varlık açtığında eski değer kalmasın).
	$effect(() => {
		void assetId;
		units = 0;
		dollarAmount = 0;
	});

	function syncDollarFromUnits() {
		dollarAmount = assetUsd !== undefined ? Math.round(units * assetUsd * 100) / 100 : 0;
	}
	function syncUnitsFromDollar() {
		if (assetUsd !== undefined && assetUsd > 0) {
			units = Math.floor((dollarAmount / assetUsd) * 10000) / 10000;
		}
	}
	function maxUnits() {
		units = maxUnitsAffordable(usdBalance, assetUsd);
		syncDollarFromUnits();
	}
	function allUnits() {
		units = heldUnitsSel;
		syncDollarFromUnits();
	}

	function handleBuy() {
		if (!assetId || units <= 0) return;
		const id = assetId;
		const u = units;
		const amt = dollarAmount;
		store.buy(id, u);
		units = 0;
		dollarAmount = 0;
		if (store.lastError === null) onTradeSuccess?.(tradeToastMessage('buy', id, u, amt));
	}
	function handleSell() {
		if (!assetId || units <= 0) return;
		const id = assetId;
		const u = units;
		const amt = dollarAmount;
		store.sell(id, u);
		units = 0;
		dollarAmount = 0;
		if (store.lastError === null) onTradeSuccess?.(tradeToastMessage('sell', id, u, amt));
	}
</script>

{#if assetId === null}
	<div class="text-term-text opacity-40 italic py-2 text-center">{emptyText}</div>
{:else}
	<div class="text-term-green font-bold mb-2">
		{assetLabel}
		<span class="text-term-text opacity-50 font-normal ml-1 text-[10px]">({assetId})</span>
	</div>

	<div class="space-y-1.5">
		<div class="flex items-center gap-2">
			<label for="trade-units-{assetId}" class="text-term-text opacity-50 shrink-0 w-20">Adet</label>
			<input
				type="number"
				min="0"
				id="trade-units-{assetId}"
				step="0.0001"
				bind:value={units}
				oninput={syncDollarFromUnits}
				class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
				       focus:outline-none focus:border-term-borderGlow text-xs w-full"
			/>
			<button type="button" onclick={maxUnits} class="shrink-0 {chipCls}">MAX</button>
			{#if heldUnitsSel > 0}
				<button type="button" onclick={allUnits} class="shrink-0 {chipCls}">TÜMÜ</button>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<label for="trade-dollars-{assetId}" class="text-term-text opacity-50 shrink-0 w-20">Tutar ($)</label>
			<input
				type="number"
				min="0"
				id="trade-dollars-{assetId}"
				step="1"
				bind:value={dollarAmount}
				oninput={syncUnitsFromDollar}
				class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
				       focus:outline-none focus:border-term-borderGlow text-xs w-full"
			/>
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

	{#if store.lastError !== null}
		<div class="border border-term-red bg-term-bg px-3 py-2 text-term-red text-[11px] leading-snug mt-2">
			<span class="font-bold mr-1">HATA:</span>{store.lastError}
		</div>
	{/if}
{/if}
