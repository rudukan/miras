<!-- src/lib/components/AssetPopover.svelte -->
<script lang="ts">
	import type { LiveGameStore, PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { type PeriodId, seriesChangePct } from '$lib/domain/series/series';
	import { displayTry, dailyChangeBadge } from './format';
	import PriceChart from './chart/PriceChart.svelte';
	import PeriodTabs from './chart/PeriodTabs.svelte';
	import PositionSummary from './PositionSummary.svelte';
	import TradeForm from './TradeForm.svelte';
	import { createSeriesLoader } from './chart/useSeries.svelte';

	interface Props {
		store: LiveGameStore;
		row: PriceRow;
		variant?: 'desktop' | 'mobile';
		onClose: () => void;
		/** Verilirse başlıkta ⤢ BÜYÜT düğmesi — tam boy ChartOverlay'i açar. */
		onExpand?: () => void;
		onTradeSuccess?: (message: string) => void;
	}
	let { store, row, variant = 'desktop', onClose, onExpand, onTradeSuccess }: Props = $props();

	let period = $state<PeriodId>('1G');
	// row.id + period değişince talep üzerine seri çek (yalnız bu sembol → ucuz).
	const series = createSeriesLoader(() => ({ id: row.id, source: row.source, period }));
	const changePct = $derived(seriesChangePct(series.points));
	const chg = $derived(dailyChangeBadge(row.changePct));
</script>

<div
	class="bg-term-panel border border-term-borderGlow font-mono text-xs p-3 space-y-2
	       {variant === 'mobile' ? 'w-full rounded-t-lg' : 'w-[300px] shadow-lg'}"
>
	<!-- Başlık + büyüt + kapat -->
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
		<div class="flex items-center gap-1 shrink-0">
			{#if onExpand}
				<button
					type="button"
					onclick={onExpand}
					class="text-term-blue opacity-70 hover:opacity-100 px-1 text-[10px] font-bold"
				>⤢ BÜYÜT</button>
			{/if}
			<button
				type="button"
				onclick={onClose}
				class="text-term-text opacity-50 hover:opacity-100 px-1"
				aria-label="Kapat"
			>✕</button>
		</div>
	</div>

	<!-- Grafik -->
	<div class="relative">
		<PriceChart points={series.points} width={variant === 'mobile' ? 320 : 274} height={90} assetId={row.id} source={row.source} {period} />
		{#if series.loading}
			<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px]">
				yükleniyor…
			</div>
		{/if}
	</div>

	<PeriodTabs {period} onSelect={(p) => (period = p)} {changePct} />

	<PositionSummary {store} assetId={row.id} />

	<!-- Gerçek işlem -->
	<TradeForm {store} assetId={row.id} {onTradeSuccess} />
</div>
