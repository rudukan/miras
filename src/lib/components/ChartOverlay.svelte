<!-- src/lib/components/ChartOverlay.svelte — ⤢ BÜYÜT tam boy grafik + işlem modalı -->
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
		onClose: () => void;
		onTradeSuccess?: (message: string) => void;
	}
	let { store, row, onClose, onTradeSuccess }: Props = $props();

	let period = $state<PeriodId>('1G');
	const series = createSeriesLoader(() => ({ id: row.id, source: row.source, period }));
	const changePct = $derived(seriesChangePct(series.points));
	const chg = $derived(dailyChangeBadge(row.changePct));

	// Grafik boyutu konteynerden ölçülür (genişlik: masaüstü geniş panel/mobil tam ekran;
	// yükseklik: dialog flex kolonunda kalan alan) — sabit yükseklik laptop gibi kısa
	// viewport'larda AL/SAT'ı ekran dışına itiyordu (bkz. commit notu).
	let boxWidth = $state(0);
	let boxHeight = $state(0);
	const chartWidth = $derived(Math.max(240, Math.floor(boxWidth)));
	// PriceChart canvas kutusunun altına sabit 14px'lik (h-3.5) zaman ekseni satırı ekliyor —
	// ölçülen konteyner yüksekliğinden bunu düşmezsek toplam render konteyneri taşıp bir
	// sonraki öğeyle (PeriodTabs) çakışır.
	const TIME_AXIS_H = 14;
	const chartHeight = $derived(Math.max(160, Math.floor(boxHeight) - TIME_AXIS_H));

	let closeBtn: HTMLButtonElement | null = $state(null);
	$effect(() => {
		closeBtn?.focus();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Arka örtü -->
<button type="button" class="fixed inset-0 bg-black/70 z-[60]" aria-label="Kapat" onclick={onClose}></button>

<div
	class="fixed z-[70] bg-term-panel border border-term-borderGlow font-mono text-xs
	       inset-0 overflow-y-auto p-3 space-y-3 flex flex-col
	       md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2
	       md:w-[min(90vw,48rem)] md:max-h-[90vh] md:shadow-lg md:p-4"
	role="dialog"
	aria-modal="true"
	aria-label="{row.label} grafiği"
>
	<!-- Başlık -->
	<div class="flex items-start justify-between gap-2 border-b border-term-border pb-2 shrink-0">
		<div class="min-w-0">
			<div class="text-term-text font-bold text-sm truncate">
				{row.label} <span class="opacity-50 text-[10px]">({row.id})</span>
			</div>
			<div class="flex items-baseline gap-2">
				<span class="text-term-green font-bold text-base">{displayTry(row.priceTry)}</span>
				{#if chg}<span class="text-[10px] {chg.cls} font-bold">{chg.text}</span>{/if}
			</div>
		</div>
		<button
			bind:this={closeBtn}
			type="button"
			onclick={onClose}
			class="shrink-0 text-term-text opacity-50 hover:opacity-100 px-1"
			aria-label="Kapat"
		>✕</button>
	</div>

	<!-- Büyük grafik: dialog flex kolonunda kalan dikey alanı doldurur (bkz. chartHeight) -->
	<div class="relative flex-1 min-h-[160px] overflow-hidden" bind:clientWidth={boxWidth} bind:clientHeight={boxHeight}>
		{#if boxWidth > 0 && boxHeight > 0}
			<PriceChart points={series.points} width={chartWidth} height={chartHeight} assetId={row.id} source={row.source} {period} />
		{/if}
		{#if series.loading}
			<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px] pointer-events-none">
				yükleniyor…
			</div>
		{/if}
	</div>

	<PeriodTabs {period} onSelect={(p) => (period = p)} {changePct} />

	<PositionSummary {store} assetId={row.id} />

	<TradeForm {store} assetId={row.id} {onTradeSuccess} />
</div>
