<!-- src/lib/components/chart/PeriodTabs.svelte -->
<script lang="ts">
	import { PERIODS, type PeriodId } from '$lib/domain/series/series';
	import { dailyChangeBadge } from '../format';

	interface Props {
		period: PeriodId;
		onSelect: (p: PeriodId) => void;
		/** Seçili periyodun ilk→son değişim yüzdesi (seriesChangePct); veri yoksa undefined. */
		changePct?: number;
	}
	let { period, onSelect, changePct }: Props = $props();
	const badge = $derived(dailyChangeBadge(changePct));
</script>

<div class="flex items-center gap-1">
	{#each PERIODS as p (p.id)}
		<button
			type="button"
			onclick={() => onSelect(p.id)}
			class="flex-1 py-0.5 text-[10px] border transition-colors
			       {period === p.id
				? 'border-term-green text-term-green bg-term-panelLight'
				: 'border-term-border text-term-text opacity-60 hover:opacity-100'}"
		>
			{p.label}
		</button>
	{/each}
	{#if badge}
		<span class="shrink-0 text-[10px] font-bold {badge.cls} pl-1" title="Seçili periyot değişimi">{badge.text}</span>
	{/if}
</div>
