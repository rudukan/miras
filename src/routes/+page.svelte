<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { createLiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import {
		loadGame,
		saveGame,
		clearSave,
		getOrCreatePlayerId,
		loadHistory,
		saveHistory,
		markPendingWipe,
		consumePendingWipe,
		type SaveEnvelopeV1,
	} from '$lib/stores/savegame';
	import { chooseSource, createCloudPush, LOCAL_TOUCHED_KEY } from '$lib/stores/cloudSave';
	import { ensureSession } from '$lib/api/authBootstrap';
	import { getTurnstileToken } from '$lib/api/turnstile';
	import { istanbulParts } from '$lib/domain/calendar/calendar';
	import { daysElapsed, dailyBreakdown } from '$lib/domain/snapshot/dailySnapshot';
	import { buildClosingCardModel } from '$lib/components/closingCard';
	import type { ShareResult } from '$lib/share/share';
	import { sendTelemetry, pingDailyVisit } from '$lib/api/telemetry';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import NetWorthMirror from '$lib/components/NetWorthMirror.svelte';
	import NetWorthMini from '$lib/components/NetWorthMini.svelte';
	import WalletSummary from '$lib/components/WalletSummary.svelte';
	import DepositCard from '$lib/components/DepositCard.svelte';
	import PriceList from '$lib/components/PriceList.svelte';
	import TradePanel from '$lib/components/TradePanel.svelte';
	import ContextCard from '$lib/components/ContextCard.svelte';
	import ClosingCard from '$lib/components/ClosingCard.svelte';
	import DailyBreakdown from '$lib/components/DailyBreakdown.svelte';
	import AssetPopover from '$lib/components/AssetPopover.svelte';
	import AccountPanel from '$lib/components/panels/AccountPanel.svelte';
	import type { PriceRow } from '$lib/stores/liveGameStore.svelte';

	let { data } = $props();

	const CARD_SEEN_KEY = 'miras.cardSeen';
	const CLOUD_HYDRATED_KEY = 'miras.cloudHydrated';

	// Silme/reset sonrası ikinci temizlik: reload öncesi bir persist yarışı ya da bayat sekme
	// kodu eski kaydı geri yazmış olabilir — bayrak varsa boot her şeyi bir kez daha siler.
	if (browser) consumePendingWipe(sessionStorage, localStorage);

	const initial = browser ? loadGame(localStorage) : null;
	const initialHistory = browser ? loadHistory(localStorage)?.history : undefined;
	const playerId = browser ? getOrCreatePlayerId(localStorage) : 'local-player';

	if (browser) pingDailyVisit(localStorage, playerId, istanbulParts(new Date()).key);

	// Bulut kayit push'u: debounce'lu, hata durumunda oyunu asla durdurmaz (spec §5).
	const cloudPush = createCloudPush(async (envelope: SaveEnvelopeV1) => {
		const {
			data: { user },
		} = await data.supabase.auth.getUser();
		if (!user) return; // oturum yoksa bulut yok — oyun localStorage ile yaşar
		await data.supabase
			.from('saves')
			.upsert({ user_id: user.id, payload: envelope, schema_version: envelope.v });
	});

	const store = createLiveGameStore({
		playerId,
		initial,
		initialHistory,
		onPersist: (envelope) => {
			if (browser) {
				saveGame(localStorage, envelope);
				localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
				cloudPush.schedule(envelope);
			}
		},
		onPersistHistory: (history) => {
			if (browser) saveHistory(localStorage, { v: 1, history });
		},
	});

	let phase = $state<'intro' | 'playing'>('intro');
	let selectedAssetId = $state<string | null>(null);
	let hoveredAssetId = $state<string | null>(null);
	let nowMs = $state(Date.now());
	let showCard = $state(false);
	let tick: ReturnType<typeof setInterval> | null = null;

	let popoverRow = $state<PriceRow | null>(null);
	let popoverAnchor = $state<DOMRect | null>(null);
	let popoverVariant = $state<'desktop' | 'mobile'>('desktop');
	let popoverPinned = $state(false);
	let desktopPopoverEl: HTMLElement | null = $state(null);

	let toastMessage = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	function showToast(message: string) {
		toastMessage = message;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastMessage = null), 5000);
	}

	function openPopover(row: PriceRow, anchor: DOMRect, variant: 'desktop' | 'mobile') {
		popoverRow = row;
		popoverAnchor = anchor;
		popoverVariant = variant;
		popoverPinned = variant === 'mobile'; // mobil sheet zaten kalıcı; masaüstü tıkla/odaklan ile pinlenir
	}
	function closePopover() {
		popoverRow = null;
		popoverPinned = false;
	}
	// Masaüstü: önizleme aşamasında (henüz pinlenmemiş) pop-up dışına çıkınca kapan.
	function onPopoverLeave() {
		if (!popoverPinned) closePopover();
	}
	// Masaüstü: pop-up içine tıkla/odaklan = sabitlen (spec: "içine tıkla/odaklan = sabitlenir").
	function pinPopover() {
		if (popoverVariant === 'desktop') popoverPinned = true;
	}
	// Masaüstü: pinliyken dışına tıklama kapatır (üçüncü zorunlu kapama tetikleyicisi).
	function onWindowClick(e: MouseEvent) {
		if (
			popoverVariant === 'desktop' &&
			popoverPinned &&
			desktopPopoverEl &&
			!desktopPopoverEl.contains(e.target as Node)
		) {
			closePopover();
		}
	}
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closePopover();
	}

	// Masaüstü konumlandırma: satırın sağına, ekran taşarsa soluna.
	const popoverStyle = $derived.by(() => {
		if (!popoverAnchor || popoverVariant === 'mobile') return '';
		const W = 300, GAP = 8;
		const a = popoverAnchor;
		const left = a.right + GAP + W > window.innerWidth ? a.left - GAP - W : a.right + GAP;
		const top = Math.min(a.top, window.innerHeight - 320);
		return `position:fixed;left:${Math.max(8, left)}px;top:${Math.max(8, top)}px;z-index:50;`;
	});

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
		// İşlem paneli her zaman ana akışın altında (mobil de desktop da) — seçimde panele kaydır.
		if (browser) {
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
			markPendingWipe(sessionStorage);
			location.reload();
		}
	}

	onDestroy(() => {
		store.stop();
		if (tick) clearInterval(tick);
		if (toastTimer) clearTimeout(toastTimer);
	});

	// Boot senkronu: sessiz misafir oturumu acilir, sonra bulutta daha yeni kayit var mi bakilir
	// (cihaz degisimi senaryosu). Hata durumunda oyun localStorage ile cevrimdisi devam eder —
	// asla oyunu bloke etmez / crash etmez.
	onMount(() => {
		void (async () => {
			try {
				await ensureSession(data.supabase.auth, () => getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY));
			} catch (err) {
				console.error('[auth] misafir oturumu açılamadı — çevrimdışı devam', err);
				return;
			}
			// Bulutta daha yeni kayıt var mı? (cihaz değişimi senaryosu)
			if (sessionStorage.getItem(CLOUD_HYDRATED_KEY)) return; // reload döngüsü kilidi
			const { data: row } = await data.supabase
				.from('saves')
				.select('payload, updated_at')
				.maybeSingle();
			const touched = Number(localStorage.getItem(LOCAL_TOUCHED_KEY)) || null;
			if (row && chooseSource(touched, row.updated_at) === 'cloud') {
				saveGame(localStorage, row.payload as SaveEnvelopeV1);
				localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
				sessionStorage.setItem(CLOUD_HYDRATED_KEY, '1');
				location.reload();
			}
		})();

		const flushOnHide = () => {
			if (document.visibilityState === 'hidden') void cloudPush.flush();
		};
		document.addEventListener('visibilitychange', flushOnHide);
		return () => document.removeEventListener('visibilitychange', flushOnHide);
	});
