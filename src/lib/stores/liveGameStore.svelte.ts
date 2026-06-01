import type { Money } from '../domain/money';
import { usd } from '../domain/money';
import type { GameState } from './gameState';
import {
  createGameState,
  buyAsset,
  sellAsset,
  convertUsdToTry,
  convertTryToUsd,
  netWorthUsd as netWorthUsdFn,
  STARTING_USD,
} from './gameState';
import { createLiveFxEngine, type LivePriceSource } from '../domain/fx/liveFx';
import { isMarketOpen } from '../domain/calendar/calendar';
import type { AssetCategory } from '../domain/scenario/types';
import { LIVE_ASSETS, CATALOG, CRYPTO_SYMBOLS, BIST_SYMBOLS } from '../catalog/liveAssets';
import { fetchFxSnapshot } from '../api/fx';
import {
  createBinanceFeed,
  fetchCryptoSnapshot,
  type BinanceFeedOptions,
  type BinanceFeed,
} from '../api/binance';
import type { FxValue } from '../api/types';

export type PeriodDays = 60 | 180 | 365;

/** PriceList satırı — canlı katalog fiyatı + market-açık rozeti. */
export interface PriceRow {
  id: string;
  label: string;
  category: AssetCategory;
  source: 'crypto' | 'yahoo';
  priceTry: number | undefined; // canlı fiyat yoksa undefined
  marketOpen: boolean;
}

/** WalletSummary satırı — holding + güncel değer. */
export interface PositionRow {
  assetId: string;
  label: string;
  units: number;
  avgCostTry: number;
  priceTry: number | undefined;
  valueTry: number | undefined;
}

export interface LiveGameStoreOptions {
  playerId?: string;
  seed?: number;
  periodDays?: PeriodDays;
  // --- test/SSR enjeksiyonu ---
  fetchFn?: typeof fetch;
  makeFeed?: (opts: BinanceFeedOptions) => BinanceFeed;
  now?: () => number;
  pollMs?: number;
  throttleMs?: number;
}

export interface LiveGameStore {
  readonly game: GameState;
  readonly netWorthUsd: Money | null;
  readonly profitRate: number | null;
  readonly vsUsdHoldUsd: Money | null;
  readonly positions: PositionRow[];
  readonly prices: PriceRow[];
  readonly usdTry: number;
  readonly dataStale: boolean;
  readonly asOf: number;
  readonly feedStatus: 'live' | 'stale';
  readonly lastError: string | null;
  readonly selectedPeriodDays: PeriodDays;
  buy(assetId: string, units: number): void;
  sell(assetId: string, units: number): void;
  usdToTry(amount: Money): void;
  tryToUsd(amount: Money): void;
  setPeriod(days: PeriodDays): void;
  start(): Promise<void>;
  stop(): void;
}

/** Canlı veri gelene kadar makul TRY/USD zemini (netWorth ilk render'da çökmesin). */
const FALLBACK_FX: FxValue = { usdTry: 40, prices: {} };

/**
 * Canlı çekirdek reaktif store'u — **factory** (sınıf/modül-global rune YOK; her çağrı
 * izole state → SSR'de istekler arası sızıntı olmaz). Factory yan-etkisizdir; canlı kaynaklar
 * yalnız `start()` ile açılır ve `start()` yalnızca tarayıcıda (`+page` onMount) çağrılır.
 */
