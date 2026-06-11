import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { createLiveGameStore } from './liveGameStore.svelte';
import type { Cached, FxValue, CryptoValue } from '../api/types';
import type { BinanceFeedOptions, BinanceFeed } from '../api/binance';

// 2026-06-01 12:00 Europe/Istanbul = Pazartesi, BIST açık saat
const FIXED_NOW = new Date('2026-06-01T12:00:00+03:00').getTime();

function resp(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function setup(overrides: Record<string, unknown> = {}) {
  let yahoo: Cached<FxValue> = {
    value: { usdTry: 40, prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 } },
    asOf: 111,
    stale: false,
  };
  let crypto: Cached<CryptoValue> = {
    value: { prices: { BTC: 60000, ETH: 3000 } },
    asOf: 111,
    stale: false,
  };
  const fetchFn = vi.fn(async (url: string) => {
    if (url.startsWith('/api/yahoo')) return resp(yahoo);
    if (url.startsWith('/api/crypto')) return resp(crypto);
    throw new Error('unexpected url ' + url);
  }) as unknown as typeof fetch;

  let feedCb: BinanceFeedOptions | undefined;
  const feedStop = vi.fn();
  const makeFeed = (o: BinanceFeedOptions): BinanceFeed => {
    feedCb = o;
    return { stop: feedStop };
  };

  const store = createLiveGameStore({
    fetchFn,
    makeFeed,
    now: () => FIXED_NOW,
    throttleMs: 0,
    pollMs: 5000,
    ...overrides,
  });

  return {
    store,
    fetchFn,
    feedStop,
    get feed() {
      if (!feedCb) throw new Error('feed not created (start() çağrılmadı)');
      return feedCb;
    },
    setYahoo: (v: Cached<FxValue>) => (yahoo = v),
    setCrypto: (v: Cached<CryptoValue>) => (crypto = v),
  };
}

afterEach(() => vi.useRealTimers());

