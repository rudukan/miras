import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { createLiveGameStore } from './liveGameStore.svelte';
import type { Cached, FxValue, CryptoValue } from '../api/types';
import type { BinanceFeedOptions, BinanceFeed } from '../api/binance';
import type { SaveEnvelopeV1 } from './savegame';
import { usd } from '../domain/money';
import { sessionOpenMs } from '../domain/calendar/calendar';

// 2026-06-01 12:00 Europe/Istanbul = Pazartesi, BIST açık saat
const FIXED_NOW = new Date('2026-06-01T12:00:00+03:00').getTime();

function resp(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function setup(overrides: Record<string, unknown> = {}) {
  let yahoo: Cached<FxValue> = {
    value: {
      usdTry: 40,
      prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 },
      // Task 3 (kapalı piyasada işlem): settle'ın taze-fiyat kanıtı — bugünün (FIXED_NOW) seans
      // açılışından beri damgalanmış sayılır, bu yüzden varsayılan fixture'daki BIST alım/satımları
      // hâlâ ANLIK gerçekleşir (priceAt eklenmeden önceki davranışla aynı).
      priceAt: { THYAO: FIXED_NOW, ASELS: FIXED_NOW },
    },
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

  it('6b) cold-start: WS ilk poll bitmeden açılırsa tick almamış coin snapshot ile tohumlanır', async () => {
    const t = setup();
    const startP = t.store.start(); // feed senkron kurulur; pollFx içeride fetch bekliyor
    t.feed.onStatus?.('live'); // WS, ilk poll yanıtı işlenmeden ÖNCE canlı (yarış)
    t.feed.onPrice('BTC', 64000); // BTC tick aldı; ETH hiç tick almadı
    await startP;
    flushSync();

    const eth = t.store.prices.find((p) => p.id === 'ETH');
    const btc = t.store.prices.find((p) => p.id === 'BTC');
    expect(eth?.priceTry).toBe(3000 * 40); // snapshot tohumu — yoksa ilk tick'e dek '—' kalırdı
    expect(btc?.priceTry).toBe(64_000 * 40); // WS otoritesi snapshot ile EZİLMEZ
  });

  it('7) guard: fiyat yok / yetersiz USD / holding yok → lastError, game değişmez', async () => {
    const t = setup();
    await t.store.start();
    // Task 3: kripto tazeliği artık feedStatus'a bağlı (tradeMode) — DOGE'un GERÇEKTEN fiyatsız
    // olduğunu (kuyruğa değil hataya düştüğünü) test etmek için WS'i canlı say.
    t.feed.onStatus?.('live');
    flushSync();
    const before = t.store.game;

    t.store.buy('DOGE', 1); // crypto snapshot mock'unda yok → canlı fiyat yok
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

  it('8b) reaktif saat: start() sonrası 1sn\'de bir now() ile nowMsTick tazelenir; stop() ile durur (audit P1)', async () => {
    vi.useFakeTimers();
    const nowSpy = vi.fn(() => FIXED_NOW);
    const t = setup({ now: nowSpy });
    await t.store.start();
    const callsAfterStart = nowSpy.mock.calls.length;

    await vi.advanceTimersByTimeAsync(3000); // 3 tick (1sn aralık) — pollMs 5000'e ulaşmaz
    expect(nowSpy.mock.calls.length).toBeGreaterThanOrEqual(callsAfterStart + 3);

    t.store.stop();
    const callsAfterStop = nowSpy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(nowSpy.mock.calls.length).toBe(callsAfterStop); // tick de poll gibi durdu
  });

  it('8c) poll self-scheduling: yavaş yanıt üst üste binmez, çözülünce pollMs sonra bir sonraki çağrı gelir (audit P1)', async () => {
    vi.useFakeTimers();
    let yahooCalls = 0;
    // TS narrows a bare `let` only reassigned inside a nested closure to `never` at the outer
    // call site — bir tutucu nesne (property erişimi) bu CFA tuhaflığını atlar.
    const slowYahoo: { resolve: (() => void) | null } = { resolve: null };
    const fetchFn = vi.fn((url: string) => {
      if (url.startsWith('/api/crypto')) {
        return Promise.resolve(resp({ value: { prices: { BTC: 60000, ETH: 3000 } }, asOf: 1, stale: false }));
      }
      yahooCalls++;
      if (yahooCalls === 1) {
        // start()'taki ilk pollFx — hemen çözülür.
        return Promise.resolve(
          resp({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 1, stale: false }),
        );
      }
      // İkinci (interval-tetiklemeli) çağrı — bilerek asılı bırakılır.
      return new Promise<Response>((resolve) => {
        slowYahoo.resolve = () =>
          resolve(resp({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 2, stale: false }));
      });
    }) as unknown as typeof fetch;
    const makeFeed = (): BinanceFeed => ({ stop: vi.fn() });

    const store = createLiveGameStore({ fetchFn, makeFeed, now: () => FIXED_NOW, throttleMs: 0, pollMs: 5000 });
    await store.start();
    expect(yahooCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(5000); // pollMs geçti → 2. çağrı (asılı) başlar
    expect(yahooCalls).toBe(2);

    await vi.advanceTimersByTimeAsync(10000); // 2×pollMs daha — 2. çağrı hâlâ çözülmedi, bindirme YOK
    expect(yahooCalls).toBe(2);

    slowYahoo.resolve?.();
    await vi.advanceTimersByTimeAsync(0); // asılı promise çözülsün, finally scheduleNextPoll çalışsın
    expect(yahooCalls).toBe(2); // henüz pollMs geçmedi — 3. çağrı hemen gelmez

    await vi.advanceTimersByTimeAsync(5000); // reschedule'dan sonra pollMs → 3. çağrı
    expect(yahooCalls).toBe(3);

    store.stop();
  });

  it('9) netWorth kısmi toplam: holding fiyatı kaybolursa nakit + bilinen pozisyonlar toplanır (null OLMAZ), profit null', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.store.start();
    t.store.buy('THYAO', 100); // $750
    flushSync();
    expect(t.store.netWorthUsd?.amount).toBeGreaterThan(0);

    t.setYahoo({ value: { usdTry: 40, prices: { ASELS: 200, XAUGRAM: 5000, EUR: 45 } }, asOf: 222, stale: false });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();
    // THYAO fiyatı kayboldu ama holding tek başınaydı — kalan tek bilinen bileşen nakit.
    // netWorth null'a ÇÖKMEZ, kısmi toplama (yalnız nakit) düşer.
    expect(t.store.netWorthUsd).not.toBeNull();
    expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000 - 750, 2);
    // Eksik veri yüzünden kâr göstergesi yanıltıcı bir % göstermesin diye null kalır.
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

    t.setYahoo({
      value: {
        usdTry: 40,
        prices: { THYAO: 300, ASELS: 200, GARAN: 120, XAUGRAM: 5000, EUR: 45 },
        priceAt: { THYAO: FIXED_NOW, ASELS: FIXED_NOW, GARAN: FIXED_NOW },
      },
      asOf: 222,
      stale: false,
    });
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

  it('12b) on-demand: addUs + fiyat gelince oto-takas buy çalışır (addBist ile mirror)', async () => {
    // FIXED_NOW BIST için seans içi ama NYSE için değil (05:00 EDT) — AAPL alımı guard'a
    // takılmasın diye burada NYSE seans saatine denk gelen ayrı bir an enjekte edilir.
    const NYSE_OPEN_NOW = new Date('2026-06-01T16:00:00Z').getTime(); // 12:00 EDT, Pazartesi
    const t = setup({ now: () => NYSE_OPEN_NOW });
    await t.store.start();
    flushSync();
    expect(t.store.prices.some((p) => p.id === 'AAPL')).toBe(false);

    t.setYahoo({
      value: {
        usdTry: 40,
        prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45, AAPL: 7600 },
        priceAt: { THYAO: NYSE_OPEN_NOW, ASELS: NYSE_OPEN_NOW, AAPL: NYSE_OPEN_NOW },
      },
      asOf: 222,
      stale: false,
    });
    t.store.addUs('aapl');
    await new Promise((r) => setTimeout(r, 0));
    flushSync();

    expect(t.fetchFn).toHaveBeenCalledWith('/api/yahoo?bist=THYAO,ASELS&us=AAPL');
    const aapl = t.store.prices.find((p) => p.id === 'AAPL');
    expect(aapl?.priceTry).toBe(7600);
    expect(aapl?.category).toBe('us');

    t.store.buy('AAPL', 10); // 7600 TRY / 40 = $190 → 10 × $190 = $1900
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.holdings.some((h) => h.assetId === 'AAPL' && h.units === 10)).toBe(true);

    const pos = t.store.positions.find((p) => p.assetId === 'AAPL');
    expect(pos?.label).toBe('Apple');
    expect(pos?.avgCostUsd).toBeCloseTo(190, 2);
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

  it('15b) addUs tekrarı yinelenmez (idempotent, addBist ile mirror)', async () => {
    const t = setup();
    await t.store.start();
    t.store.addUs('AAPL');
    flushSync();
    expect(t.store.prices.filter((p) => p.id === 'AAPL').length).toBe(1);
  });

  it('16) hibrit: WS usdttry tick effectiveUsdTry\'ı günceller (Yahoo\'yu ezer)', async () => {
    const t = setup({ throttleMs: 0 });
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onFxRate?.('USDTTRY', 50);
    flushSync();
    expect(t.store.liveUsdTry).toBe(50); // Yahoo 40 yerine WS 50 (canlı/operatif tohum; usdTry mühürlü kalır)
  });

  it('17) hibrit: WS stale olunca Yahoo usdTry\'a düşer', async () => {
    const t = setup({ throttleMs: 0 });
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onFxRate?.('USDTTRY', 50);
    flushSync();
    expect(t.store.liveUsdTry).toBe(50);
    t.feed.onStatus?.('stale');
    flushSync();
    expect(t.store.liveUsdTry).toBe(40); // Yahoo fallback
  });

  it('18) hibrit: liveUsdTry yokken Yahoo kullanılır (regresyon yok)', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    flushSync();
    expect(t.store.usdTry).toBe(40);
  });

  it("19) persistence: buy/addBist sonrası onPersist güncel envelope ile çağrılır", async () => {
    const onPersist = vi.fn();
    const t = setup({ onPersist });
    await t.store.start();
    flushSync();

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

    t.store.addUs('aapl');
    expect(onPersist).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeUs: expect.arrayContaining(['AAPL']) }),
    );
  });

  it('20) restore: initial.game/activeBist kurulumda kullanılır, holding BIST sembolü activeBist\'te', async () => {
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
      initial: { v: 1, game: initialGame, activeBist: ['GARAN'] },
    });
    expect(t.store.game.clock.day).toBe(5);
    expect(t.store.prices.some((p) => p.id === 'GARAN')).toBe(true);
  });

  it('20b) restore: initial.activeUs kurulumda kullanılır, holding US sembolü activeUs\'te (addBist mirror)', async () => {
    const initialGame = {
      playerId: 'p1',
      scenarioId: 'canli' as const,
      seed: 1,
      clock: { day: 5, totalDays: 90, speed: 'realtime' as const, paused: false },
      usdBalance: { amount: 998_100, currency: 'USD' as const },
      holdings: [{ assetId: 'AAPL', units: 10, avgCost: { amount: 190, currency: 'USD' as const } }],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const t = setup({
      initial: { v: 1, game: initialGame, activeUs: ['AAPL'] },
    });
    expect(t.store.prices.some((p) => p.id === 'AAPL' && p.category === 'us')).toBe(true);
  });

  it('20c) restore regresyonu: activeUs\'te olan US holding activeBist\'e sızıp satır ikilemez', async () => {
    // AAPL CATALOG'da yok → isBistLikeId('AAPL') düzeltme olmadan true döner ve
    // fromHoldings'e (dolayısıyla activeBist'e) kazayla eklerdi -> AAPL satırı iki kez basılırdı.
    const initialGame = {
      playerId: 'p1',
      scenarioId: 'canli' as const,
      seed: 1,
      clock: { day: 5, totalDays: 90, speed: 'realtime' as const, paused: false },
      usdBalance: { amount: 998_100, currency: 'USD' as const },
      holdings: [{ assetId: 'AAPL', units: 10, avgCost: { amount: 190, currency: 'USD' as const } }],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const t = setup({
      initial: { v: 1, game: initialGame, activeUs: ['AAPL'] },
    });
    const rows = t.store.prices.filter((p) => p.id === 'AAPL');
    expect(rows.length).toBe(1);
    expect(rows[0].category).toBe('us');
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

  it('23) günlük snapshot: fiyat eksikse (netWorthDataComplete=false) ATLA — history büyümez', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.store.start();
    t.store.buy('THYAO', 100);
    flushSync();
    expect(t.store.history).toHaveLength(1);

    t.setYahoo({ value: { usdTry: 40, prices: { ASELS: 200, XAUGRAM: 5000, EUR: 45 } }, asOf: 222, stale: false });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    // netWorth artık null OLMAZ (kısmi toplam) — ama eksik veri yüzünden recordSnapshot yine
    // yazmaz (netWorthDataComplete=false guard'ı asıl kapı).
    expect(t.store.netWorthUsd).not.toBeNull();
    expect(t.store.history).toHaveLength(1); // büyümedi
  });

  it('24) günlük snapshot: mevduat açıkken fiyat eksikse history kirletilmez (degrade deger yazılmaz)', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.store.start();
    t.store.buy('THYAO', 100);
    t.store.openDeposit(100_000);
    flushSync();
    expect(t.store.history).toHaveLength(1);
    // Bu an netWorth tam (nakit + THYAO + mevduat) ~$1M olmalı.
    expect(t.store.history[0].netWorthUsd.amount).toBeCloseTo(1_000_000, 0);

    // THYAO fiyatı geçici olarak kayboluyor (oracle throw) — ama mevduat açık olduğu için
    // bug'lı kodda netWorth null DEĞİL, yalnız mevduat değerine düşüyor ve history'yi eziyor.
    t.setYahoo({ value: { usdTry: 40, prices: { ASELS: 200, XAUGRAM: 5000, EUR: 45 } }, asOf: 222, stale: false });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    expect(t.store.history).toHaveLength(1); // büyümedi
    // Eksik veri anında ezilmemiş olmalı — hâlâ tam (önceki doğru) değer.
    expect(t.store.history[0].netWorthUsd.amount).toBeCloseTo(1_000_000, 0);
  });

  it('mevduat: açınca net servet korunur (para taşındı, kaybolmadı)', async () => {
    const t = setup(); // usdTry 40
    await t.store.start();
    flushSync();
    const before = t.store.netWorthUsd?.amount ?? 0;
    t.store.openDeposit(100_000);
    flushSync();
    expect(t.store.game.usdBalance.amount).toBe(900_000);
    expect(t.store.deposit?.principalTry.amount).toBe(4_000_000); // 100k × 40
    // açılış anında accrued 0 → net servet ~aynı (yuvarlama toleransı)
    expect(t.store.netWorthUsd?.amount ?? 0).toBeCloseTo(before, 0);
  });

  it('mevduat: erken bozma nakdi geri getirir, deposit null olur', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    t.store.openDeposit(100_000);
    flushSync();
    t.store.breakDeposit();
    flushSync();
    expect(t.store.game.usdBalance.amount).toBe(1_000_000);
    expect(t.store.deposit).toBeNull();
  });

  describe('günlük mühürlü kur', () => {
    it('canlı USD/TRY tiki net serveti oynatmaz (mevduat sealed kurla değerlenir)', async () => {
      const t = setup(); // yahoo usdTry 40
      await t.store.start(); // ilk poll → mühür { 2026-06-01, 40 }
      flushSync();
      expect(t.store.usdTry).toBe(40); // operatif = sealed
      expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000, 0);

      t.store.openDeposit(500_000); // $500k → sealed 40 ile ₺20M mevduat
      flushSync();
      expect(t.store.lastError).toBeNull();
      const before = t.store.netWorthUsd!.amount;
      expect(before).toBeCloseTo(1_000_000, 0);

      // Canlı kur fırlar (WS): operatif kur mühürlü kaldığı için net servet OYNAMAZ.
      t.feed.onStatus?.('live');
      t.feed.onFxRate?.('USDTTRY', 50);
      flushSync();
      expect(t.store.liveUsdTry).toBe(50); // canlı gösterim güncel
      expect(t.store.usdTry).toBe(40); // operatif hâlâ mühürlü
      expect(t.store.netWorthUsd?.amount).toBeCloseTo(before, 0); // jitter yok
    });

    it('gün içi küçük kur sapması (eşik altı) mührü değiştirmez', async () => {
      vi.useFakeTimers();
      const t = setup(); // pollMs 5000
      await t.store.start();
      expect(t.store.usdTry).toBe(40);

      // Aynı gün, %0.5 sapma (eşik %0.75'in altı) — gürültü, mühür sabit kalır.
      t.setYahoo({
        value: { usdTry: 40.2, prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 } },
        asOf: 222,
        stale: false,
      });
      await vi.advanceTimersByTimeAsync(5000);
      flushSync();

      expect(t.store.usdTry).toBe(40); // mühür değişmedi
      expect(t.store.liveUsdTry).toBe(40.2); // canlı (Yahoo) güncel (feedStatus stale → effective=fxCache)
    });

    it('gün içi büyük kur sapması (eşik üstü) aynı gün yeniden mühürler', async () => {
      vi.useFakeTimers();
      const t = setup(); // pollMs 5000
      await t.store.start();
      expect(t.store.usdTry).toBe(40);

      // Aynı gün, %37.5 sapma (eşik %0.75'in çok üstü) — gerçek hareket, aynı gün reseal.
      t.setYahoo({
        value: { usdTry: 55, prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 } },
        asOf: 222,
        stale: false,
      });
      await vi.advanceTimersByTimeAsync(5000);
      flushSync();

      expect(t.store.usdTry).toBe(55); // eşik aşıldı → aynı gün (dateKey değişmeden) reseal
      expect(t.store.liveUsdTry).toBe(55);
    });

    it('gün-anahtarı değişince reseal eder', async () => {
      vi.useFakeTimers();
      let clock = new Date('2026-06-01T12:00:00+03:00').getTime();
      const t = setup({ now: () => clock });
      await t.store.start();
      expect(t.store.usdTry).toBe(40);

      t.setYahoo({
        value: { usdTry: 45, prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 } },
        asOf: 222,
        stale: false,
      });
      clock = new Date('2026-06-02T12:00:00+03:00').getTime(); // ertesi gün
      await vi.advanceTimersByTimeAsync(5000);
      flushSync();

      expect(t.store.usdTry).toBe(45); // yeni günün kuru mühürlendi
    });

    it('mühür persist edilir ve initial.sealedFx restore edilir', async () => {
      const saved: SaveEnvelopeV1[] = [];
      const t = setup({ onPersist: (e: SaveEnvelopeV1) => saved.push(e) });
      await t.store.start();
      flushSync();
      const last = saved[saved.length - 1];
      expect(last.sealedFx).toEqual({ dateKey: '2026-06-01', rate: 40 });

      // Restore: kayıttaki mühürle yeni store → start() öncesi bile operatif kur restore edilendir.
      const t2 = setup({
        initial: { v: 1, game: last.game, activeBist: last.activeBist, sealedFx: { dateKey: '2026-06-01', rate: 38 } },
      });
      expect(t2.store.usdTry).toBe(38);
    });
  });
});