export function createLiveGameStore(opts: LiveGameStoreOptions = {}): LiveGameStore {
  const now = opts.now ?? (() => Date.now());
  const playerId = opts.playerId ?? 'local-player';
  const seed = opts.seed ?? 1;
  const pollMs = opts.pollMs ?? 5000;
  const throttleMs = opts.throttleMs ?? 500;
  const fetchFn = opts.fetchFn ?? fetch;
  const makeFeed = opts.makeFeed ?? ((o: BinanceFeedOptions) => createBinanceFeed(o));

  // --- reaktif durum ---
  let game = $state<GameState>(createGameState('canli', seed, playerId, now()));
  let fxCache = $state<FxValue>(FALLBACK_FX); // tüm fiyatlar TRY
  let cryptoUsd = $state<Record<string, number>>({}); // USD (TRY çevrimi source'da)
  let fxAsOf = $state(0);
  let fxStale = $state(true);
  let feedStatus = $state<'live' | 'stale'>('stale');
  let lastError = $state<string | null>(null);
  let selectedPeriodDays = $state<PeriodDays>(opts.periodDays ?? 365);

  // Canlı fiyat kaynağı — rune okur → her zaman güncel; createLiveFxEngine tek seam.
  const source: LivePriceSource = {
    usdTry: () => fxCache.usdTry,
    assetTry: (id) => {
      const m = CATALOG[id];
      if (!m) return undefined;
      if (m.source === 'crypto') {
        const u = cryptoUsd[id];
        return u === undefined ? undefined : u * fxCache.usdTry;
      }
      return fxCache.prices[id];
    },
  };
  const fx = createLiveFxEngine(source);

  // --- türev değerler ($derived; render bunlardan, setInterval yalnız cache'i besler) ---
  // netWorth: holding fiyatı yoksa reducer throw eder → try/catch ile null'a düşürülür (UI "—").
  const netWorth = $derived.by<Money | null>(() => {
    try {
      return netWorthUsdFn(game, fx);
    } catch {
      return null;
    }
  });
  const profit = $derived(netWorth === null ? null : netWorth.amount / STARTING_USD);
  const vsUsdHold = $derived(netWorth === null ? null : usd(netWorth.amount - STARTING_USD));

  const positions = $derived.by<PositionRow[]>(() =>
    game.holdings.map((h) => {
      const price = source.assetTry(h.assetId);
      return {
        assetId: h.assetId,
        label: CATALOG[h.assetId]?.label ?? h.assetId,
        units: h.units,
        avgCostTry: h.avgCost.amount,
        priceTry: price,
        valueTry: price === undefined ? undefined : price * h.units,
      };
    }),
  );

  const prices = $derived.by<PriceRow[]>(() => {
    const at = new Date(now());
    return LIVE_ASSETS.map((m) => ({
      id: m.id,
      label: m.label,
      category: m.category,
      source: m.source,
      priceTry: source.assetTry(m.id),
      marketOpen: isMarketOpen(m.category, at),
    }));
  });

  const dataStale = $derived(fxStale || feedStatus === 'stale');

  // --- yazma aksiyonları (guard → reducer → immutable reassign + updatedAt damga → hata yüzeyle) ---
  function apply(fn: () => GameState): void {
    try {
      game = { ...fn(), updatedAt: now() };
      lastError = null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  const buy = (assetId: string, units: number) => apply(() => buyAsset(game, fx, assetId, units));
  const sell = (assetId: string, units: number) => apply(() => sellAsset(game, fx, assetId, units));
  const usdToTry = (amount: Money) => apply(() => convertUsdToTry(game, fx, amount));
  const tryToUsd = (amount: Money) => apply(() => convertTryToUsd(game, fx, amount));
  const setPeriod = (days: PeriodDays) => {
    selectedPeriodDays = days;
  };

  // --- canlı veri yaşam döngüsü ---
  let feed: BinanceFeed | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: Record<string, number> = {};
  let started = false;

  function flushCrypto(): void {
    cryptoUsd = { ...cryptoUsd, ...pending };
    pending = {};
  }
  function onPrice(coin: string, u: number): void {
    pending[coin] = u;
    if (throttleMs <= 0) {
      flushCrypto();
      return;
    }
    // trailing throttle: aşırı $derived re-hesabını önler (yüksek frekanslı WS)
    if (throttleTimer === null) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        flushCrypto();
      }, throttleMs);
    }
  }
  function onStatus(s: 'live' | 'stale'): void {
    feedStatus = s;
  }

  async function pollFx(): Promise<void> {
    try {
      const snap = await fetchFxSnapshot({ bist: [...BIST_SYMBOLS], fetchFn });
      fxCache = snap.value;
      fxAsOf = snap.asOf;
      fxStale = snap.stale;
    } catch (e) {
      fxStale = true;
      lastError = e instanceof Error ? e.message : String(e);
    }
    // WS stale ise kripto'yu proxy snapshot'undan tazele (fallback)
    if (feedStatus === 'stale') {
      try {
        const c = await fetchCryptoSnapshot({ coins: [...CRYPTO_SYMBOLS], fetchFn });
        cryptoUsd = { ...cryptoUsd, ...c.value.prices };
      } catch {
        /* fallback başarısız — sessiz; fxStale/dataStale zaten "veri eski" yüzeyliyor */
      }
    }
  }

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    feed = makeFeed({ symbols: [...CRYPTO_SYMBOLS], onPrice, onStatus });
    pollTimer = setInterval(() => void pollFx(), pollMs);
    await pollFx(); // ilk çekim
  }
  function stop(): void {
    started = false;
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
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
      return fxCache.usdTry;
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
    get selectedPeriodDays() {
      return selectedPeriodDays;
    },
    buy,
    sell,
    usdToTry,
    tryToUsd,
    setPeriod,
    start,
    stop,
  };
}
