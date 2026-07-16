import type { Money } from '../domain/money';
import { usd } from '../domain/money';
import type { GameState } from './gameState';
import {
  createGameState,
  buyAsset,
  sellAsset,
  netWorthPartsUsd,
  openDeposit,
  breakDeposit,
  buyProperty,
  sellProperty,
  collectPropertyRent,
  STARTING_USD,
} from './gameState';
import type { LivePriceSource } from '../domain/fx/liveFx';
import type { UsdPriceOracle } from '../domain/fx/usdOracle';
import { isMarketOpen } from '../domain/calendar/calendar';
import type { AssetCategory } from '../domain/scenario/types';
import { CATALOG, CRYPTO_SYMBOLS, CRYPTO_SET, CORE_ASSETS, BIST_SYMBOLS } from '../catalog/liveAssets';
import { bistName } from '../catalog/bist100';
import { usStockName } from '../catalog/usStocks';
import { fetchFxSnapshot } from '../api/fx';
import {
  createBinanceFeed,
  fetchCryptoSnapshot,
  type BinanceFeedOptions,
  type BinanceFeed,
} from '../api/binance';
import type { FxValue } from '../api/types';
import type { SaveEnvelopeV1, SealedFx } from './savegame';
import { istanbulParts } from '../domain/calendar/calendar';
import { computeAllocation, upsertSnapshot, type DailySnapshot } from '../domain/snapshot/dailySnapshot';
import { currentValueTry, type ActiveDeposit } from '../domain/deposit/deposit';
import { accruedRentTry, type OwnedProperty } from '../domain/property/property';

/** PriceList satırı — canlı katalog fiyatı + market-açık rozeti + günlük % değişim. */
export interface PriceRow {
  id: string;
  label: string;
  category: AssetCategory;
  source: 'crypto' | 'yahoo';
  priceTry: number | undefined; // canlı fiyat yoksa undefined
  priceUsd: number | undefined; // USD karşılığı (kripto kayıpsız, diğer = TRY/kur)
  marketOpen: boolean;
  changePct: number | undefined; // günlük/24s % değişim; yoksa undefined (rozet gösterilmez)
}

/** WalletSummary satırı — holding + güncel USD değer. */
export interface PositionRow {
  assetId: string;
  label: string;
  units: number;
  avgCostUsd: number;
  priceUsd: number | undefined;
  valueUsd: number | undefined;
}

export interface LiveGameStoreOptions {
  playerId?: string;
  seed?: number;
  /** localStorage'dan yüklenmiş kayıt — verilirse game/activeBist bundan kurulur. */
  initial?: SaveEnvelopeV1 | null;
  /** Her durum değişikliğinde (apply/addBist) çağrılır — persistence buradan yapılır. */
  onPersist?: (envelope: SaveEnvelopeV1) => void;
  /** localStorage'dan yüklenmiş günlük kapanış geçmişi. */
  initialHistory?: DailySnapshot[];
  /** Her snapshot upsert'inden sonra çağrılır — history persistence buradan yapılır. */
  onPersistHistory?: (history: DailySnapshot[]) => void;
  // --- test/SSR enjeksiyonu ---
  fetchFn?: typeof fetch;
  makeFeed?: (opts: BinanceFeedOptions) => BinanceFeed;
  now?: () => number;
  pollMs?: number;
  throttleMs?: number;
  /** Gün içi mühür-yenileme eşiği (oran, örn. 0.0075 = %0.75). Canlı kur mühürden bu kadar
   *  saparsa aynı gün (dateKey değişmeden) reseal edilir — gürültüde sakin, gerçek harekette hızlı. */
  resealThresholdPct?: number;
}

export interface LiveGameStore {
  readonly game: GameState;
  readonly netWorthUsd: Money | null;
  readonly profitRate: number | null;
  readonly vsUsdHoldUsd: Money | null;
  readonly positions: PositionRow[];
  readonly prices: PriceRow[];
  readonly usdTry: number;
  readonly liveUsdTry: number;
  readonly dataStale: boolean;
  readonly asOf: number;
  readonly feedStatus: 'live' | 'stale';
  readonly lastError: string | null;
  readonly history: DailySnapshot[];
  readonly deposit: ActiveDeposit | null;
  readonly properties: OwnedProperty[];
  buy(assetId: string, units: number): void;
  sell(assetId: string, units: number): void;
  openDeposit(usdAmount: number): void;
  breakDeposit(): void;
  buyProperty(propertyId: string): void;
  sellProperty(propertyId: string): void;
  collectRent(propertyId: string): void;
  assetUsdPrice(assetId: string): number | undefined;
  addBist(symbol: string): void;
  addUs(symbol: string): void;
  start(): Promise<void>;
  stop(): void;
}