describe('tradeMode: kapalı/stale piyasada kuyruğa alma (Task 3 — eski adı "trade guard" audit P1)', () => {
  it('kapalı piyasada (Cumartesi) BIST alımı kuyruğa girer — holdings değişmez, onFirstTrade çağrılmaz', async () => {
    const closedAt = new Date('2026-07-18T09:00:00Z').getTime(); // Cumartesi 12:00 İstanbul
    const onFirstTrade = vi.fn();
    const t = setup({ now: () => closedAt, onFirstTrade });
    await t.store.start();
    flushSync();
    const before = t.store.game;

    t.store.buy('THYAO', 5);
    flushSync();

    expect(t.store.lastError).toBeNull();
    expect(t.store.pendingOrders).toHaveLength(1);
    expect(t.store.pendingOrders[0]).toMatchObject({
      assetId: 'THYAO',
      side: 'buy',
      kind: 'units',
      units: 5,
    });
    expect(t.store.game).toBe(before);
    expect(onFirstTrade).not.toHaveBeenCalled();
  });

  it('feed canlı değilken (feedStatus≠live) kripto buy bile kuyruğa girer (tek kural)', async () => {
    const t = setup();
    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 0, stale: true });
    await t.store.start(); // feedStatus hiç 'live' olmadı (varsayılan 'stale')
    flushSync();

    t.store.buy('BTC', 1);
    flushSync();

    expect(t.store.lastError).toBeNull();
    expect(t.store.pendingOrders).toHaveLength(1);
    expect(t.store.game.holdings.some((h) => h.assetId === 'BTC')).toBe(false);
  });

  it('kapalı piyasada bile kripto alımı serbest (WS canlıyken, 7/24 muaf)', async () => {
    const closedAt = new Date('2026-07-18T09:00:00Z').getTime(); // aynı Cumartesi
    const t = setup({ now: () => closedAt });
    await t.store.start();
    t.feed.onStatus?.('live'); // kripto bacağı feedStatus'a göre serbest kalsın
    flushSync();

    t.store.buy('BTC', 1);
    flushSync();

    expect(t.store.lastError).toBeNull();
    expect(t.store.game.holdings.some((h) => h.assetId === 'BTC')).toBe(true);
  });

  it('açık piyasada (hafta içi seans saati) BIST alımı serbest', async () => {
    const t = setup(); // FIXED_NOW = Pazartesi 12:00 İstanbul, BIST açık
    await t.store.start();
    flushSync();

    t.store.buy('THYAO', 1);
    flushSync();

    expect(t.store.lastError).toBeNull();
    expect(t.store.game.holdings.some((h) => h.assetId === 'THYAO')).toBe(true);
  });

  it('fiyat verisi eskiyken (fxStale) BIST alımı kuyruğa girer, kripto (canlı feed) yine serbest', async () => {
    const t = setup();
    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 0, stale: true });
    await t.store.start(); // ilk pollFx stale zarfı okur → fxStale=true
    t.feed.onStatus?.('live'); // kripto bacağı fxStale'den muaf, kendi kuralı (feedStatus) canlı
    flushSync();

    t.store.buy('THYAO', 1);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.pendingOrders).toHaveLength(1);

    t.store.buy('BTC', 1);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.holdings.some((h) => h.assetId === 'BTC')).toBe(true);
  });

  it('hafta içi seans dışı satış da kuyruğa girer (SAT aynı kurala tabi)', async () => {
    vi.useFakeTimers();
    let clock = FIXED_NOW; // Pazartesi 12:00, açık — pozisyon açmak için
    const t = setup({ now: () => clock });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 1);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.holdings.some((h) => h.assetId === 'THYAO')).toBe(true);

    clock = new Date('2026-07-15T22:00:00Z').getTime(); // ≈ Perşembe 01:00 İstanbul, seans dışı
    await vi.advanceTimersByTimeAsync(1000); // nowMsTick reaktif tazelensin
    flushSync();

    t.store.sell('THYAO', 1);
    flushSync();

    expect(t.store.lastError).toBeNull();
    expect(t.store.pendingOrders.some((o) => o.assetId === 'THYAO' && o.side === 'sell')).toBe(true);
  });
});

