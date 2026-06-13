<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { createLiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import {
		loadGame,
		saveGame,
		clearSave,
		getOrCreatePlayerId,
		loadHistory,
		saveHistory,
	} from '$lib/stores/savegame';
	import { istanbulParts } from '$lib/domain/calendar/calendar';
	import { daysElapsed, dailyBreakdown } from '$lib/domain/snapshot/dailySnapshot';
	import { buildClosingCardModel } from '$lib/components/closingCard';
	import type { ShareResult } from '$lib/share/share';
	import { sendTelemetry, pingDailyVisit } from '$lib/api/telemetry';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import NetWorthMirror from '$lib/components/NetWorthMirror.svelte';
	import NetWorthMini from '$lib/components/NetWorthMini.svelte';
	import WalletSummary from '$lib/components/WalletSummary.svelte';
	import PriceList from '$lib/components/PriceList.svelte';
	import TradePanel from '$lib/components/TradePanel.svelte';
	import ContextCard from '$lib/components/ContextCard.svelte';
	import ClosingCard from '$lib/components/ClosingCard.svelte';
	import DailyBreakdown from '$lib/components/DailyBreakdown.svelte';

	const CARD_SEEN_KEY = 'miras.cardSeen';

	const initial = browser ? loadGame(localStorage) : null;
	const initialHistory = browser ? loadHistory(localStorage)?.history : undefined;
	const playerId = browser ? getOrCreatePlayerId(localStorage) : 'local-player';

	if (browser) pingDailyVisit(localStorage, playerId, istanbulParts(new Date()).key);

	const store = createLiveGameStore({
		playerId,
		initial,
		initialHistory,
		onPersist: (envelope) => {
			if (browser) saveGame(localStorage, envelope);
		},
		onPersistHistory: (history) => {
			if (browser) saveHistory(localStorage, { v: 1, history });
		},
	});

	let phase = $state<'intro' | 'playing'>('intro');
	let selectedAssetId = $state<string | null>(null);
	let nowMs = $state(Date.now());
	let showCard = $state(false);
	let tick: ReturnType<typeof setInterval> | null = null;

	// Kayıtlı oyunun gerçek takvim günü (İstanbul) — "DEVAM ET" ekranında gösterilir.
	const savedDay = initial ? daysElapsed(initial.game.createdAt, Date.now()) : 0;

	const canShowCard = $derived(store.netWorthUsd !== null && store.vsUsdHoldUsd !== null);
	const breakdown = $derived(dailyBreakdown(store.history));
	const closingCardModel = $derived.by(() => {
		if (store.netWorthUsd === null || store.vsUsdHoldUsd === null) return null;
		return buildClosingCardModel(store.game, store.netWorthUsd, store.vsUsdHoldUsd, store.history, nowMs);
	});

	// Otomatik tetik (retention anı): geçmişte bugünden ÖNCE bir kayıt varsa ve kart bugün
	// henüz gösterilmediyse — günde max 1.
	function maybeAutoShowCard() {
		if (!browser || !canShowCard) return;
		const todayKey = istanbulParts(new Date(Date.now())).key;
		const hasOlderSnapshot = (initialHistory ?? []).some((s) => s.dateKey < todayKey);
		if (hasOlderSnapshot && localStorage.getItem(CARD_SEEN_KEY) !== todayKey) {
			showCard = true;
			localStorage.setItem(CARD_SEEN_KEY, todayKey);
		}
	}

	function handleSelectAsset(id: string) {
		selectedAssetId = id;
		// Mobil: liste üstte, işlem paneli görünmez alanda — seçimde panele kaydır.
		if (browser && window.innerWidth < 768) {
			document.getElementById('trade-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	function handleShareClick() {
		sendTelemetry(playerId, 'share_click');
	}

	function handleShareResult(result: ShareResult) {
		void result;
		sendTelemetry(playerId, 'share_done');
	}

	async function startTicking() {
		phase = 'playing';
		if (browser) {
			tick = setInterval(() => (nowMs = Date.now()), 1000);
			await store.start();
			maybeAutoShowCard();
		}
	}

	function handleStart() {
		void startTicking();
	}

	function handleContinue() {
		void startTicking();
	}

	function handleResetSave() {
		if (browser) {
			clearSave(localStorage);
			location.reload();
		}
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

				{#if initial}
					<!-- Kayıtlı oyun bulundu -->
					<div class="bg-term-panel border border-term-border p-4 space-y-3 text-center">
						<div class="text-term-text opacity-50 text-[10px] uppercase tracking-wider">
							Kayıtlı oyun bulundu
						</div>
						<div class="text-term-blue text-xs">
							{savedDay}. günündesin
						</div>
					</div>

					<button
						type="button"
						onclick={handleContinue}
						class="w-full py-3 bg-term-bg border border-term-green text-term-green font-bold
						       text-sm tracking-widest uppercase hover:bg-term-panelLight
						       glow-border-green transition-colors"
					>
						DEVAM ET ▶
					</button>

					<button
						type="button"
						onclick={handleResetSave}
						class="w-full text-center text-[10px] text-term-text opacity-50 underline
						       hover:opacity-80 transition-opacity"
					>
						Sıfırla ve yeni oyun
					</button>
				{:else}
					<!-- Başla butonu (süre seçimi yok — açık uçlu gerçek-zaman) -->
					<button
						type="button"
						onclick={handleStart}
						class="w-full py-3 bg-term-bg border border-term-green text-term-green font-bold
						       text-sm tracking-widest uppercase hover:bg-term-panelLight
						       glow-border-green transition-colors"
					>
						BAŞLA ▶
					</button>
				{/if}
			</div>
		</main>

	{:else}
		<!-- ── PLAYING EKRANI ───────────────────────────────────────────────────── -->
		<!-- h-dvh: mobil tarayıcıda adres çubuğu hesaba katılır (h-screen alt kesme yapar) -->
		<div class="flex flex-col h-dvh">
			<!-- Üst durum bandı -->
			<header class="shrink-0">
				<div class="flex items-stretch">
					<div class="flex-1 min-w-0">
						<StatusBadge
							stale={store.dataStale}
							asOf={store.asOf}
							feedStatus={store.feedStatus}
							now={nowMs}
						/>
					</div>
					<button
						type="button"
						onclick={() => (showCard = true)}
						disabled={!canShowCard}
						class="px-3 py-1.5 bg-term-panel border border-l-0 border-term-border
						       text-term-blue text-xs font-mono uppercase tracking-widest whitespace-nowrap
						       hover:bg-term-panelLight transition-colors
						       disabled:opacity-30 disabled:cursor-not-allowed"
					>
						Günün Kartı
					</button>
				</div>

				<!-- Mini servet bandı: yalnız mobil — "param ne oldu" her an göz önünde -->
				<div class="md:hidden">
					<NetWorthMini
						netWorthUsd={store.netWorthUsd}
						profitRate={store.profitRate}
						vsUsdHoldUsd={store.vsUsdHoldUsd}
					/>
				</div>

				<ContextCard />
			</header>

			<!-- Ana içerik: mobilde TEK akışta kayan dikey yığın / md+ iki kolon (kolon içi kaydırma) -->
			<div class="flex-1 overflow-y-auto md:overflow-hidden">
				<div class="md:flex md:h-full">
					<!-- Fiyat listesi: mobilde akışın parçası (tam liste), md+ sol kolon (içte kayar) -->
					<aside
						class="border-b border-term-border
						       md:w-72 md:shrink-0 md:border-b-0 md:border-r md:overflow-hidden md:flex md:flex-col"
					>
						<PriceList
							prices={store.prices}
							onSelect={handleSelectAsset}
							onAddBist={(symbol) => {
								store.addBist(symbol);
								handleSelectAsset(symbol);
							}}
						/>
					</aside>

					<!-- Bilgi panelleri (dikey yığın; md+ kendi içinde kayar) -->
					<!-- pb: iOS home çubuğu güvenli alanı (viewport-fit=cover ile içerik kenara uzanır) -->
					<main class="px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-3 md:flex-1 md:overflow-y-auto">
						<NetWorthMirror
							netWorthUsd={store.netWorthUsd}
							profitRate={store.profitRate}
							vsUsdHoldUsd={store.vsUsdHoldUsd}
						/>

						<WalletSummary
							game={store.game}
							usdTry={store.usdTry}
							positions={store.positions}
						/>

						<DailyBreakdown rows={breakdown} />

						<div id="trade-panel" class="scroll-mt-2">
							<TradePanel
								{store}
								{selectedAssetId}
							/>
						</div>
					</main>
				</div>
			</div>
		</div>

		{#if showCard && closingCardModel}
			<ClosingCard
				model={closingCardModel}
				onShareClick={handleShareClick}
				onShare={handleShareResult}
				onClose={() => (showCard = false)}
			/>
		{/if}
	{/if}
</div>