describe('createLiveGameStore (USD-taban)', () => {
  it('1) kripto TRY gösterimi: BTC 64000 × usdTry 40 = 2.560.000 TRY (PriceList)', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onPrice('BTC', 64000);
    flushSync();
    const btc = t.store.prices.find((p) => p.id === 'BTC');
    expect(btc?.priceTry).toBe(2_560_000);
  });

  it('2) oto-takas: BTC al ($64000) → net servet ~$1M korunur (makas yok)', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onPrice('BTC', 64000);
    flushSync();
    expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000, 2);

    t.store.buy('BTC', 1); // doğrudan USD'den, oto-takas yok (kripto zaten USD)
    flushSync();

    expect(t.store.lastError).toBeNull();
    expect(t.store.game.usdBalance.amount).toBeCloseTo(1_000_000 - 64_000, 2);
    expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000, 0);
    expect(t.store.vsUsdHoldUsd?.amount).toBeCloseTo(0, 0);
  });

  it('3) BIST oto-takas: THYAO al → USD nakit düşer (300 TRY / 40 = $7.5)', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 100); // 100 × $7.5 = $750
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.usdBalance.amount).toBeCloseTo(1_000_000 - 750, 2);
    const pos = t.store.positions.find((p) => p.assetId === 'THYAO');
    expect(pos?.valueUsd).toBeCloseTo(750, 2);
    expect(pos?.avgCostUsd).toBeCloseTo(7.5, 2);
  });

  it('4) canlı tik net serveti artırır (BTC yükselince +$6000)', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onPrice('BTC', 64000);
    flushSync();
    t.store.buy('BTC', 1);
    flushSync();
    const before = t.store.netWorthUsd!.amount;

    t.feed.onPrice('BTC', 70000); // +$6000/coin × 1
    flushSync();
    const after = t.store.netWorthUsd!.amount;
    expect(after - before).toBeCloseTo(6000, 0);
  });

  it('5) stale/asOf zarfı yüzeyler', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    expect(t.store.asOf).toBe(111);
    expect(t.store.dataStale).toBe(true);
    t.feed.onStatus?.('live');
    flushSync();
    expect(t.store.dataStale).toBe(false);
  });

  it('6) WS-stale iken kripto /api/crypto poll fallback ile gelir', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    const btc = t.store.prices.find((p) => p.id === 'BTC');
    expect(btc?.priceTry).toBe(60000 * 40);
    expect(t.fetchFn).toHaveBeenCalledWith('/api/crypto?coins=BTC,ETH,SOL,XRP,DOGE,AVAX');
  });

  it('7) guard: fiyat yok / yetersiz USD / holding yok → lastError, game değişmez', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    const before = t.store.game;

    t.store.buy('DOGE', 1); // katalogda yok → canlı fiyat yok
    expect(t.store.lastError).not.toBeNull();

    t.store.buy('THYAO', 100_000_000); // 1e8 × $7.5 = $750M > $1M
    expect(t.store.lastError).toMatch(/Insufficient USD/);

    t.store.sell('ASELS', 5); // holding yok
    expect(t.store.lastError).toMatch(/Insufficient units/);

    expect(t.store.game).toBe(before);
  });

  it('8) stop() feed.stop() çağırır ve poll durur', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.store.start();
    const callsAfterStart = (t.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    t.store.stop();
    expect(t.feedStop).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20000);
    expect((t.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterStart);
  });

  it('9) netWorth throw-guard: holding fiyatı kaybolursa null (çökmez)', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.store.start();
    t.store.buy('THYAO', 100); // $750
    flushSync();
    expect(t.store.netWorthUsd?.amount).toBeGreaterThan(0);

    t.setYahoo({ value: { usdTry: 40, prices: { ASELS: 200, XAUGRAM: 5000, EUR: 45 } }, asOf: 222, stale: false });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();
    expect(t.store.netWorthUsd).toBeNull();
    expect(t.store.profitRate).toBeNull();
  });

  it('10) günlük % değişim verisi prices satırlarına akar', async () => {
    const t = setup();
    t.setYahoo({
      value: { usdTry: 40, prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 }, change: { THYAO: 2.5, XAUGRAM: -1.2 } },
      asOf: 111, stale: false,
    });
    t.setCrypto({
      value: { prices: { BTC: 60000, ETH: 3000 }, change: { BTC: 4.1 } },
      asOf: 111, stale: false,
    });
    await t.store.start();
    flushSync();

    expect(t.store.prices.find((p) => p.id === 'THYAO')?.changePct).toBe(2.5);
    expect(t.store.prices.find((p) => p.id === 'BTC')?.changePct).toBe(4.1);
    expect(t.store.prices.find((p) => p.id === 'EUR')?.changePct).toBeUndefined();
  });

  it('11) fix-A: stale poll son-gerçek fiyatı EZMEZ', async () => {
    vi.useFakeTimers();
    const t = setup({ pollMs: 5000 });
    await t.store.start();
    flushSync();
    expect(t.store.prices.find((p) => p.id === 'THYAO')?.priceTry).toBe(300);

    t.setYahoo({ value: { usdTry: 99, prices: { THYAO: 1 } }, asOf: 0, stale: true });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    expect(t.store.prices.find((p) => p.id === 'THYAO')?.priceTry).toBe(300);
    expect(t.store.usdTry).toBe(40);
    expect(t.store.dataStale).toBe(true);
  });

  it('12) on-demand: addBist + fiyat gelince oto-takas buy çalışır', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    expect(t.store.prices.some((p) => p.id === 'GARAN')).toBe(false);

    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300, ASELS: 200, GARAN: 120, XAUGRAM: 5000, EUR: 45 } }, asOf: 222, stale: false });
    t.store.addBist('garan');
    await new Promise((r) => setTimeout(r, 0));
    flushSync();

    expect(t.fetchFn).toHaveBeenCalledWith('/api/yahoo?bist=THYAO,ASELS,GARAN');
    const garan = t.store.prices.find((p) => p.id === 'GARAN');
    expect(garan?.priceTry).toBe(120);
    expect(garan?.category).toBe('bist');

    t.store.buy('GARAN', 100); // 120 TRY / 40 = $3 → 100 × $3 = $300
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.holdings.some((h) => h.assetId === 'GARAN' && h.units === 100)).toBe(true);

    const pos = t.store.positions.find((p) => p.assetId === 'GARAN');
    expect(pos?.label).toBe('Garanti BBVA');
    expect(pos?.avgCostUsd).toBeCloseTo(3, 2);
  });

  it('14) prices satırları USD karşılığını taşır (kripto kayıpsız, BIST = TRY/kur)', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onPrice('BTC', 64000);
    flushSync();
    // BTC: doğrudan USD (kayıpsız)
    expect(t.store.prices.find((p) => p.id === 'BTC')?.priceUsd).toBe(64000);
    // THYAO: 300 TRY / 40 kur = $7.5
    expect(t.store.prices.find((p) => p.id === 'THYAO')?.priceUsd).toBeCloseTo(7.5, 2);
  });

  it('15) addBist tekrarı yinelenmez (idempotent)', async () => {
    const t = setup();
    await t.store.start();
    t.store.addBist('THYAO');
    flushSync();
    expect(t.store.prices.filter((p) => p.id === 'THYAO').length).toBe(1);
  });

  it('16) hibrit: WS usdttry tick effectiveUsdTry\'ı günceller (Yahoo\'yu ezer)', async () => {
    const t = setup({ throttleMs: 0 });
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onFxRate?.('USDTTRY', 50);
    flushSync();
    expect(t.store.usdTry).toBe(50); // Yahoo 40 yerine WS 50
  });

  it('17) hibrit: WS stale olunca Yahoo usdTry\'a düşer', async () => {
    const t = setup({ throttleMs: 0 });
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onFxRate?.('USDTTRY', 50);
    flushSync();
    expect(t.store.usdTry).toBe(50);
    t.feed.onStatus?.('stale');
    flushSync();
    expect(t.store.usdTry).toBe(40); // Yahoo fallback
  });

  it('18) hibrit: liveUsdTry yokken Yahoo kullanılır (regresyon yok)', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    flushSync();
    expect(t.store.usdTry).toBe(40);
  });

  it("19) persistence: buy/sell/setPeriod/addBist sonrası onPersist güncel envelope ile çağrılır", async () => {
    const onPersist = vi.fn();
    const t = setup({ onPersist });
    await t.store.start();
    flushSync();

    t.store.setPeriod(60);
    expect(onPersist).toHaveBeenLastCalledWith(
      expect.objectContaining({ v: 1, periodDays: 60 }),
    );

    t.store.buy('THYAO', 100);
    flushSync();
    expect(onPersist).toHaveBeenLastCalledWith(
      expect.objectContaining({
        v: 1,
        game: expect.objectContaining({
          holdings: expect.arrayContaining([expect.objectContaining({ assetId: 'THYAO', units: 100 })]),
        }),
      }),
    );

    t.store.addBist('garan');
    expect(onPersist).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeBist: expect.arrayContaining(['GARAN']) }),
    );
  });

  it('20) restore: initial.game/periodDays/activeBist kurulumda kullanılır, holding BIST sembolü activeBist\'te', async () => {
    const initialGame = {
      playerId: 'p1',
      scenarioId: 'canli' as const,
      seed: 1,
      clock: { day: 5, totalDays: 90, speed: 'realtime' as const, paused: false },
      usdBalance: { amount: 999_250, currency: 'USD' as const },
      holdings: [{ assetId: 'GARAN', units: 100, avgCost: { amount: 3, currency: 'USD' as const } }],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const t = setup({
      initial: { v: 1, game: initialGame, periodDays: 60, activeBist: ['GARAN'] },
    });
    expect(t.store.game.clock.day).toBe(5);
    expect(t.store.selectedPeriodDays).toBe(60);
    expect(t.store.prices.some((p) => p.id === 'GARAN')).toBe(true);
  });

  it("21) günlük snapshot: start() sonunda netWorth biliniyorsa history'ye upsert + onPersistHistory çağrılır", async () => {
    const onPersistHistory = vi.fn();
    const t = setup({ onPersistHistory });

    await t.store.start();
    flushSync();

    expect(t.store.history).toHaveLength(1);
    const snap = t.store.history[0];
    expect(snap.netWorthUsd.amount).toBeCloseTo(1_000_000, 2);
    expect(snap.allocation.usd).toBeCloseTo(100, 2);
    expect(onPersistHistory).toHaveBeenCalledWith(t.store.history);
  });

  it("22) günlük snapshot: aynı (FIXED_NOW) günde tekrar poll → replace, append yok", async () => {
    vi.useFakeTimers();
    const t = setup({ pollMs: 5000 });
    await t.store.start();
    flushSync();
    expect(t.store.history).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    expect(t.store.history).toHaveLength(1);
  });

  it('23) günlük snapshot: fiyat eksikse (netWorth null) ATLA — history büyümez', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.store.start();
    t.store.buy('THYAO', 100);
    flushSync();
    expect(t.store.history).toHaveLength(1);

    t.setYahoo({ value: { usdTry: 40, prices: { ASELS: 200, XAUGRAM: 5000, EUR: 45 } }, asOf: 222, stale: false });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    expect(t.store.netWorthUsd).toBeNull();
    expect(t.store.history).toHaveLength(1); // büyümedi
  });
});