describe('bekleyen emir kuyruğu: settle, buyAmountUsd, cancel, notice, restore (Task 3)', () => {
  it('taze tick gelince kuyruktaki emir dolar: holding oluşur, order silinir, onFirstTrade TAM 1 kez', async () => {
    vi.useFakeTimers();
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade, pollMs: 5000 });
    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 0, stale: true });
    await t.store.start(); // ilk poll: fxStale=true → THYAO taze değil
    flushSync();

    t.store.buy('THYAO', 5);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.pendingOrders).toHaveLength(1);
    expect(t.store.game.holdings).toHaveLength(0);
    expect(onFirstTrade).not.toHaveBeenCalled();

    // Taze tick: priceAt bugünün (FIXED_NOW) seans açılışından sonra damgalanmış.
    t.setYahoo({
      value: { usdTry: 40, prices: { THYAO: 300 }, priceAt: { THYAO: FIXED_NOW } },
      asOf: 222,
      stale: false,
    });
    await vi.advanceTimersByTimeAsync(5000); // sıradaki poll → pollFx → settlePendingOrders
    flushSync();

    expect(t.store.pendingOrders).toHaveLength(0);
    expect(t.store.game.holdings.some((h) => h.assetId === 'THYAO' && h.units === 5)).toBe(true);
    expect(onFirstTrade).toHaveBeenCalledTimes(1);
    expect(t.store.orderNotice).not.toBeNull();
  });

  it('15dk tuzağı: piyasa açık ama priceAt dünkü/açılış-öncesi damgaysa settle DOLDURMAZ', async () => {
    vi.useFakeTimers();
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade, pollMs: 5000 });
    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 0, stale: true });
    await t.store.start();
    flushSync();

    t.store.buy('THYAO', 5);
    flushSync();
    expect(t.store.pendingOrders).toHaveLength(1);

    const staleStamp = sessionOpenMs('bist', new Date(FIXED_NOW)) - 60_000; // açılıştan 1dk ÖNCE
    t.setYahoo({
      value: { usdTry: 40, prices: { THYAO: 300 }, priceAt: { THYAO: staleStamp } },
      asOf: 222,
      stale: false, // stale bayrağı false ama priceAt bugünkü açılıştan ÖNCE — settle yine de atlamalı
    });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    expect(t.store.pendingOrders).toHaveLength(1); // hâlâ kuyrukta — dolmadı
    expect(t.store.game.holdings).toHaveLength(0);
    expect(onFirstTrade).not.toHaveBeenCalled();
  });

  it('buyAmountUsd: kuyrukta amountUsd-kind yazar; dolumda adet açılış fiyatından hesaplanır', async () => {
    vi.useFakeTimers();
    const t = setup({ pollMs: 5000 });
    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 0, stale: true });
    await t.store.start();
    flushSync();

    t.store.buyAmountUsd('THYAO', usd(500));
    flushSync();
    expect(t.store.pendingOrders).toHaveLength(1);
    expect(t.store.pendingOrders[0]).toMatchObject({ assetId: 'THYAO', side: 'buy', kind: 'amountUsd' });

    t.setYahoo({
      // THYAO 300 TRY / 40 kur = $7.5 açılış fiyatı → 500 / 7.5 = 66.6666 adet (floor/1e4)
      value: { usdTry: 40, prices: { THYAO: 300 }, priceAt: { THYAO: FIXED_NOW } },
      asOf: 222,
      stale: false,
    });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    expect(t.store.pendingOrders).toHaveLength(0);
    const pos = t.store.game.holdings.find((h) => h.assetId === 'THYAO');
    expect(pos?.units).toBeCloseTo(66.6666, 4);
  });

  it('dolum anında bakiye yetersiz → order silinir, orderNotice iptal mesajı içerir, holdings değişmez', async () => {
    vi.useFakeTimers();
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade, pollMs: 5000 });
    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 0, stale: true });
    await t.store.start();
    flushSync();

    t.store.buy('THYAO', 100_000_000); // 1e8 × $7.5 = $750M >> $1M bakiye
    flushSync();
    expect(t.store.pendingOrders).toHaveLength(1);

    t.setYahoo({
      value: { usdTry: 40, prices: { THYAO: 300 }, priceAt: { THYAO: FIXED_NOW } },
      asOf: 222,
      stale: false,
    });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    expect(t.store.pendingOrders).toHaveLength(0); // iptal edilip kuyruktan çıktı
    expect(t.store.game.holdings).toHaveLength(0);
    expect(t.store.orderNotice).toMatch(/iptal/i);
    expect(onFirstTrade).not.toHaveBeenCalled();
  });

  it('cancelOrder: kuyruktan siler ve persist eder', async () => {
    const onPersist = vi.fn();
    const closedAt = new Date('2026-07-18T09:00:00Z').getTime(); // Cumartesi, BIST kapalı
    const t = setup({ onPersist, now: () => closedAt });
    await t.store.start();
    flushSync();

    t.store.buy('THYAO', 5);
    flushSync();
    expect(t.store.pendingOrders).toHaveLength(1);
    const orderId = t.store.pendingOrders[0].id;

    t.store.cancelOrder(orderId);
    flushSync();

    expect(t.store.pendingOrders).toHaveLength(0);
    expect(onPersist).toHaveBeenLastCalledWith(expect.objectContaining({ pendingOrders: [] }));
  });

  it('cancelOrder: bilinmeyen id no-op (kuyruk/persist tetiklenmez)', async () => {
    const onPersist = vi.fn();
    const closedAt = new Date('2026-07-18T09:00:00Z').getTime();
    const t = setup({ onPersist, now: () => closedAt });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 5);
    flushSync();
    const callsBefore = onPersist.mock.calls.length;

    t.store.cancelOrder('bilinmeyen-id');
    flushSync();

    expect(t.store.pendingOrders).toHaveLength(1);
    expect(onPersist.mock.calls.length).toBe(callsBefore);
  });

  it('clearOrderNotice: son settle bildirimini null’lar', async () => {
    vi.useFakeTimers();
    const t = setup({ pollMs: 5000 });
    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300 } }, asOf: 0, stale: true });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 100_000_000); // yetersiz bakiye → settle'da iptal olacak
    flushSync();

    t.setYahoo({
      value: { usdTry: 40, prices: { THYAO: 300 }, priceAt: { THYAO: FIXED_NOW } },
      asOf: 222,
      stale: false,
    });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();
    expect(t.store.orderNotice).not.toBeNull();

    t.store.clearOrderNotice();
    flushSync();

    expect(t.store.orderNotice).toBeNull();
  });

  it('restore: bekleyen BIST emrinin sembolü activeBist’e, US emrininki activeUs’a girer', async () => {
    const initialGame = {
      playerId: 'p1',
      scenarioId: 'canli' as const,
      seed: 1,
      clock: { day: 5, totalDays: 90, speed: 'realtime' as const, paused: false },
      usdBalance: { amount: 1_000_000, currency: 'USD' as const },
      holdings: [],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const t = setup({
      initial: {
        v: 1,
        game: initialGame,
        activeBist: ['GARAN'],
        activeUs: ['AAPL'],
        pendingOrders: [
          { id: 'a', assetId: 'GARAN', side: 'buy', kind: 'units', units: 10, placedAt: 1 },
          { id: 'b', assetId: 'AAPL', side: 'buy', kind: 'units', units: 1, placedAt: 1 },
        ],
      },
    });

    expect(t.store.prices.some((p) => p.id === 'GARAN' && p.category === 'bist')).toBe(true);
    expect(t.store.prices.some((p) => p.id === 'AAPL' && p.category === 'us')).toBe(true);
    expect(t.store.pendingOrders).toHaveLength(2);
  });
});

