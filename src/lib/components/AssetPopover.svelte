<!-- src/lib/components/AssetPopover.svelte -->
<script lang="ts">
	import type { LiveGameStore, PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { PERIODS, type PeriodId, type PricePoint } from '$lib/domain/series/series';
	import { fetchPriceSeries } from '$lib/api/seriesClient';
	import { usd } from '$lib/domain/money';
	import { displayTry, displayUsd, dailyChangeBadge, heldUnits } from './format';
	import PriceChart from './chart/PriceChart.svelte';
	import TradeForm from './TradeForm.svelte';

	interface Props {
		store: LiveGameStore;
		row: PriceRow;
		variant?: 'desktop' | 'mobile';
		onClose: () => void;
	}
	let { store, row, variant = 'desktop', onClose }: Props = $props();

	let period = $state<PeriodId>('1G');
	let points = $state<PricePoint[]>([]);
	let loading = $state(false);

	// row.id + period değişince talep üzerine seri çek (yalnız bu sembol → ucuz).
	$effect(() => {
		const id = row.id;
		const src = row.source;
		const p = period;
		loading = true;
		let cancelled = false;
		fetchPriceSeries(id, src, p)
			.then((s) => { if (!cancelled) points = s; })
			.catch(() => { if (!cancelled) points = []; })
			.finally(() => { if (!cancelled) loading = false; });
		return () => { cancelled = true; };
	});

	const chg = $derived(dailyChangeBadge(row.changePct));
	const held = $derived(heldUnits(store.positions, row.id));
	const heldUsd = $derived(() => {
		const pos = store.positions.find((p) => p.assetId === row.id);
		return pos?.valueUsd;
	});
</script>

<div
	class="bg-term-panel border border-term-borderGlow font-mono text-xs p-3 space-y-2
	       {variant === 'mobile' ? 'w-full rounded-t-lg' : 'w-[300px] shadow-lg'}"
>
	<!-- Başlık + kapat -->
	<div class="flex items-start justify-between gap-2 border-b border-term-border pb-1">
		<div class="min-w-0">
			<div class="text-term-text font-bold truncate">
				{row.label} <span class="opacity-50 text-[10px]">({row.id})</span>
			</div>
			<div class="flex items-baseline gap-2">
				<span class="text-term-green font-bold">{displayTry(row.priceTry)}</span>
				{#if chg}<span class="text-[10px] {chg.cls} font-bold">{chg.text}</span>{/if}
			</div>
		</div>
		<button
			type="button"
			onclick={onClose}
			class="shrink-0 text-term-text opacity-50 hover:opacity-100 px-1"
			aria-label="Kapat"
		>✕</button>
	</div>

	<!-- Grafik -->
	<div class="relative">
		<PriceChart {points} width={variant === 'mobile' ? 320 : 274} height={90} />
		{#if loading}
			<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px]">
				yükleniyor…
			</div>
		{/if}
	</div>

	<!-- Periyot düğmeleri -->
	<div class="flex gap-1">
		{#each PERIODS as p (p.id)}
			<button
				type="button"
				onclick={() => (period = p.id)}
				class="flex-1 py-0.5 text-[10px] border transition-colors
				       {period === p.id
					? 'border-term-green text-term-green bg-term-panelLight'
					: 'border-term-border text-term-text opacity-60 hover:opacity-100'}"
			>
				{p.label}
			</button>
		{/each}
	</div>

	<!-- Bakiye / pozisyon -->
	<div class="text-[10px] text-term-text opacity-70 border-t border-term-border pt-1">
		Bende: <span class="opacity-100 font-bold">{held.toFixed(4)}</span> adet
		{#if heldUsd() !== undefined} · {displayUsd(usd(heldUsd()!))}{/if}
	</div>

	<!-- Gerçek işlem -->
	<TradeForm {store} assetId={row.id} />
</div>
