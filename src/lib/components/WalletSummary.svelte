<script lang="ts">
	import type { GameState } from '$lib/stores/gameState';
	import { formatMoney } from '$lib/domain/money';

	interface Props {
		game: GameState;
		usdTry: number;
	}

	let { game, usdTry }: Props = $props();

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
		<div class="text-term-text opacity-50 text-[10px] uppercase tracking-wider mb-1.5">
			Pozisyonlar
		</div>

		{#if game.holdings.length === 0}
			<div class="text-term-text opacity-40 italic">Pozisyon yok</div>
		{:else}
			<div class="space-y-1">
				{#each game.holdings as h (h.assetId)}
					<div class="flex justify-between items-start gap-2 border-b border-term-border border-opacity-30 pb-1 last:border-0 last:pb-0">
						<div class="flex flex-col">
							<span class="text-term-text font-bold">{h.assetId}</span>
							<span class="text-term-text opacity-50 text-[10px]">
								{h.units.toFixed(4)} adet
							</span>
						</div>
						<div class="text-right">
							<div class="text-term-text opacity-70 text-[10px]">ort. maliyet</div>
							<div class="text-term-amber">{formatMoney(h.avgCost)}</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