/** Canlı veri gelene kadar makul TRY/USD zemini (netWorth ilk render'da çökmesin). */
const FALLBACK_FX: FxValue = { usdTry: 40, prices: {} };

/** Bir assetId on-demand (BIST100) sembol mü? — katalogda yok ya da kategorisi 'bist'. */
function isBistLikeId(id: string): boolean {
  const meta = CATALOG[id];
  return meta === undefined || meta.category === 'bist';
}

/** activeBist restore birleşimi: katalog başlangıç hisseleri ∪ kayıtlı set ∪ holding'lerdeki BIST id'leri.
 *  US holding'leri (activeUs'te zaten izlenenler) HARİÇ TUTULUR — yoksa isBistLikeId CATALOG'da
 *  olmayan her id'yi (US dahil) "BIST'miş gibi" sayıp aynı sembolü activeBist'e de sızdırır. */
function computeInitialActiveBist(initial: SaveEnvelopeV1 | null): string[] {
  const fromSave = initial?.activeBist ?? [];
  const savedUs = new Set(initial?.activeUs ?? []);
  const fromHoldings = (initial?.game.holdings ?? [])
    .map((h) => h.assetId)
    .filter((id) => isBistLikeId(id) && !savedUs.has(id));
  return Array.from(new Set([...BIST_SYMBOLS, ...fromSave, ...fromHoldings]));
}

/** activeUs restore: yalnız kayıtlı set — yeni özellik, eski/bozuk kayıt riski yok
 *  (bir US holding'i hep kendi activeUs'uyla birlikte kaydedilmiş olacak). */
function computeInitialActiveUs(initial: SaveEnvelopeV1 | null): string[] {
  return initial?.activeUs ?? [];
}

/** Holding etiketi: CATALOG → BIST100 → US_STOCKS sırayla dener (positions'ta hangi
 *  kataloğun sembolü olduğu bilinmez). bistName/usStockName bilinmeyende sembolün
 *  kendisini döner, bu yüzden "değişmedi mi" testiyle bir sonraki kataloğa düşülür. */
function holdingLabel(id: string): string {
  const catalogLabel = CATALOG[id]?.label;
  if (catalogLabel) return catalogLabel;
  const bist = bistName(id);
  if (bist !== id) return bist;
  return usStockName(id);
}

/**
 * Canlı çekirdek reaktif store'u — **factory** (sınıf/modül-global rune YOK; her çağrı
 * izole state → SSR'de istekler arası sızıntı olmaz). Factory yan-etkisizdir; canlı kaynaklar
 * yalnız `start()` ile açılır ve `start()` yalnızca tarayıcıda (`+page` onMount) çağrılır.
 */
