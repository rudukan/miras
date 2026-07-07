<script lang="ts">
	import type { GameState } from '$lib/stores/gameState';
	import type { PositionRow } from '$lib/stores/liveGameStore.svelte';
	import { usd, formatMoney } from '$lib/domain/money';
	import { displayUsd, signedUsd, pnlClass, dailyChangeBadge, positionPnl } from './format';

	interface Props {
		game: GameState;
		usdTry: number;
		positions: PositionRow[];
		onSelect?: (assetId: string) => void;
		highlightAssetId?: string | null;
	}

	let { game, usdTry, positions, onSelect, highlightAssetId }: Props = $props();

	const usdRate = $derived(usdTry.toFixed(2));
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-3">
	<!-- Başlık -->
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		CÜZDAN
	</div>

	<!-- Nakit (tek: USD) + parite göstergesi -->
	<div class="space-y-1.5">
		<div class="flex justify-between items-center">
			<span class="text-term-text opacity-70">USD nakit</span>
			<span class="text-term-green glow-text-green font-bold">
				{formatMoney(game.usdBalance)}
			</span>
		</div>
		<div class="flex justify-between items-center pt-0.5">
			<span class="text-term-text opacity-50 text-[10px]">USD/TRY</span>
			<span class="text-term-blue text-[10px]">₺{usdRate}</span>
		</div>
	</div>

	<!-- Pozisyonlar (USD değer + K/Z) -->
	<div>
		<div class="text-term-text opacity-50 text-[10px] uppercase tracking-wider mb-1.5 flex justify-between">
			<span>Pozisyonlar</span>
			<span class="opacity-70">değer · K/Z</span>
		</div>

		{#if positions.length === 0}
			<div class="text-term-text opacity-40 italic">Pozisyon yok</div>
		{:else}
			<div>
				{#each positions as p (p.assetId)}
					{@const pnl = positionPnl(p.units, p.avgCostUsd, p.valueUsd)}
					{@const pctBadge = dailyChangeBadge(pnl.pnlPct)}
					<button
						type="button"
						onclick={() => onSelect?.(p.assetId)}
						class="w-full text-left flex justify-between items-start gap-2 border-b border-term-border border-opacity-30 py-1 first:pt-0 last:border-0 last:pb-0
						       hover:bg-term-panelLight hover:border-term-borderGlow focus:outline-none focus:bg-term-panelLight
						       transition-colors duration-75 cursor-pointer
						       {p.assetId === highlightAssetId ? 'bg-term-panelLight border-term-borderGlow' : ''}"
					>
						<div class="flex flex-col">
							<span class="text-term-text font-bold">{p.assetId}</span>
							<span class="text-term-text opacity-50 text-[10px]">
								{p.units.toFixed(4)} adet
							</span>
						</div>
						<div class="text-right">
							<div class="text-term-text">{displayUsd(p.valueUsd === undefined ? null : usd(p.valueUsd))}</div>
							<div class="text-[10px] flex items-center justify-end gap-1.5">
								<span class={pnlClass(pnl.pnl ?? null)}>{signedUsd(pnl.pnl === undefined ? null : usd(pnl.pnl))}</span>
								{#if pctBadge}<span class={pctBadge.cls}>({pctBadge.text})</span>{/if}
							</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
