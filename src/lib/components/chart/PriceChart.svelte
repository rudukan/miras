<!-- src/lib/components/chart/PriceChart.svelte -->
<script lang="ts">
	import {
		computeChartGeometry,
		timeTicks,
		nearestIndex,
		seriesCurrency,
		tooltipTimeLabel,
		type PricePoint,
		type PeriodId,
		type SeriesSource,
	} from '$lib/domain/series/series';
	import { seriesPriceLabel } from '../format';
	import { renderChart, withAlpha } from './drawChart';

	interface Props {
		points: PricePoint[];
		width?: number;
		height?: number;
		assetId: string;
		source: SeriesSource;
		period: PeriodId;
	}
	let { points, width = 260, height = 90, assetId, source, period }: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let hoverIndex = $state<number | null>(null);

	const geometry = $derived(computeChartGeometry(points, width, height));
	const currency = $derived(seriesCurrency(assetId, source));
	// Genişliğe göre 2-6 eksen etiketi (~90px başına bir).
	const ticks = $derived(timeTicks(points, period, Math.max(2, Math.min(6, Math.floor(width / 90)))));

	// term.* token'larının gerçek renk değerlerini computed style'dan al
	// (fallback'ler tailwind.config.ts değerleriyle birebir; hard-coded tema rengi yazma).
	function cssVar(name: string, fallback: string): string {
		if (typeof window === 'undefined' || !canvas) return fallback;
		const v = getComputedStyle(canvas).getPropertyValue(name).trim();
		return v || fallback;
	}

	$effect(() => {
		const g = geometry;
		const c = canvas;
		if (!c) return;
		const lineColor =
			g === null || g.rising
				? cssVar('--color-term-green', '#00ff66')
				: cssVar('--color-term-red', '#ff3366');
		renderChart(c, g, {
			w: width,
			h: height,
			dpr: window.devicePixelRatio || 1,
			lineColor,
			refColor: withAlpha(cssVar('--color-term-text', '#a3b8cc'), 0.35),
		});
	});

	function onPointerMove(e: PointerEvent) {
		if (points.length < 2) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		hoverIndex = nearestIndex(points.length, (e.clientX - rect.left) / rect.width);
	}
	function onPointerLeave() {
		hoverIndex = null;
	}

	// Crosshair/tooltip modeli — points kısalırsa stale-index koruması.
	const hover = $derived.by(() => {
		if (hoverIndex === null || geometry === null || hoverIndex >= points.length) return null;
		const pt = points[hoverIndex];
		const xy = geometry.points[hoverIndex];
		return {
			x: xy.x,
			y: xy.y,
			priceLabel: seriesPriceLabel(pt.price, currency),
			timeLabel: tooltipTimeLabel(pt.t, period),
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (salt işaretçi/dokunmatik crosshair katmanı — bilgiler statik etiketlerde de var; tam erişilebilirlik SP3b'de) -->
<div
	class="relative select-none"
	style="width:{width}px;height:{height}px;touch-action:none"
	onpointermove={onPointerMove}
	onpointerleave={onPointerLeave}
>
	<canvas bind:this={canvas} class="block w-full h-full"></canvas>
	{#if geometry !== null}
		<span class="absolute top-0.5 left-1 text-[9px] leading-none text-term-text opacity-70 bg-term-panel/70 px-0.5 pointer-events-none">
			{seriesPriceLabel(geometry.max, currency)}
		</span>
		<span class="absolute bottom-0.5 left-1 text-[9px] leading-none text-term-text opacity-70 bg-term-panel/70 px-0.5 pointer-events-none">
			{seriesPriceLabel(geometry.min, currency)}
		</span>
		{#if hover !== null}
			<div class="absolute top-0 bottom-0 w-px bg-term-text opacity-30 pointer-events-none" style="left:{hover.x}px"></div>
			<div class="absolute w-1.5 h-1.5 rounded-full bg-term-blue pointer-events-none" style="left:{hover.x - 3}px;top:{hover.y - 3}px"></div>
			<div
				class="absolute top-1 text-[9px] leading-tight bg-term-bg border border-term-border px-1 py-0.5 pointer-events-none whitespace-nowrap z-10"
				style={hover.x > width * 0.55 ? `right:${width - hover.x + 6}px` : `left:${hover.x + 6}px`}
			>
				<div class="text-term-text font-bold">{hover.priceLabel}</div>
				<div class="text-term-text opacity-60">{hover.timeLabel}</div>
			</div>
		{/if}
	{:else}
		<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px] italic">
			veri yok
		</div>
	{/if}
</div>
{#if geometry !== null && ticks.length > 0}
	<!-- Zaman ekseni: canvas altında ince HTML satırı (indeks-tabanlı x, çizgiyle aynı ölçek) -->
	<div class="relative h-3.5 text-[9px] text-term-text opacity-50 pointer-events-none font-mono" style="width:{width}px">
		{#each ticks as tk (tk.index)}
			{@const x = geometry.points[tk.index].x}
			<span
				class="absolute top-0.5 leading-none whitespace-nowrap"
				style={x < 24 ? `left:${x}px` : x > width - 32 ? `right:${width - x}px` : `left:${x}px;transform:translateX(-50%)`}
			>{tk.label}</span>
		{/each}
	</div>
{/if}
