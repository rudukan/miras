import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { createLiveGameStore } from './liveGameStore.svelte';
import { usd, tryM } from '../domain/money';
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
    throttleMs: 0, // testte anlık reassign (throttle timer'ı by-pass)
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

describe('createLiveGameStore', () => {
  it('1) kripto USD→TRY çevrimi: BTC 64000 × usdTry 40 = 2.560.000 TRY', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onPrice('BTC', 64000);
    flushSync();
    const btc = t.store.prices.find((p) => p.id === 'BTC');
    expect(btc?.priceTry).toBe(2_560_000);
  });

  it('2) skor doğruluğu: başlangıç ~1.000.000 USD; çevir+al sonrası korunur (makas yok)', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000, 2);

    t.feed.onStatus?.('live');
    t.feed.onPrice('BTC', 64000);
    t.store.usdToTry(usd(100_000)); // ×40 → +4.000.000 TRY
    t.store.buy('BTC', 1); // 2.560.000 TRY
    flushSync();

    expect(t.store.lastError).toBeNull();
    expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000, 0);
    expect(t.store.vsUsdHoldUsd?.amount).toBeCloseTo(0, 0);
  });

  it('3) canlı tik net serveti artırır (BTC yükselince)', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onPrice('BTC', 64000);
    t.store.usdToTry(usd(100_000));
    t.store.buy('BTC', 1);
    flushSync();
    const before = t.store.netWorthUsd!.amount;

    t.feed.onPrice('BTC', 70000); // +6000 USD/coin × 1 / 40 kur = +150.000... → +6000 USD net
    flushSync();
    const after = t.store.netWorthUsd!.amount;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeCloseTo(6000, 0);
  });

  it('4) stale/asOf zarfı yüzeyler', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    expect(t.store.asOf).toBe(111);
    // fx taze ama feed başlangıçta stale → dataStale true
    expect(t.store.dataStale).toBe(true);
    // feed live olunca + fx taze → stale değil
    t.feed.onStatus?.('live');
    flushSync();
    expect(t.store.dataStale).toBe(false);
  });

  it('5) WS-stale iken kripto /api/crypto poll fallback ile gelir', async () => {
    const t = setup();
    await t.store.start(); // feed başlangıçta stale → ilk poll crypto'yu da çeker
    flushSync();
    const btc = t.store.prices.find((p) => p.id === 'BTC');
    expect(btc?.priceTry).toBe(60000 * 40); // snapshot'tan (feed push yok)
    expect(t.fetchFn).toHaveBeenCalledWith('/api/crypto?coins=BTC,ETH');
  });

  it('6) guard: fiyat yok / yetersiz TRY / holding yok → lastError, game değişmez', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    const before = t.store.game;

    // katalogda olmayan varlık → canlı fiyat yok
    t.store.buy('DOGE', 1);
    expect(t.store.lastError).not.toBeNull();

    // yetersiz TRY (oyuncu ₺0, hiç çevirmedi)
    t.store.buy('THYAO', 1_000_000);
    expect(t.store.lastError).toMatch(/Insufficient TRY/);

    // holding yokken satış
    t.store.sell('ASELS', 5);
    expect(t.store.lastError).toMatch(/Insufficient units/);

    // hiçbir geçerli yazma olmadı → game referansı değişmedi
    expect(t.store.game).toBe(before);
  });

  it('7) stop() feed.stop() çağırır ve poll durur', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.store.start();
    const callsAfterStart = (t.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    t.store.stop();
    expect(t.feedStop).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20000); // 4 poll periyodu
    expect((t.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterStart);
  });

  it('8) netWorth throw-guard: holding fiyatı kaybolursa null (çökmez)', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.store.start();
    t.store.usdToTry(usd(10_000)); // 400.000 TRY
    t.store.buy('THYAO', 100); // 300 × 100 = 30.000 TRY
    flushSync();
    expect(t.store.netWorthUsd?.amount).toBeGreaterThan(0);

    // sonraki poll THYAO'yu düşürür (proxy kısmi hata) → fiyat undefined
    t.setYahoo({ value: { usdTry: 40, prices: { ASELS: 200, XAUGRAM: 5000, EUR: 45 } }, asOf: 222, stale: false });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();
    expect(t.store.netWorthUsd).toBeNull();
    expect(t.store.profitRate).toBeNull();
  });

  it('9) günlük % değişim verisi prices satırlarına akar (yahoo change + crypto 24s)', async () => {
    const t = setup();
    t.setYahoo({
      value: { usdTry: 40, prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 }, change: { THYAO: 2.5, XAUGRAM: -1.2 } },
      asOf: 111, stale: false,
    });
    t.setCrypto({
      value: { prices: { BTC: 60000, ETH: 3000 }, change: { BTC: 4.1 } },
      asOf: 111, stale: false,
    });
    await t.store.start(); // feed başlangıçta stale → ilk poll yahoo+crypto çeker
    flushSync();

    const thy = t.store.prices.find((p) => p.id === 'THYAO');
    const btc = t.store.prices.find((p) => p.id === 'BTC');
    const eur = t.store.prices.find((p) => p.id === 'EUR');
    expect(thy?.changePct).toBe(2.5);
    expect(btc?.changePct).toBe(4.1);
    expect(eur?.changePct).toBeUndefined(); // er-api değişim vermez
  });

  it('10) fix-A: stale poll son-gerçek fiyatı EZMEZ, yalnız fxStale true olur', async () => {
    vi.useFakeTimers();
    const t = setup({ pollMs: 5000 });
    await t.store.start();
    flushSync();
    const thyBefore = t.store.prices.find((p) => p.id === 'THYAO')?.priceTry;
    expect(thyBefore).toBe(300);

    // upstream rate-limit → route stale fallback döner
    t.setYahoo({ value: { usdTry: 99, prices: { THYAO: 1 } }, asOf: 0, stale: true });
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();

    // fiyat KORUNDU (fallback ezmedi), ama veri eski damgalı
    expect(t.store.prices.find((p) => p.id === 'THYAO')?.priceTry).toBe(300);
    expect(t.store.usdTry).toBe(40);
    expect(t.store.dataStale).toBe(true);
  });

  it('11) on-demand: addBist aktif sete ekler, ?bist= isteğine yansır, fiyat gelince buy çalışır', async () => {
    const t = setup();
    await t.store.start();
    flushSync();
    // başlangıç aktif set = THYAO,ASELS → GARAN listede yok
    expect(t.store.prices.some((p) => p.id === 'GARAN')).toBe(false);

    // GARAN fiyatını yahoo yanıtına dahil et, sonra ekle
    t.setYahoo({ value: { usdTry: 40, prices: { THYAO: 300, ASELS: 200, GARAN: 120, XAUGRAM: 5000, EUR: 45 } }, asOf: 222, stale: false });
    t.store.addBist('garan'); // küçük harf → normalize edilmeli; tek seferlik poll tetikler
    await new Promise((r) => setTimeout(r, 0)); // addBist'in tetiklediği pollFx zincirini boşalt
    flushSync();

    expect(t.fetchFn).toHaveBeenCalledWith('/api/yahoo?bist=THYAO,ASELS,GARAN');
    const garan = t.store.prices.find((p) => p.id === 'GARAN');
    expect(garan?.priceTry).toBe(120);
    expect(garan?.category).toBe('bist');

    // satın al: çevir + al, hata yok
    t.store.usdToTry(usd(10_000)); // 400.000 TRY
    t.store.buy('GARAN', 100);     // 120×100 = 12.000 TRY
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(t.store.game.holdings.some((h) => h.assetId === 'GARAN' && h.units === 100)).toBe(true);

    // cüzdan pozisyonu CATALOG'da olmayan sembolü TR adıyla etiketler (sembole düşmez)
    const pos = t.store.positions.find((p) => p.assetId === 'GARAN');
    expect(pos?.label).toBe('Garanti BBVA');
  });

  it('12) addBist tekrarı yinelenmez (idempotent)', async () => {
    const t = setup();
    await t.store.start();
    t.store.addBist('THYAO'); // zaten başlangıç setinde
    flushSync();
    expect(t.store.prices.filter((p) => p.id === 'THYAO').length).toBe(1);
  });
});