describe('emlak (kira kasası) store entegrasyonu', () => {
  const HOUR_MS = 3_600_000;
  const ARSA = 'arsa-ic-anadolu'; // ₺1.2M, kur 40 → $30,000

  it('buyProperty: nakit düşer, net servet korunur (bedel değer olarak geri gelir)', async () => {
    const t = setup();
    await t.store.start(); // poll: usdTry 40 taze → mühür 40
    flushSync();
    t.store.buyProperty(ARSA);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.usdBalance.amount).toBeCloseTo(970_000, 2);
    expect(t.store.game.properties).toHaveLength(1);
    expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000, 0);
  });

  it('collectRent: 24 saat sonra kasadaki kira nakde geçer, net servet kasayı zaten sayıyordu', async () => {
    let clock = FIXED_NOW;
    const t = setup({ now: () => clock });
    await t.store.start();
    flushSync();
    t.store.buyProperty(ARSA);
    flushSync();

    clock += 24 * HOUR_MS;
    t.store.collectRent(ARSA);
    flushSync();

    const rentTl = 1_200_000 * 0.6 * (24 / (24 * 365)); // ≈ ₺1972.60
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.usdBalance.amount).toBeCloseTo(970_000 + rentTl / 40, 1);
    // tahsil = kasadan nakde taşıma; net servet değişmez (kasa zaten sayılıyordu)
    expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000 + rentTl / 40, 0);
  });

  it('sellProperty: bedel + kasa nakde döner, properties boşalır ve persist edilir', async () => {
    const saved: SaveEnvelopeV1[] = [];
    let clock = FIXED_NOW;
    const t = setup({ now: () => clock, onPersist: (e: SaveEnvelopeV1) => saved.push(e) });
    await t.store.start();
    flushSync();
    t.store.buyProperty(ARSA);
    flushSync();
    expect(saved[saved.length - 1].game.properties).toHaveLength(1);

    clock += 24 * HOUR_MS;
    t.store.sellProperty(ARSA);
    flushSync();

    const rentTl = 1_200_000 * 0.6 * (24 / (24 * 365));
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.properties).toHaveLength(0);
    expect(t.store.game.usdBalance.amount).toBeCloseTo(1_000_000 + rentTl / 40, 1);
    expect(saved[saved.length - 1].game.properties).toHaveLength(0);
  });
});

