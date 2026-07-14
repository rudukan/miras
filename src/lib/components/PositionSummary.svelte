<!-- src/lib/components/PositionSummary.svelte -->
<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { displayUsd, dailyChangeBadge, heldUnits, positionPnl, pnlClass, signedUsd } from './format';

	interface Props {
		store: LiveGameStore;
		assetId: string;
	}
	let { store, assetId }: Props = $props();

	const held = $derived(heldUnits(store.positions, assetId));
	const heldUsd = $derived(store.positions.find((p) => p.assetId === assetId)?.valueUsd);
	// Maliyet + K/Z (WalletSummary ile aynı hesap) — pozisyon yoksa undefined, satır gizlenir.
	const posPnl = $derived.by(() => {
		const avgCostUsd = store.positions.find((p) => p.assetId === assetId)?.avgCostUsd;
		if (avgCostUsd === undefined || heldUsd === undefined) return undefined;
		return { avgCostUsd, ...positionPnl(held, avgCostUsd, heldUsd) };
	});
</script>

<div class="text-[10px] text-term-text opacity-70 border-t border-term-border pt-1">
	Bende: <span class="opacity-100 font-bold">{held.toFixed(4)}</span> adet
	{#if heldUsd !== undefined} · {displayUsd(usd(heldUsd))}{/if}
</div>
{#if posPnl}
	{@const pctBadge = dailyChangeBadge(posPnl.pnlPct)}
	<div class="text-[10px] text-term-text opacity-70 flex items-center gap-1.5">
		<span>Maliyet: {displayUsd(usd(posPnl.avgCostUsd))}/adet</span>
		<span class="opacity-40">·</span>
		<span class={pnlClass(posPnl.pnl ?? null)}>
			{signedUsd(posPnl.pnl === undefined ? null : usd(posPnl.pnl))}
		</span>
		{#if pctBadge}<span class={pctBadge.cls}>({pctBadge.text})</span>{/if}
	</div>
{/if}
