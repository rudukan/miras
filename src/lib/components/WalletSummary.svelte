<script lang="ts">
	import type { GameState } from '$lib/stores/gameState';
	import type { PositionRow, PriceRow } from '$lib/stores/liveGameStore.svelte';
	import type { PendingOrder } from '$lib/domain/orders/orders';
	import { nextMarketOpen } from '$lib/domain/calendar/calendar';
	import { usd, formatMoney } from '$lib/domain/money';
	import { displayUsd, signedUsd, pnlClass, dailyChangeBadge, positionPnl, formatOpenEta } from './format';

	interface Props {
		game: GameState;
		usdTry: number;
		liveUsdTry: number;
		positions: PositionRow[];
		onSelect?: (assetId: string) => void;
		highlightAssetId?: string | null;
		/** Kuyruktaki emirler (Task 3) — boşsa "BEKLEYEN EMİRLER" bölümü gösterilmez. */
		pendingOrders?: PendingOrder[];
		/** Son settle turunun dolum/iptal bildirimi. */
		orderNotice?: string | null;
		/** Reaktif "şimdi" damgası — ETA hesapları ve settle bildirimi bunu okur. */
		nowMs?: number;
		onCancelOrder?: (orderId: string) => void;
		onClearNotice?: () => void;
		/** Bekleyen emrin kategorisini çözmek için — Task 3'ün TEK doğru kaynağı (store.prices). */
		prices?: PriceRow[];
	}

	let {
		game,
		usdTry,
		liveUsdTry,
		positions,
		onSelect,
		highlightAssetId,
		pendingOrders = [],
		orderNotice = null,
		nowMs = Date.now(),
		onCancelOrder,
		onClearNotice,
		prices = [],
	}: Props = $props();

	const usdRate = $derived(usdTry.toFixed(2));
	const liveRate = $derived(liveUsdTry.toFixed(2));

	/** Bekleyen bir emrin kategorisi — `prices`'tan çözülür (Task 3: pendingOrders'ın assetId'si
	 *  her zaman prices'ta bulunur; activeBist/activeUs/CORE_ASSETS zaten oradan gelir). */
	function orderCategory(assetId: string): PriceRow['category'] | undefined {
		return prices.find((p) => p.id === assetId)?.category;
	}

	/** ETA etiketi — yalnız bist/us için `nextMarketOpen` anlamlıdır (diğerlerinde hep açık,
	 *  `at`'ı aynen döner → anlamsız "az sonra" üretmesin diye burada hiç çağrılmaz). */
	function orderEta(assetId: string): string {
		const category = orderCategory(assetId);
		if (category !== 'bist' && category !== 'us') return 'veri gelince';
		const openMs = nextMarketOpen(category, new Date(nowMs)).getTime();
		return formatOpenEta(openMs, nowMs);
	}
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
			<span class="text-term-text opacity-50 text-[10px]">mühürlü ₺{usdRate}</span>
			<span class="text-term-blue text-[10px]">piyasa ₺{liveRate}</span>
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

	<!-- Bekleyen emirler (Task 3: piyasa kapalı/veri bayatken kuyruğa alınanlar) -->
	{#if pendingOrders.length > 0}
		<div>
			<div class="text-term-text opacity-50 text-[10px] uppercase tracking-wider mb-1.5">
				Bekleyen Emirler
			</div>
			<div>
				{#each pendingOrders as o (o.id)}
					<div class="flex justify-between items-start gap-2 border-b border-term-border border-opacity-30 py-1 first:pt-0 last:border-0 last:pb-0">
						<div class="flex flex-col">
							<span class="text-term-text">
								<span class={o.side === 'buy' ? 'text-term-green' : 'text-term-red'}>{o.side === 'buy' ? 'AL' : 'SAT'}</span>
								<span class="font-bold">{o.assetId}</span>
							</span>
							<span class="text-term-text opacity-50 text-[10px]">
								{o.kind === 'units' ? `${o.units} adet` : displayUsd(o.amountUsd)} · {orderEta(o.assetId)}
							</span>
						</div>
						<button
							type="button"
							onclick={() => onCancelOrder?.(o.id)}
							class="shrink-0 px-1.5 py-0.5 bg-term-bg border border-term-red text-term-red text-[10px]
							       hover:bg-term-panelLight transition-colors"
						>
							İPTAL
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Son settle bildirimi (dolum/iptal) -->
	{#if orderNotice !== null}
		<div class="border border-term-amber bg-term-bg px-2.5 py-1.5 text-term-amber text-[11px] leading-snug flex items-start justify-between gap-2">
			<span>{orderNotice}</span>
			<button
				type="button"
				onclick={() => onClearNotice?.()}
				class="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
				aria-label="Bildirimi kapat"
			>
				×
			</button>
		</div>
	{/if}
</div>