describe('onFirstTrade (Faz 1 funnel aktivasyonu)', () => {
  it('ilk başarılı buy sonrası bir kez çağrılır', async () => {
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 100);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(onFirstTrade).toHaveBeenCalledTimes(1);
  });

  it('yetersiz bakiyeli (başarısız) buy çağırmaz', async () => {
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 1_000_000); // 100M×$7.5 >> $1M bakiye
    flushSync();
    expect(t.store.lastError).not.toBeNull();
    expect(onFirstTrade).not.toHaveBeenCalled();
  });

  it('piyasa kapalıyken kuyruğa giren buy onFirstTrade çağırmaz (yalnız gerçek dolum sayılır)', async () => {
    // BIST hafta içi 10:00-18:00 (Istanbul) açık — 22:00 kapanış sonrası.
    const CLOSED_NOW = new Date('2026-06-01T22:00:00+03:00').getTime();
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade, now: () => CLOSED_NOW });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 1);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.pendingOrders).toHaveLength(1);
    expect(onFirstTrade).not.toHaveBeenCalled();
  });

  it('sell ve openDeposit de tetikler (idempotent sayaç pingFirstTrade tarafında, burada her çağrı sayılır)', async () => {
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.openDeposit(1000);
    flushSync();
    t.store.buy('THYAO', 1);
    flushSync();
    t.store.sell('THYAO', 1);
    flushSync();
    expect(onFirstTrade).toHaveBeenCalledTimes(3);
  });

  it('buyProperty/breakDeposit gibi diğer aksiyonlar çağırmaz', async () => {
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.openDeposit(1000);
    flushSync();
    onFirstTrade.mockClear();
    t.store.breakDeposit();
    flushSync();
    expect(onFirstTrade).not.toHaveBeenCalled();
  });

  it("onOk (telemetri) throw ederse mutasyonu/lastError'ı bozmaz", async () => {
    const onFirstTrade = vi.fn(() => {
      throw new Error('telemetry boom');
    });
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 100);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.positions.find((p) => p.assetId === 'THYAO')?.units).toBe(100);
  });
});
