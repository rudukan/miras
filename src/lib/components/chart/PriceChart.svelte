<!-- src/lib/components/chart/PriceChart.svelte -->
<script lang="ts">
	import { computeChartGeometry, type PricePoint } from '$lib/domain/series/series';

	interface Props {
		points: PricePoint[];
		width?: number;
		height?: number;
	}
	let { points, width = 260, height = 90 }: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	const geometry = $derived(computeChartGeometry(points, width, height));

	// term.* token'larının gerçek renk değerlerini computed style'dan al (hard-coded #hex yok).
	function cssVar(name: string, fallback: string): string {
		if (typeof window === 'undefined' || !canvas) return fallback;
		const v = getComputedStyle(canvas).getPropertyValue(name).trim();
		return v || fallback;
	}

	$effect(() => {
		const g = geometry;
		const c = canvas;
		if (!c) return;
		const ctx = c.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);
		if (!g) return;
		ctx.beginPath();
		g.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
		ctx.strokeStyle = g.rising ? cssVar('--color-term-green', '#00ff66') : cssVar('--color-term-red', '#ff3366');
		ctx.lineWidth = 1.5;
		ctx.stroke();
	});
</script>

<div class="relative" style="width:{width}px;height:{height}px">
	<canvas bind:this={canvas} {width} {height} class="block"></canvas>
	{#if geometry === null}
		<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px] italic">
			veri yok
		</div>
	{/if}
</div>
