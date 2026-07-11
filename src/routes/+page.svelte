<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { createLiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import {
		loadGame, saveGame, clearSave, getOrCreatePlayerId, loadHistory, saveHistory,
		markPendingWipe, consumePendingWipe,
		LOCAL_TOUCHED_KEY, getOwnerId, setOwnerId, clearOwnerId,
		getResetAt, markReset, persistAllowed, clearLocalIdentity,
		type SaveEnvelopeV1,
	} from '$lib/stores/savegame';
	import { chooseSource, createCloudPush } from '$lib/stores/cloudSave';
	import { initialPhase, type StartPhase } from '$lib/stores/bootPhase';
	import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
	import EmailAuthForm from '$lib/components/EmailAuthForm.svelte';
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { ensureSession } from '$lib/api/authBootstrap';
	import { getTurnstileToken } from '$lib/api/turnstile';
	import { authErrorMessage } from '$lib/api/authErrors';
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

	if (browser) consumePendingWipe(sessionStorage, localStorage);

	const initial = browser ? loadGame(localStorage) : null;
	const initialHistory = browser ? loadHistory(localStorage)?.history : undefined;

	// Kimlik ERTELENDİ (spec §4.F): playerId/telemetri yalnız oyuna girişte üretilir.
	let playerId = $state<string | null>(null);

	const cloudPush = createCloudPush(async (envelope: SaveEnvelopeV1) => {
		const {
			data: { user },
		} = await data.supabase.auth.getUser();
		if (!user) return; // oturum yoksa bulut yok — oyun localStorage ile yaşar
		if (getOwnerId(localStorage) !== user.id) return; // yabancı oyun kullanıcının kasasına yazılmaz
		await data.supabase
			.from('saves')
			.upsert({ user_id: user.id, payload: envelope, schema_version: envelope.v });
	});

	// Bayat-sekme tombstone guard'ının history persist'ine taşınması için son karar tutulur.
	let lastPersistAllowed = true;

	function makeStore(env: SaveEnvelopeV1 | null, pid?: string): LiveGameStore {
		return createLiveGameStore({
			playerId: pid ?? 'restored', // yalnız fresh oyunda okunur (liveGameStore:156,169)
			initial: env,
			initialHistory: env ? initialHistory : undefined,
			onPersist: (envelope) => {
				if (!browser) return;
				lastPersistAllowed = persistAllowed(localStorage, envelope.game.createdAt);
				if (!lastPersistAllowed) return; // ölü jenerasyon geri yazılamaz (spec §4.E)
				saveGame(localStorage, envelope);
				localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
				cloudPush.schedule(envelope);
			},
			onPersistHistory: (history) => {
				if (browser && lastPersistAllowed) saveHistory(localStorage, { v: 1, history });
			},
		});
	}

	// Kayıtlı oyun: store hemen kurulur (bugünkü davranış). Yeni oyun: girişte kurulur.
	let store = $state<LiveGameStore | null>(browser && initial ? makeStore(initial) : null);

	let phase = $state<StartPhase | 'playing'>(initialPhase(initial !== null, undefined));
	let welcomeBusy = $state(false);
	let welcomeError = $state<string | null>(null);
	let emailOpen = $state(false);
	let emailBusy = $state(false);
	let emailError = $state<string | null>(null);
	let emailSent = $state(false);
	let pwResetOpen = $state(false);
	let newPassword = $state('');
	let pwBusy = $state(false);
	let emailAuthOverlayOpen = $state(false); // oturumsuz AccountPanel'den e-posta girişi (spec §4.K)
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

	const canShowCard = $derived(store !== null && store.netWorthUsd !== null && store.vsUsdHoldUsd !== null);
	const breakdown = $derived(dailyBreakdown(store?.history ?? []));
	const closingCardModel = $derived.by(() => {
		if (!store || store.netWorthUsd === null || store.vsUsdHoldUsd === null) return null;
		return buildClosingCardModel(store.game, store.netWorthUsd, store.vsUsdHoldUsd, store.history, nowMs);
	});

	// Otomatik tetik (retention anı): geçmişte bugünden ÖNCE bir kayıt varsa ve kart bugün
	// henüz gösterilmediyse — günde max 1.
	function maybeAutoShowCard() {
		if (!browser || !store || !canShowCard) return;
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
		if (playerId) sendTelemetry(playerId, 'share_click');
	}

	function handleShareResult(result: ShareResult) {
		void result;
		if (playerId) sendTelemetry(playerId, 'share_done');
	}

	async function enterGame() {
		if (!browser) return;
		// Kimlik + günlük ziyaret pingi YALNIZ burada üretilir (spec §4.F — KVKK).
		const pid = getOrCreatePlayerId(localStorage);
		playerId = pid;
		pingDailyVisit(localStorage, pid, istanbulParts(new Date()).key);
		if (!store) store = makeStore(null, pid);
		// Yeni oyun + oturum varsa sahiplik damgası (benimseme anı, spec §4.D).
		try {
			const {
				data: { user },
			} = await data.supabase.auth.getUser();
			if (user && getOwnerId(localStorage) === null) setOwnerId(localStorage, user.id);
		} catch {
			// oturum okunamadı — çevrimdışı devam, damga sonraki boot'ta
		}
		phase = 'playing';
		tick = setInterval(() => (nowMs = Date.now()), 1000);
		await store.start();
		maybeAutoShowCard();
	}
	function handleStart() {
		void enterGame();
	}
	function handleContinue() {
		void enterGame();
	}

	function handleGoogle() {
		void data.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: location.origin + '/auth/callback' },
		});
	}

	async function handleGuest() {
		welcomeBusy = true;
		welcomeError = null;
		try {
			await ensureSession(data.supabase.auth, () => getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY));
			const {
				data: { user },
			} = await data.supabase.auth.getUser();
			if (user) setOwnerId(localStorage, user.id);
			cloudPush.enable(); // taze misafir: uzlaşacak bulut kaydı yok
			await enterGame();
		} catch (err) {
			console.error('[auth] misafir oturumu açılamadı', err);
			welcomeError = 'Misafir oturumu açılamadı — tekrar dene ya da çevrimdışı oyna';
		} finally {
			welcomeBusy = false;
		}
	}

	function handleOfflinePlay() {
		// Oturum yok: cloudPush kapalı kalır (push zaten getUser null'da no-op). Spec §4.B fail-safe.
		void enterGame();
	}

	async function withEmailBusy(fn: () => Promise<void>) {
		emailBusy = true;
		emailError = null;
		try {
			await fn();
		} catch (err) {
			console.error('[auth] e-posta akışı hatası', err);
			emailError = authErrorMessage((err as { code?: string })?.code);
		} finally {
			emailBusy = false;
		}
	}

	function handleEmailSignIn(email: string, password: string) {
		void withEmailBusy(async () => {
			const captchaToken = await getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY);
			const { error } = await data.supabase.auth.signInWithPassword({
				email,
				password,
				options: { captchaToken },
			});
			if (error) {
				emailError = authErrorMessage((error as { code?: string }).code);
				return;
			}
			const {
				data: { user },
			} = await data.supabase.auth.getUser();
			if (user && initial === null) setOwnerId(localStorage, user.id);
			// Bulut kaydı olabilir → uzlaşma reload'la boot'tan geçer (en güvenli yol).
			location.reload();
		});
	}

	function handleEmailSignUp(email: string, password: string) {
		void withEmailBusy(async () => {
			const captchaToken = await getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY);
			const { data: result, error } = await data.supabase.auth.signUp({
				email,
				password,
				options: { captchaToken },
			});
			if (error) {
				emailError = authErrorMessage((error as { code?: string }).code);
				return;
			}
			if (result.session) {
				// K8 dönemi: doğrulama kapalı → oturum hemen açılır.
				if (result.user) setOwnerId(localStorage, result.user.id);
				cloudPush.enable();
				emailOpen = false;
				emailAuthOverlayOpen = false; // panelden kayıtta overlay açık kalmasın (reload'suz tek başarı yolu)
				await enterGame();
			} else {
				// K8 sonrası (doğrulama açık): enumerasyon-nötr 'mail gönderildi' ekranı.
				emailSent = true;
			}
		});
	}

	function handleEmailForgot(email: string) {
		void withEmailBusy(async () => {
			const captchaToken = await getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY);
			const { error } = await data.supabase.auth.resetPasswordForEmail(email, { captchaToken });
			if (error) {
				emailError = authErrorMessage((error as { code?: string }).code);
				return;
			}
			emailSent = true;
		});
	}

	function handleEmailBack() {
		emailOpen = false;
		emailSent = false;
		emailError = null;
	}

	function handleUpdatePassword() {
		if (newPassword.length < 8 || pwBusy) return;
		pwBusy = true;
		void (async () => {
			try {
				const { error } = await data.supabase.auth.updateUser({ password: newPassword });
				if (error) {
					showToast(authErrorMessage((error as { code?: string }).code));
				} else {
					showToast('Şifre güncellendi');
					pwResetOpen = false;
					newPassword = '';
				}
			} catch (err) {
				console.error('[auth] şifre güncelleme hatası', err);
				showToast('Şifre güncellenemedi — tekrar dene');
			} finally {
				pwBusy = false;
			}
		})();
	}

	async function handleResetSave() {
		if (!browser) return;
		store?.stop(); // eski store'un pollTimer'ı reload penceresinde onPersist tetiklemesin
		cloudPush.cancel(); // visibilitychange flush'ı eski envelope'u geri push etmesin
		markPendingWipe(sessionStorage);
		clearSave(localStorage);
		localStorage.removeItem(LOCAL_TOUCHED_KEY);
		clearOwnerId(localStorage);
		sessionStorage.removeItem(CLOUD_HYDRATED_KEY);
		markReset(localStorage, Date.now()); // tombstone: eski jenerasyon her yerde ölü
		try {
			const {
				data: { user },
			} = await data.supabase.auth.getUser();
			if (user) await data.supabase.from('saves').delete().eq('user_id', user.id);
		} catch {
			// çevrimdışı: tombstone bu cihazı korur; yeni oyun push'u diğerlerini yakınsar
		}
		location.reload();
	}

	async function handleAccountDeleted() {
		// POST /api/account/delete BAŞARILI döndü — local dünyayı tamamen temizle (spec §4.G).
		store?.stop(); // eski store'un pollTimer'ı reload penceresinde onPersist tetiklemesin
		cloudPush.cancel();
		try {
			await data.supabase.auth.signOut();
		} catch {
			// oturum sunucuda zaten ölü (kullanıcı silindi) — local temizlik yeter
		}
		markPendingWipe(sessionStorage);
		clearSave(localStorage);
		clearLocalIdentity(localStorage);
		sessionStorage.removeItem(CLOUD_HYDRATED_KEY);
		markReset(localStorage, Date.now()); // zombi-sekme koruması silmede de (spec §4.G)
		location.reload();
	}

	async function handleSignOut(): Promise<string | null> {
		// Dönüş: hata mesajı (null = başarılı). Yalnız kalıcı hesapta çağrılır (panel gizler).
		const flushed = await cloudPush.flush();
		if (!flushed) return 'Son ilerleme buluta gönderilemedi — bağlantını kontrol edip tekrar dene';
		const { error } = await data.supabase.auth.signOut();
		if (error) return 'Çıkış yapılamadı — bağlantını kontrol et';
		store?.stop(); // eski store'un pollTimer'ı reload penceresinde onPersist tetiklemesin
		markPendingWipe(sessionStorage);
		clearSave(localStorage);
		localStorage.removeItem(LOCAL_TOUCHED_KEY);
		clearOwnerId(localStorage);
		sessionStorage.removeItem(CLOUD_HYDRATED_KEY);
		location.reload();
		return null;
	}

	async function handleSwitchAccount() {
		// identity_already_exists: misafir oyunundan VAZGEÇ, welcome'a dön (spec §4.H).
		store?.stop(); // eski store'un pollTimer'ı reload penceresinde onPersist tetiklemesin
		cloudPush.cancel();
		try {
			await data.supabase.auth.signOut();
		} catch {
			// signOut hatasında da local'i temizleyip welcome'a düşmek güvenli
		}
		markPendingWipe(sessionStorage);
		clearSave(localStorage);
		localStorage.removeItem(LOCAL_TOUCHED_KEY);
		clearOwnerId(localStorage);
		sessionStorage.removeItem(CLOUD_HYDRATED_KEY);
		location.reload();
	}

	async function handleGuestFromPanel() {
		// Oturumsuz durumdan misafir oturumu aç (spec §4.K) — reload boot uzlaşmasını işletir.
		await ensureSession(data.supabase.auth, () => getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY));
		const {
			data: { user },
		} = await data.supabase.auth.getUser();
		if (user && getOwnerId(localStorage) === null) setOwnerId(localStorage, user.id);
		location.reload();
	}

	onDestroy(() => {
		store?.stop();
		if (tick) clearInterval(tick);
		if (toastTimer) clearTimeout(toastTimer);
	});

	onMount(() => {
		// OAuth hata dönüşü: fazdan bağımsız toast + URL temizliği (spec §4.C).
		const params = new URLSearchParams(location.search);
		if (params.has('auth_error')) {
			showToast('Giriş tamamlanamadı — tekrar dene');
			history.replaceState(null, '', '/');
		}
		if (params.has('pw_reset')) {
			pwResetOpen = true;
			history.replaceState(null, '', '/');
		}

		void (async () => {
			try {
				const {
					data: { session },
				} = await data.supabase.auth.getSession();
				if (!session) {
					if (phase === 'boot') phase = 'welcome';
					return; // cloudPush kapalı kalır — push edilecek hesap yok
				}
				const userId = session.user.id;
				try {
					if (!sessionStorage.getItem(CLOUD_HYDRATED_KEY)) {
						// Hidrasyon 5 sn'de dönmezse fail-safe intro (spec §4.A + §7).
						const timeout = new Promise<never>((_, rej) =>
							setTimeout(() => rej(new Error('bulut sorgusu zaman aşımı')), 5000),
						);
						const { data: row } = (await Promise.race([
							data.supabase.from('saves').select('payload, updated_at').maybeSingle(),
							timeout,
						])) as { data: { payload: unknown; updated_at: string } | null };
						const cloudEnv = (row?.payload ?? null) as SaveEnvelopeV1 | null;
						const decision = chooseSource({
							localTouchedAt: Number(localStorage.getItem(LOCAL_TOUCHED_KEY)) || null,
							localCreatedAt: initial?.game.createdAt ?? null,
							cloudUpdatedAt: row?.updated_at ?? null,
							cloudCreatedAt: cloudEnv?.game.createdAt ?? null,
							resetAt: getResetAt(localStorage),
							localOwnerId: getOwnerId(localStorage),
							sessionUserId: userId,
						});
						if (decision === 'cloud' && cloudEnv) {
							saveGame(localStorage, cloudEnv);
							localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
							setOwnerId(localStorage, userId); // hidrasyon = benimseme anı (spec §4.D)
							sessionStorage.setItem(CLOUD_HYDRATED_KEY, '1');
							location.reload();
							return;
						}
						if (decision === 'local' || decision === 'local-adopt') {
							setOwnerId(localStorage, userId); // legacy/adopt damgası — push kapısı açılmadan önce
						}
					}
				} catch (err) {
					// Açık #SP1-minor-4: sorgu hatası boot'u kilitlemesin, unhandled rejection olmasın.
					console.error('[cloud] hidrasyon kontrolü başarısız — local ile devam', err);
				}
				cloudPush.enable(); // uzlaşma bitti — push kapısı açık (spec §4.D)
				if (phase === 'boot') phase = 'intro';
			} catch (err) {
				// getSession() (veya üstündeki adımlar) beklenmedik şekilde reddederse boot kilitlenmesin —
				// oturum durumu belirsizken güvenli varsayılan: welcome (spec: boot asla kilitlenmez).
				console.error('[cloud] boot kontrolü başarısız — güvenli varsayılana düş', err);
				if (phase === 'boot') phase = 'welcome';
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

{#if pwResetOpen}
	<div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
		<div class="w-full max-w-xs bg-term-panel border border-term-border p-4 space-y-3 font-mono">
			<div class="text-term-blue text-xs uppercase tracking-widest">Yeni şifre belirle</div>
			<input
				type="password"
				placeholder="yeni şifre (en az 8 karakter)"
				bind:value={newPassword}
				class="w-full border border-term-border bg-transparent px-2 py-1.5 text-sm"
				autocomplete="new-password"
			/>
			<button
				type="button"
				onclick={handleUpdatePassword}
				disabled={newPassword.length < 8 || pwBusy}
				class="w-full py-2 bg-term-bg border border-term-green text-term-green font-bold
				       text-xs tracking-widest uppercase hover:bg-term-panelLight
				       disabled:opacity-40 disabled:cursor-not-allowed"
			>
				{pwBusy ? 'KAYDEDİLİYOR…' : 'KAYDET'}
			</button>
			<button
				type="button"
				class="w-full text-[10px] text-term-text opacity-50 underline"
				onclick={() => (pwResetOpen = false)}
			>
				vazgeç
			</button>
		</div>
	</div>
{/if}

{#if emailAuthOverlayOpen}
	<div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
		<div class="w-full max-w-xs bg-term-panel border border-term-border p-4 font-mono">
			<EmailAuthForm
				busy={emailBusy}
				errorMsg={emailError}
				sentMode={emailSent}
				onSignIn={handleEmailSignIn}
				onSignUp={handleEmailSignUp}
				onForgot={handleEmailForgot}
				onBack={() => {
					emailAuthOverlayOpen = false;
					emailSent = false;
					emailError = null;
				}}
			/>
		</div>
	</div>
{/if}

<div class="bg-term-bg text-term-text font-mono min-h-[100dvh]">
	{#if phase === 'boot'}
		<main class="min-h-[100dvh] flex items-center justify-center px-4">
			<div class="text-center space-y-2">
				<div class="text-term-green text-xl font-bold glow-text-green tracking-widest">
					[ MİRAS — CANLI ÇEKİRDEK ]
				</div>
				<div class="text-term-text text-xs opacity-60 animate-pulse">BAĞLANIYOR…</div>
			</div>
		</main>
	{:else if phase === 'welcome'}
		<WelcomeScreen
			busy={welcomeBusy}
			errorMsg={welcomeError}
			onGoogle={handleGoogle}
			onGuest={() => void handleGuest()}
			onOffline={handleOfflinePlay}
			{emailOpen}
			onEmailOpen={() => (emailOpen = true)}
			{emailBusy}
			{emailError}
			{emailSent}
			onEmailSignIn={handleEmailSignIn}
			onEmailSignUp={handleEmailSignUp}
			onEmailForgot={handleEmailForgot}
			onEmailBack={handleEmailBack}
		/>
	{:else if phase === 'intro'}
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
						onclick={() => void handleResetSave()}
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

	{:else if store}
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
								store?.addBist(symbol);
								handleSelectAsset(symbol);
							}}
							onAddUs={(symbol) => {
								store?.addUs(symbol);
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

						<AccountPanel
							supabase={data.supabase}
							onDeleted={() => void handleAccountDeleted()}
							onSignOut={handleSignOut}
							onSwitchAccount={() => void handleSwitchAccount()}
							onGuestSession={handleGuestFromPanel}
							onEmailAuth={() => {
								pwResetOpen = false;
								emailAuthOverlayOpen = true;
							}}
						/>

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
