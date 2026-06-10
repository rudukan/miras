<script lang="ts">
	import type { PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { displayTry, displayUsd, dailyChangeBadge } from './format';

	interface Props {
		row: PriceRow;
		onSelect: (id: string) => void;
	}

	let { row, onSelect }: Props = $props();

	const hasPrice = $derived(row.priceTry !== undefined);
	// Fiyat henüz gelmediyse % rozeti de gizlenir ("—" + canlı rozet tutarsızlığı olmaz).
	const chg = $derived(hasPrice ? dailyChangeBadge(row.changePct) : null);
</script>

<button
	type="button"
	onclick={() => onSelect(row.id)}
	class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
	       hover:bg-term-panelLight hover:border-term-borderGlow
	       focus:outline-none focus:bg-term-panelLight
	       transition-colors duration-75 cursor-pointer {hasPrice ? '' : 'opacity-40'}"
>
	<div class="flex items-center justify-between gap-2">
		<span class="text-term-text font-bold truncate">{row.label}</span>
		<div class="flex flex-col items-end shrink-0">
			<div class="flex items-baseline gap-2">
				{#if chg}
					<span class="text-[10px] {chg.cls} font-bold">{chg.text}</span>
				{/if}
				{#if !row.marketOpen}
					<span class="text-[10px] text-term-amber">KAPALI</span>
				{/if}
				<span class="text-term-green font-bold">{displayTry(row.priceTry)}</span>
			</div>
			<span class="text-[10px] text-term-text opacity-50">
				≈ {displayUsd(row.priceUsd === undefined ? null : usd(row.priceUsd))}
			</span>
		</div>
	</div>
</button>
