<script lang="ts">
	import type { PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { displayTry, displayUsd, dailyChangeBadge } from './format';

	interface Props {
		row: PriceRow;
		onSelect: (id: string) => void;
		onHover?: (id: string | null) => void;
		onOpenPopover?: (row: PriceRow, anchor: DOMRect, variant: 'desktop' | 'mobile') => void;
	}

	let { row, onSelect, onHover, onOpenPopover }: Props = $props();

	const hasPrice = $derived(row.priceTry !== undefined);
	// Fiyat henüz gelmediyse % rozeti de gizlenir ("—" + canlı rozet tutarsızlığı olmaz).
	const chg = $derived(hasPrice ? dailyChangeBadge(row.changePct) : null);

	let el: HTMLButtonElement | null = $state(null);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

	function handleEnter() {
		onHover?.(row.id);
		if (isMobile() || !el) return;
		// Masaüstü: 1 sn beklet → yanlışlıkla satır üstünden geçişte açılmaz.
		hoverTimer = setTimeout(() => onOpenPopover?.(row, el!.getBoundingClientRect(), 'desktop'), 1000);
	}
	function handleLeave() {
		onHover?.(null);
		if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
	}
	function handleClick() {
		if (isMobile() && el) {
			onOpenPopover?.(row, el.getBoundingClientRect(), 'mobile');
			return;
		}
		onSelect(row.id);
	}
</script>

<button
	type="button"
	bind:this={el}
	onclick={handleClick}
	onmouseenter={handleEnter}
	onmouseleave={handleLeave}
	class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
	       hover:bg-term-panelLight hover:border-term-borderGlow
	       focus:outline-none focus:bg-term-panelLight
	       transition-colors duration-75 cursor-pointer {hasPrice ? '' : 'opacity-40'}"
>
	<div class="flex items-center justify-between gap-2">
		<div class="flex flex-col min-w-0">
			<span class="text-term-text font-bold truncate">{row.label}</span>
			<span class="text-[10px] text-term-blue opacity-70 uppercase tracking-wide">{row.id}</span>
		</div>
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
