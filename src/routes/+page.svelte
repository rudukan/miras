<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { createLiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import type { PeriodDays } from '$lib/stores/liveGameStore.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import NetWorthMirror from '$lib/components/NetWorthMirror.svelte';
	import WalletSummary from '$lib/components/WalletSummary.svelte';
	import PriceList from '$lib/components/PriceList.svelte';
	import TradePanel from '$lib/components/TradePanel.svelte';
	import ContextCard from '$lib/components/ContextCard.svelte';

	const store = createLiveGameStore();

	let phase = $state<'intro' | 'playing'>('intro');
	let selectedPeriod = $state<PeriodDays>(365);
	let selectedAssetId = $state<string | null>(null);
	let nowMs = $state(Date.now());
	let tick: ReturnType<typeof setInterval> | null = null;

	const periodOptions: { value: PeriodDays; label: string }[] = [
		{ value: 60, label: '60 Gün' },
		{ value: 180, label: '180 Gün' },
		{ value: 365, label: '365 Gün' },
	];

	function handleStart() {
		store.setPeriod(selectedPeriod);
		if (browser) {
			void store.start();
			tick = setInterval(() => (nowMs = Date.now()), 1000);
		}
		phase = 'playing';
	}

	onDestroy(() => {
		store.stop();
		if (tick) clearInterval(tick);
	});
</script>

<div class="bg-term-bg text-term-text font-mono min-h-screen">
	{#if phase === 'intro'}
		<!-- ── INTRO EKRANI ─────────────────────────────────────────────────────── -->
		<main class="min-h-screen flex items-center justify-center px-4">
			<div class="w-full max-w-sm space-y-6">
				<!-- Başlık -->
				<div class="text-center space-y-2">
					<div class="text-term-green text-xl font-bold glow-text-green tracking-widest">
						[ MİRAS — CANLI ÇEKİRDEK ]
					</div>
					<div class="text-term-blue text-xs tracking-widest uppercase">
						Mod: CANLI
					</div>
					<div class="text-term-text text-xs opacity-60">
						$1.000.000 USD · Gerçek piyasa verileri
					</div>
				</div>

				<!-- Periyot seçimi -->
				<div class="bg-term-panel border border-term-border p-4 space-y-3">
					<div class="text-term-text opacity-50 text-[10px] uppercase tracking-wider">
						Oyun Süresi
					</div>
					<div class="space-y-2">
						{#each periodOptions as opt (opt.value)}
							<label class="flex items-center gap-3 cursor-pointer group">
								<input
									type="radio"
									name="period"
									value={opt.value}
									bind:group={selectedPeriod}
									class="accent-term-green"
								/>
								<span class="text-sm {selectedPeriod === opt.value ? 'text-term-green glow-text-green font-bold' : 'text-term-text group-hover:text-term-blue'}">
									{opt.label}
								</span>
							</label>
						{/each}
					</div>
				</div>

				<!-- Başla butonu -->
				<button
					type="button"
					onclick={handleStart}
					class="w-full py-3 bg-term-bg border border-term-green text-term-green font-bold
					       text-sm tracking-widest uppercase hover:bg-term-panelLight
					       glow-border-green transition-colors"
				>
					BAŞLA ▶
				</button>
			</div>
		</main>

	{:else}
		<!-- ── PLAYING EKRANI ───────────────────────────────────────────────────── -->
		<div class="flex flex-col h-screen">
			<!-- Üst durum bandı -->
			<header class="shrink-0">
				<StatusBadge
					stale={store.dataStale}
					asOf={store.asOf}
					feedStatus={store.feedStatus}
					now={nowMs}
				/>
				<ContextCard />
			</header>

			<!-- Ana içerik: iki kolon -->
			<div class="flex flex-1 overflow-hidden gap-0">
				<!-- Sol kolon: fiyat listesi -->
				<aside class="w-72 shrink-0 border-r border-term-border overflow-hidden flex flex-col">
					<PriceList
						prices={store.prices}
						onSelect={(id) => (selectedAssetId = id)}
					/>
				</aside>

				<!-- Sağ kolon: bilgi panelleri (dikey yığın, kaydırılabilir) -->
				<main class="flex-1 overflow-y-auto p-3 space-y-3">
					<NetWorthMirror
						netWorthUsd={store.netWorthUsd}
						profitRate={store.profitRate}
						vsUsdHoldUsd={store.vsUsdHoldUsd}
					/>

					<WalletSummary
						game={store.game}
						usdTry={store.usdTry}
					/>

					<TradePanel
						{store}
						{selectedAssetId}
					/>
				</main>
			</div>
		</div>
	{/if}
</div>
