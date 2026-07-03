<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import {
		PROPERTY_CATALOG,
		RENT_ANNUAL_RATE,
		accruedRentTry,
		vaultCapTry,
		isVaultFull,
		propertyDef,
		type OwnedProperty,
	} from '$lib/domain/property/property';
	import { displayTry, displayUsd } from './format';
	import { usd } from '$lib/domain/money';

	interface Props {
		store: LiveGameStore;
		nowMs: number;
	}

	let { store, nowMs }: Props = $props();

	const ratePct = Math.round(RENT_ANNUAL_RATE * 100);

	const usdBalance = $derived(store.game.usdBalance.amount);
	const usdTry = $derived(store.usdTry);
	const owned = $derived(store.properties);
	const forSale = $derived(
		PROPERTY_CATALOG.filter((d) => !owned.some((p) => p.propertyId === d.id)),
	);

	/** Satır başı görünüm verisi — nowMs her saniye değişince yeniden hesaplanır. */
	function rowView(p: OwnedProperty) {
		const rent = accruedRentTry(p, nowMs);
		const cap = vaultCapTry(p);
		const full = isVaultFull(p, nowMs);
		return {
			def: propertyDef(p.propertyId),
			rent,
			full,
			fillPct: cap.amount > 0 ? Math.min(100, (rent.amount / cap.amount) * 100) : 0,
			valueUsd: usdTry > 0 ? usd((p.priceTryAtBuy.amount + rent.amount) / usdTry) : null,
		};
	}

	function affordable(priceTry: number): boolean {
		return usdTry > 0 && priceTry / usdTry <= usdBalance;
	}

	function handleSell(p: OwnedProperty) {
		const ok = confirm(
			`${propertyDef(p.propertyId).name} satılsın mı? Bedel + kasadaki kira nakde döner.`,
		);
		if (ok) store.sellProperty(p.propertyId);
	}
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-3">
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		EMLAK
	</div>

	{#if owned.length > 0}
		<div class="space-y-3">
			{#each owned as p (p.propertyId)}
				{@const v = rowView(p)}
				<div class="space-y-1.5">
					<div class="flex justify-between items-center">
						<span class="text-term-text opacity-70">{v.def.name}</span>
						<span class="text-term-green font-bold">{displayUsd(v.valueUsd)}</span>
					</div>
					<!-- Kira kasası: doluluk çubuğu + tutar -->
					<div class="flex items-center gap-2">
						<div class="flex-1 h-1.5 bg-term-bg border border-term-border overflow-hidden">
							<div
								class="h-full {v.full ? 'bg-term-amber' : 'bg-term-green'} transition-[width]"
								style="width: {v.fillPct}%"
							></div>
						</div>
						<span class="shrink-0 text-[10px] {v.full ? 'text-term-amber' : 'text-term-text opacity-70'}">
							kasa {displayTry(v.rent.amount)}
						</span>
					</div>
					{#if v.full}
						<div class="text-[10px] text-term-amber">KASA DOLDU — birikim durdu, tahsil et</div>
					{/if}
					<div class="flex justify-between items-center pt-0.5">
						<button
							type="button"
							disabled={v.rent.amount <= 0}
							onclick={() => store.collectRent(p.propertyId)}
							class="px-3 py-1 bg-term-bg border border-term-green text-term-green font-bold
							       hover:bg-term-panelLight transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						>
							TAHSİL ET
						</button>
						<button
							type="button"
							onclick={() => handleSell(p)}
							class="px-3 py-1 bg-term-bg border border-term-red text-term-red font-bold
							       hover:bg-term-panelLight transition-colors"
						>
							SAT
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if forSale.length > 0}
		<div class="space-y-2 {owned.length > 0 ? 'pt-1 border-t border-term-border' : ''}">
			{#each forSale as d (d.id)}
				<div class="flex justify-between items-center gap-2">
					<div class="min-w-0">
						<div class="text-term-text opacity-70 truncate">{d.name}</div>
						<div class="text-[10px] text-term-text opacity-50">
							{displayTry(d.priceTry.amount)}
							{#if usdTry > 0}· ≈ {displayUsd(usd(d.priceTry.amount / usdTry))}{/if}
						</div>
					</div>
					<button
						type="button"
						disabled={!affordable(d.priceTry.amount)}
						onclick={() => store.buyProperty(d.id)}
						class="shrink-0 px-2 py-1 bg-term-bg border border-term-green text-term-green font-bold
						       hover:bg-term-panelLight transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
					>
						SATIN AL
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<div class="text-[10px] text-term-text opacity-40">
		kira %{ratePct}/yıl · kasa 48 saatte dolar, dolunca birikim durur
	</div>
</div>