</script>

<svelte:window onkeydown={onKeydown} onclick={onWindowClick} />
<Toast message={toastMessage} />

<div class="bg-term-bg text-term-text font-mono min-h-[100dvh]">
	{#if phase === 'intro'}
		<!-- ── INTRO EKRANI ─────────────────────────────────────────────────────── -->
		<main class="min-h-[100dvh] flex items-center justify-center px-4">
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
							onHover={(id) => (hoveredAssetId = id)}
							onOpenPopover={openPopover}
							onAddBist={(symbol) => {
								store.addBist(symbol);
								handleSelectAsset(symbol);
							}}
							onAddUs={(symbol) => {
								store.addUs(symbol);
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
							cashUsd={store.game.usdBalance}
						/>

						<AccountPanel supabase={data.supabase} />

						<WalletSummary
							game={store.game}
							usdTry={store.usdTry}
							positions={store.positions}
							onSelect={handleSelectAsset}
							highlightAssetId={hoveredAssetId}
						/>

						<DepositCard {store} nowMs={nowMs} />

						<DailyBreakdown rows={breakdown} />

						<div id="trade-panel" class="scroll-mt-2">
							<TradePanel
								{store}
								{selectedAssetId}
								onTradeSuccess={showToast}
							/>
						</div>
					</main>
				</div>
			</div>
		</div>

		{#if popoverRow}
			{#if popoverVariant === 'mobile'}
				<!-- Mobil: arka örtü + alt sheet -->
				<button type="button" class="fixed inset-0 bg-black/50 z-40" aria-label="Kapat" onclick={closePopover}></button>
				<div class="fixed inset-x-0 bottom-0 z-50">
					<AssetPopover {store} row={popoverRow} variant="mobile" onClose={closePopover} onTradeSuccess={showToast} />
				</div>
			{:else}
				<!-- Masaüstü: anchor'a konumlu; içine tıkla/odaklan = pinle, pinliyken dışa tıkla/Esc/✕ kapatır -->
				<!-- svelte-ignore a11y_click_events_have_key_events (klavye eşleniği onfocusin: Tab ile odaklanmak da pinler) -->
				<div
					bind:this={desktopPopoverEl}
					style={popoverStyle}
					role="dialog"
					tabindex="-1"
					onmouseleave={onPopoverLeave}
					onclick={pinPopover}
					onfocusin={pinPopover}
				>
					<AssetPopover {store} row={popoverRow} variant="desktop" onClose={closePopover} onTradeSuccess={showToast} />
				</div>
			{/if}
		{/if}

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