export function createLiveGameStore(opts: LiveGameStoreOptions = {}): LiveGameStore {
  const now = opts.now ?? (() => Date.now());
  const playerId = opts.playerId ?? 'local-player';
  const seed = opts.seed ?? 1;
  // fix-B: FX poll'u yavaşlat (hisse yavaş değişir) → Yahoo rate-limit kök sebebini keser.
  // Kripto WS push ile hızlı kalır; bu poll yalnız FX + kripto 24s%/WS-stale fallback içindir.
  const pollMs = opts.pollMs ?? 20000;
  const throttleMs = opts.throttleMs ?? 500;
  const resealThresholdPct = opts.resealThresholdPct ?? 0.0075;
  const fetchFn = opts.fetchFn ?? fetch;
  const makeFeed = opts.makeFeed ?? ((o: BinanceFeedOptions) => createBinanceFeed(o));

  const initial = opts.initial ?? null;

  // --- reaktif durum ---
  // "Duvar saati" cache'i: start()'ta 1s'de bir now() ile tazelenir (setInterval yalnız state
  // besliyor, DOM'a dokunmaz — mevcut poll kalıbıyla aynı). depositUsd/propertiesUsd bunu okur
  // ki aksiyon olmasa da mevduat/kira tahakkuku ekranda akıyor görünsün (audit P1). Aksiyon-zamanı
  // hesaplamalar (apply/openDeposit vb.) enjekte edilebilir now()'ı kullanmaya devam eder.
  let nowMsTick = $state(now());
  let game = $state<GameState>(initial?.game ?? createGameState('canli', seed, playerId, now()));
  let fxCache = $state<FxValue>(FALLBACK_FX); // tüm fiyatlar TRY
  let cryptoUsd = $state<Record<string, number>>({}); // USD (TRY çevrimi source'da)
  let cryptoChange = $state<Record<string, number>>({}); // coin → 24s % (poll'dan; WS değişim taşımaz)
  let fxAsOf = $state(0);
  let fxStale = $state(true);
  let feedStatus = $state<'live' | 'stale'>('stale');
  let lastError = $state<string | null>(null);
  // Dinamik aktif BIST seti — başlangıç = katalog başlangıç hisseleri ∪ kayıtlı set ∪ holding'lerdeki
  // BIST sembolleri (yoksa on-demand alınan hissenin fiyatı poll edilmez → oracle throw → netWorth null).
  let activeBist = $state<string[]>(computeInitialActiveBist(initial));
  // Dinamik aktif ABD hisse seti — sabit varsayılan YOK (kullanıcı kararı: yalnız arama ile ekle).
  let activeUs = $state<string[]>(computeInitialActiveUs(initial));
  // Hibrit USD/TRY: WS usdttry tick'i (birincil); yokken/stale'ken Yahoo'ya düşülür.
  let liveUsdTry = $state<number | undefined>(undefined);
  // Günlük kapanış geçmişi — pollFx sonunda netWorth biliniyorsa upsert edilir.
  let history = $state<DailySnapshot[]>(opts.initialHistory ?? []);
  // Günlük mühürlü operatif kur: İstanbul gün-anahtarı değişince bir kez yakalanır.
  // Net servet/işlem bunu kullanır → gün-içi canlı kur gürültüsü net serveti oynatmaz.
  let sealedFx = $state<SealedFx | null>(initial?.sealedFx ?? null);

  // WS canlı + tick var → WS; aksi halde Yahoo (fxCache); o da yoksa FALLBACK_FX.usdTry.
  const effectiveUsdTry = (): number =>
    feedStatus === 'live' && liveUsdTry !== undefined ? liveUsdTry : fxCache.usdTry;
  // Operatif kur (işlem + değerleme) — mühür yoksa (ilk poll öncesi kısa pencere) canlı kura düşülür.
  const sealedUsdTry = (): number => sealedFx?.rate ?? effectiveUsdTry();

  // Canlı fiyat kaynağı — rune okur → her zaman güncel; createLiveFxEngine tek seam.
  const source: LivePriceSource = {
    usdTry: () => effectiveUsdTry(),
    assetTry: (id) => {
      // Kripto: USD fiyatını canlı kurla TRY'ye çevir.
      if (CRYPTO_SET.has(id)) {
        const u = cryptoUsd[id];
        return u === undefined ? undefined : u * sealedUsdTry();
      }
      // Diğer her şey (BIST/emtia/döviz) proxy'den zaten TRY gelir — CATALOG üyeliği gerekmez
      // (on-demand aranan BIST sembolleri de böyle çözülür).
      return fxCache.prices[id];
    },
  };
  // USD fiyat oracle'ı — motor (reducer'lar) bunu tüketir; parite çevrimi burada.
  // Kripto: cryptoUsd doğrudan (kayıpsız). BIST/emtia/döviz: TRY fiyat / canlı kur.
  const oracle: UsdPriceOracle = {
    assetUsd: (id) => {
      if (CRYPTO_SET.has(id)) {
        const u = cryptoUsd[id];
        if (u === undefined) throw new Error(`No live price: ${id}`);
        return usd(u);
      }
      const t = fxCache.prices[id];
      if (t === undefined) throw new Error(`No live price: ${id}`);
      return usd(t / sealedUsdTry());
    },
  };

  // --- türev değerler ($derived; render bunlardan, setInterval yalnız cache'i besler) ---
  // netWorth: nakit + fiyatlanabilen HER holding (netWorthPartsUsd) — bir holding'in fiyatı
  // eksikse yalnız o holding atlanır, toplam nakite çökmez (audit P1). Eksik veri varsa
  // netWorthDataComplete=false olur; kâr göstergeleri (profit/vsUsdHold) o zaman null kalır,
  // ama netWorth kendisi hep bilinen kısmi toplamı gösterir (asla null değil).
  // Mevduat USD değeri (mark-to-market): anapara + birikmiş net faiz / canlı kur.
  const depositUsd = $derived(
    game.deposit === null ? 0 : currentValueTry(game.deposit, nowMsTick).amount / sealedUsdTry(),
  );
  // Emlak USD değeri: bedel (TL sabit) + kasadaki birikmiş kira, mühürlü kurdan.
  const propertiesUsd = $derived.by<number>(() => {
    let total = 0;
    for (const p of game.properties) {
      total += (p.priceTryAtBuy.amount + accruedRentTry(p, nowMsTick).amount) / sealedUsdTry();
    }
    return total;
  });
  const nwParts = $derived(netWorthPartsUsd(game, oracle));
  const netWorth = $derived<Money>(usd(nwParts.totalUsd + depositUsd + propertiesUsd));
  // Bir holding fiyatı eksikse netWorth kısmi toplama düşer (asla null değil) — ama
  // recordSnapshot bu eksik durumu ayrıca bilmeli, yoksa degrade değer history'yi ezer.
  const netWorthDataComplete = $derived<boolean>(nwParts.complete);
  const profit = $derived(netWorthDataComplete ? netWorth.amount / STARTING_USD : null);
  const vsUsdHold = $derived(netWorthDataComplete ? usd(netWorth.amount - STARTING_USD) : null);

  const positions = $derived.by<PositionRow[]>(() =>
    game.holdings.map((h) => {
      let priceUsd: number | undefined;
      try {
        priceUsd = oracle.assetUsd(h.assetId).amount;
      } catch {
        priceUsd = undefined;
      }
      return {
        assetId: h.assetId,
        label: holdingLabel(h.assetId),
        units: h.units,
        avgCostUsd: h.avgCost.amount,
        priceUsd,
        valueUsd: priceUsd === undefined ? undefined : priceUsd * h.units,
      };
    }),
  );

  const prices = $derived.by<PriceRow[]>(() => {
    const at = new Date(now());
    const rows: PriceRow[] = [];
    // Çekirdek: kripto + emtia + döviz — her zaman görünür.
    for (const m of CORE_ASSETS) {
      rows.push({
        id: m.id,
        label: m.label,
        category: m.category,
        source: m.source,
        priceTry: source.assetTry(m.id),
        priceUsd: assetUsdPrice(m.id),
        marketOpen: isMarketOpen(m.category, at),
        changePct: m.source === 'crypto' ? cryptoChange[m.id] : fxCache.change?.[m.id],
      });
    }
    // Aktif BIST: tutulan/seçilen hisseler (canlı ?bist= ile çekilir).
    const bistOpen = isMarketOpen('bist', at);
    for (const sym of activeBist) {
      rows.push({
        id: sym,
        label: bistName(sym),
        category: 'bist',
        source: 'yahoo',
        priceTry: fxCache.prices[sym],
        priceUsd: assetUsdPrice(sym),
        marketOpen: bistOpen,
        changePct: fxCache.change?.[sym],
      });
    }
    // Aktif ABD hisseleri: tutulan/seçilen hisseler (canlı ?us= ile çekilir).
    const usOpen = isMarketOpen('us', at);
    for (const sym of activeUs) {
      rows.push({
        id: sym,
        label: usStockName(sym),
        category: 'us',
        source: 'yahoo',
        priceTry: fxCache.prices[sym],
        priceUsd: assetUsdPrice(sym),
        marketOpen: usOpen,
        changePct: fxCache.change?.[sym],
      });
    }
    return rows;
  });

  const dataStale = $derived(fxStale || feedStatus === 'stale');

  // --- persistence ---
  function persist(): void {
    opts.onPersist?.({ v: 1, game, activeBist, activeUs, sealedFx: sealedFx ?? undefined });
  }

  // --- yazma aksiyonları (guard → reducer → immutable reassign + updatedAt damga → hata yüzeyle) ---
  function apply(fn: () => GameState): void {
    try {
      game = { ...fn(), updatedAt: now() };
      lastError = null;
      persist();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  const buy = (assetId: string, units: number) => apply(() => buyAsset(game, oracle, assetId, units));
  const sell = (assetId: string, units: number) => apply(() => sellAsset(game, oracle, assetId, units));
  const openDepositAction = (usdAmount: number) =>
    apply(() => openDeposit(game, sealedUsdTry(), usdAmount, now()));
  const breakDepositAction = () => apply(() => breakDeposit(game, sealedUsdTry(), now()));
  const buyPropertyAction = (propertyId: string) =>
    apply(() => buyProperty(game, sealedUsdTry(), propertyId, now()));
  const sellPropertyAction = (propertyId: string) =>
    apply(() => sellProperty(game, sealedUsdTry(), propertyId, now()));
  const collectRentAction = (propertyId: string) =>
    apply(() => collectPropertyRent(game, sealedUsdTry(), propertyId, now()));
  /** Seçili varlığın USD fiyatı (TradePanel MAX + maliyet yankısı için); fiyat yoksa undefined. */
  function assetUsdPrice(assetId: string): number | undefined {
    try {
      return oracle.assetUsd(assetId).amount;
    } catch {
      return undefined;
    }
  }
  // On-demand BIST: aktif sete ekle (normalize + idempotent) → hemen tek seferlik poll ile fiyatı getir.
  const addBist = (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (s === '' || activeBist.includes(s)) return;
    activeBist = [...activeBist, s];
    persist();
    if (started) void pollFx(); // anında fiyat çek (≤poll periyodu beklemeden)
  };
  // On-demand ABD hissesi: addBist ile birebir aynı gövde, activeUs setine ekler.
  const addUs = (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (s === '' || activeUs.includes(s)) return;
    activeUs = [...activeUs, s];
    persist();
    if (started) void pollFx();
  };

  // --- canlı veri yaşam döngüsü ---
  let feed: BinanceFeed | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: Record<string, number> = {};
  let started = false;

  let pendingUsdTry: number | undefined = undefined;
  function flushPending(): void {
    if (Object.keys(pending).length > 0) {
      cryptoUsd = { ...cryptoUsd, ...pending };
      pending = {};
    }
    if (pendingUsdTry !== undefined) {
      liveUsdTry = pendingUsdTry;
      pendingUsdTry = undefined;
    }
  }
  function onPrice(coin: string, u: number): void {
    pending[coin] = u;
    if (throttleMs <= 0) {
      flushPending();
      return;
    }
    // trailing throttle: aşırı $derived re-hesabını önler (yüksek frekanslı WS)
    if (throttleTimer === null) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        flushPending();
      }, throttleMs);
    }
  }
  function onStatus(s: 'live' | 'stale'): void {
    feedStatus = s;
  }
  function onFxRate(pair: string, rate: number): void {
    if (pair !== 'USDTTRY') return;
    pendingUsdTry = rate;
    if (throttleMs <= 0) {
      flushPending();
      return;
    }
    if (throttleTimer === null) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        flushPending();
      }, throttleMs);
    }
  }

  async function pollFx(): Promise<void> {
    try {
      const snap = await fetchFxSnapshot({ bist: [...activeBist], us: [...activeUs], fetchFn });
      // fix-A: stale snapshot (fallback) son-gerçek fiyatı EZMESİN — yalnız taze veride güncelle.
      if (!snap.stale) {
        fxCache = snap.value;
        fxAsOf = snap.asOf;
      }
      fxStale = snap.stale;
    } catch (e) {
      fxStale = true;
      lastError = e instanceof Error ? e.message : String(e);
    }
    // Kripto: 24s % değişim WS'te yok → her poll'da proxy snapshot'undan tazelenir.
    // Fiyatı yalnız WS kopukken snapshot'tan al (WS canlıyken fiyat otoritesi WS'tedir).
    try {
      const c = await fetchCryptoSnapshot({ coins: [...CRYPTO_SYMBOLS], fetchFn });
      cryptoChange = c.value.change ?? {};
      if (feedStatus === 'stale') {
        cryptoUsd = { ...cryptoUsd, ...c.value.prices };
      } else {
        // WS canlıyken fiyat otoritesi WS'tedir — ama cold-start'ta (WS ilk poll yanıtından
        // önce açılırsa) düşük hacimli coin ilk trade tick'ine dek '—' kalır ve alım
        // "No live price" ile reddedilir. Yalnız henüz hiç tick almamış coin'leri tohumla.
        const seed: Record<string, number> = {};
        for (const [id, p] of Object.entries(c.value.prices)) {
          if (cryptoUsd[id] === undefined && pending[id] === undefined) seed[id] = p;
        }
        if (Object.keys(seed).length > 0) cryptoUsd = { ...seed, ...cryptoUsd };
      }
    } catch {
      /* fallback başarısız — sessiz; fxStale/dataStale zaten "veri eski" yüzeyliyor */
    }
    ensureSeal();
    recordSnapshot();
  }

  // Gün-anahtarı (İstanbul) değişince operatif kuru yeniden mühürle — yalnız GÜVENİLİR kurla
  // (canlı WS veya taze Yahoo). Stale fallback (₺40 zemini) mühürlenmez → tüm gün sahte kalmaz.
  // Eşikli mühür: gün içinde kur mühürden resealThresholdPct'ten fazla saparsa (gerçek hareket)
  // dateKey değişmeden de reseal edilir — küçük tik gürültüsü mührü etkilemez, büyük gerçek
  // hareket ise ertesi güne kadar beklemeden aynı gün yakalanır.
  function ensureSeal(): void {
    const haveRealFx = (feedStatus === 'live' && liveUsdTry !== undefined) || !fxStale;
    if (!haveRealFx) return;
    const key = istanbulParts(new Date(now())).key;
    const live = effectiveUsdTry();
    const dateChanged = sealedFx === null || sealedFx.dateKey !== key;
    const driftedTooFar =
      sealedFx !== null &&
      !dateChanged &&
      Math.abs(live - sealedFx.rate) / sealedFx.rate > resealThresholdPct;
    if (dateChanged || driftedTooFar) {
      sealedFx = { dateKey: key, rate: live };
      persist();
    }
  }

  // Fiyat eksikse ATLA — çöp veri yazılmaz. netWorth artık hep Money (kısmi toplam, asla null
  // değil — netWorthPartsUsd), bu yüzden asıl kapı burada netWorthDataComplete: eksik fiyat
  // varsa kısmi netWorth'ü snapshot'a yazmayız (vsUsdHold da complete değilse null kalır).
  function recordSnapshot(): void {
    if (vsUsdHold === null || !netWorthDataComplete) return;
    const snap: DailySnapshot = {
      dateKey: istanbulParts(new Date(now())).key,
      netWorthUsd: netWorth,
      vsUsdHoldUsd: vsUsdHold,
      allocation: computeAllocation(
        game.usdBalance.amount,
        positions.map((p) => ({ assetId: p.assetId, valueUsd: p.valueUsd ?? 0 })),
        netWorth.amount,
        (id) => CATALOG[id]?.category ?? 'bist',
        depositUsd,
      ),
      recordedAt: now(),
    };
    history = upsertSnapshot(history, snap);
    opts.onPersistHistory?.(history);
  }

  // Self-scheduling poll: bir sonraki çekim ancak öncekisi bitince planlanır — yavaş upstream
  // yanıtı üst üste binen pollFx çağrıları biriktirmez (audit P1).
  function scheduleNextPoll(): void {
    pollTimer = setTimeout(() => void runPoll(), pollMs);
  }
  async function runPoll(): Promise<void> {
    try {
      await pollFx();
    } finally {
      if (started) scheduleNextPoll();
    }
  }

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    feed = makeFeed({ symbols: [...CRYPTO_SYMBOLS], fxPairs: ['USDTTRY'], onPrice, onStatus, onFxRate });
    tickTimer = setInterval(() => {
      nowMsTick = now();
    }, 1000);
    await pollFx(); // ilk çekim
    if (started) scheduleNextPoll();
  }
  function stop(): void {
    started = false;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (throttleTimer !== null) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    feed?.stop();
    feed = null;
  }

  return {
    get game() {
      return game;
    },
    get netWorthUsd() {
      return netWorth;
    },
    get profitRate() {
      return profit;
    },
    get vsUsdHoldUsd() {
      return vsUsdHold;
    },
    get positions() {
      return positions;
    },
    get prices() {
      return prices;
    },
    get usdTry() {
      return sealedUsdTry();
    },
    get liveUsdTry() {
      return effectiveUsdTry();
    },
    get dataStale() {
      return dataStale;
    },
    get asOf() {
      return fxAsOf;
    },
    get feedStatus() {
      return feedStatus;
    },
    get lastError() {
      return lastError;
    },
    get history() {
      return history;
    },
    get deposit() {
      return game.deposit;
    },
    get properties() {
      return game.properties;
    },
    buy,
    sell,
    openDeposit: openDepositAction,
    breakDeposit: breakDepositAction,
    buyProperty: buyPropertyAction,
    sellProperty: sellPropertyAction,
    collectRent: collectRentAction,
    assetUsdPrice,
    addBist,
    addUs,
    start,
    stop,
  };
}
