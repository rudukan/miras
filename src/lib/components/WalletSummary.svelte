<script lang="ts">
	import type { GameState } from '$lib/stores/gameState';
	import type { PositionRow } from '$lib/stores/liveGameStore.svelte';
	import { formatMoney } from '$lib/domain/money';
	import { displayTry, signedTry, pnlClass, dailyChangeBadge, positionPnl } from './format';

	interface Props {
		game: GameState;
		usdTry: number;
		positions: PositionRow[];
	}

	let { game, usdTry, positions }: Props = $props();

	const usdRate = $derived(usdTry.toFixed(2));
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-3">
	<!-- Başlık -->
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		CÜZDAN
	</div>

	<!-- Nakit bakiyeleri -->
	<div class="space-y-1.5">
		<div class="flex justify-between items-center">
			<span class="text-term-text opacity-70">USD nakit</span>
			<span class="text-term-green glow-text-green font-bold">
				{formatMoney(game.usdBalance)}
			</span>
		</div>
		<div class="flex justify-between items-center">
			<span class="text-term-text opacity-70">TRY nakit</span>
			<span class="text-term-amber font-bold">
				{formatMoney(game.tryBalance)}
			</span>
		</div>
		<div class="flex justify-between items-center pt-0.5">
			<span class="text-term-text opacity-50 text-[10px]">USD/TRY</span>
			<span class="text-term-blue text-[10px]">₺{usdRate}</span>
		</div>
	</div>

	<!-- Pozisyonlar -->
	<div>
		<div class="text-term-text opacity-50 text-[10px] uppercase tracking-wider mb-1.5 flex justify-between">
			<span>Pozisyonlar</span>
			<span class="opacity-70">değer · K/Z</span>
		</div>

		{#if positions.length === 0}
			<div class="text-term-text opacity-40 italic">Pozisyon yok</div>
		{:else}
			<div class="space-y-1">
				{#each positions as p (p.assetId)}
					{@const pnl = positionPnl(p.units, p.avgCostTry, p.valueTry)}
					{@const pctBadge = dailyChangeBadge(pnl.pnlPct)}
					<div class="flex justify-between items-start gap-2 border-b border-term-border border-opacity-30 pb-1 last:border-0 last:pb-0">
						<div class="flex flex-col">
							<span class="text-term-text font-bold">{p.assetId}</span>
							<span class="text-term-text opacity-50 text-[10px]">
								{p.units.toFixed(4)} adet
							</span>
						</div>
						<div class="text-right">
							<div class="text-term-text">{displayTry(p.valueTry)}</div>
							<div class="text-[10px] flex items-center justify-end gap-1.5">
								<span class={pnlClass(pnl.pnlTry ?? null)}>{signedTry(pnl.pnlTry)}</span>
								{#if pctBadge}<span class={pctBadge.cls}>({pctBadge.text})</span>{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
