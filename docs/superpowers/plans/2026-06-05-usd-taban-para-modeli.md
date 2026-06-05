# USD-Taban Para Modeli + Oto-Takas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tek nakit = USD; alımda motor canlı pariteden oto-takas yapar; manuel USD↔TRY çevirme kalkar; K/Z ve kazanma USD cinsinden; mevduat rafa.

**Architecture:** Yaklaşım A — motor (`gameState.ts` reducer'ları) SAF-USD olur ve yeni `UsdPriceOracle { assetUsd(id): Money }` seam'ini tüketir. Parite çevrimi store/fx katmanında kalır: kripto/EUR doğrudan USD, BIST/altın/gümüş `assetTry/usdTry`. UI'da TradePanel'in döviz bloğu silinir, WalletSummary tek USD nakit gösterir, PriceList fiyatları TRY kalır ("dürüst ayna").

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TypeScript (strict) + Vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-usd-taban-para-modeli-design.md`

**Komutlar (Windows PowerShell):**
- Tek dosya test: `npm.cmd run test -- src/lib/stores/gameState.test.ts`
- Tüm test: `npm.cmd run test`
- Tip kontrol: `npm.cmd run check`
- Build: `npm.cmd run build`

---

## File Structure

| Dosya | Sorumluluk | İşlem |
|-------|------------|-------|
| `src/lib/domain/fx/usdOracle.ts` | `UsdPriceOracle` seam arayüzü (motor↔fiyat) | **Create** |
| `src/lib/domain/fx/usdOracle.test.ts` | (yok — saf interface, davranışsız) | — |
| `src/lib/stores/gameState.ts` | Saf-USD reducer kütüphanesi | **Modify** (TRY/mevduat/convert sil, oracle al) |
| `src/lib/stores/gameState.test.ts` | gameState testleri | **Rewrite** (USD) |
| `src/lib/domain/fx/liveFx.ts` | `LivePriceSource` arayüzü (TRY fiyat kaynağı) | **Modify** (`createLiveFxEngine` sil, interface kalsın) |
| `src/lib/domain/fx/liveFx.test.ts` | createLiveFxEngine testleri | **Delete** |
| `src/lib/domain/fx/fx.ts` + `fx.test.ts` | Deterministik VASİYET motoru | **Değişmez** (artık reducer'a bağlı değil; VASİYET adaptörü ayrı sprint) |
| `src/lib/stores/liveGameStore.svelte.ts` | Canlı reaktif store | **Modify** (oracle kur, convert sil, pozisyon USD, `assetUsdPrice`) |
| `src/lib/stores/liveGameStore.test.ts` | Store testleri | **Rewrite** (USD, convert yok) |
| `src/lib/components/format.ts` | Saf gösterim yardımcıları | **Modify** (`positionPnl` jenerik, `signedTry` sil) |
| `src/lib/components/format.test.ts` | format testleri | **Modify** (positionPnl alan adı, signedTry sil) |
| `src/lib/components/WalletSummary.svelte` | Cüzdan paneli | **Modify** (tek USD nakit, pozisyon USD) |
| `src/lib/components/TradePanel.svelte` | İşlem paneli | **Modify** (döviz bloğu sil, MAX/yankı USD) |
| `src/lib/components/PriceList.svelte` | Fiyat listesi | **Değişmez** (fiyat TRY) |
| `src/routes/+page.svelte` | Ana sayfa | **Değişmez** (WalletSummary'e `game.usdBalance` zaten geçiyor; TradePanel `{store}` alıyor) |

**Mevduat hakkında:** `gameState.ts` içindeki `openDeposit`/`closeDeposit` sarmalayıcıları + `advanceTime`'ın mevduat-kapanış mantığı SİLİNİR. Bu nedenle `gameState.test.ts`'teki mevduat `describe` bloğu da **silinir** (spec §5.1'deki "describe.skip" infeasible — silinen sembollere referans TS hatası verir; mevduat mantığı git geçmişinde durur). Alttaki `src/lib/domain/deposit/deposit.ts` modülü + `deposit.test.ts` (15 test) **DOKUNULMAZ** — saf mevduat matematiği VASİYET sprintinde geri bağlanır.

---

## Task 1: `UsdPriceOracle` seam arayüzü

**Files:**
- Create: `src/lib/domain/fx/usdOracle.ts`

- [ ] **Step 1: Arayüz dosyasını yaz**

`src/lib/domain/fx/usdOracle.ts`:
```ts
import type { Money } from '../money';

/**
 * Varlık fiyatını USD cinsinden veren seam. Motor (gameState reducer'ları) bunu
 * tüketir; parite çevrimi store/fx katmanında yapılır → motor SAF-USD kalır.
 * Kripto/EUR doğrudan USD; BIST/altın/gümüş için store `assetTry/usdTry` hesaplar.
 */
export interface UsdPriceOracle {
  /** Varlığın güncel USD fiyatı; canlı fiyat yoksa throw. */
  assetUsd(assetId: string): Money;
}
```

- [ ] **Step 2: Tip kontrolü geçer**

Run: `npm.cmd run check`
Expected: 0 hata (yeni dosya yalnız tip; davranış yok → ayrı test gerekmez).

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain/fx/usdOracle.ts
git commit -m "feat(fx): UsdPriceOracle seam arayuzu (motor saf-USD)"
```

---

## Task 2: `gameState.ts` motorunu saf-USD'ye çevir + testleri yeniden yaz

**Files:**
- Modify: `src/lib/stores/gameState.ts`
- Rewrite: `src/lib/stores/gameState.test.ts`

- [ ] **Step 1: Yeni test dosyasını yaz (kırmızı)**

`src/lib/stores/gameState.test.ts` (TAMAMINI bununla değiştir):
```ts
import { describe, it, expect } from 'vitest';
import {
  createGameState,
  buyAsset,
  sellAsset,
  advanceTime,
  nextEventDay,
  netWorthUsd,
  profitRate,
  grewDollars,
  STARTING_USD,
} from './gameState';
import { usd } from '../domain/money';
import type { UsdPriceOracle } from '../domain/fx/usdOracle';

// Sahte USD fiyat oracle'ı: sabit USD fiyatları (deterministik test).
function stubOracle(prices: Record<string, number>): UsdPriceOracle {
  return {
    assetUsd(id) {
      const p = prices[id];
      if (p === undefined) throw new Error(`No live price: ${id}`);
      return usd(p);
    },
  };
}

const ORACLE = stubOracle({ THYAO: 7.5, ASELS: 5, BTC: 64000, EUR: 1.1 });

describe('createGameState', () => {
  const s = createGameState('vasiyet', 12345, 'player-1', 1000);

  it('başlangıçta $1,000,000 USD', () => {
    expect(s.usdBalance).toEqual({ amount: STARTING_USD, currency: 'USD' });
  });
  it('gün 1, vasiyet 365g', () => {
    expect(s.clock.day).toBe(1);
    expect(s.clock.totalDays).toBe(365);
  });
  it('boş portföy', () => {
    expect(s.holdings).toEqual([]);
  });
  it('kimlik ve zaman alanları', () => {
    expect(s.playerId).toBe('player-1');
    expect(s.scenarioId).toBe('vasiyet');
    expect(s.seed).toBe(12345);
    expect(s.createdAt).toBe(1000);
    expect(s.updatedAt).toBe(1000);
  });
});

describe('varlık al/sat (USD oto-takas)', () => {
  it('buyAsset: USD düşer, holding eklenir, avgCost = USD alış fiyatı', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const s2 = buyAsset(s0, ORACLE, 'THYAO', 100); // 100 × $7.5 = $750
    const h = s2.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(100);
    expect(h.avgCost).toEqual({ amount: 7.5, currency: 'USD' });
    expect(s2.usdBalance.amount).toBeCloseTo(STARTING_USD - 750, 2);
  });

  it('buyAsset kesirli units (0.05 BTC)', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const s2 = buyAsset(s0, ORACLE, 'BTC', 0.05); // 0.05 × $64000 = $3200
    expect(s2.holdings.find((x) => x.assetId === 'BTC')!.units).toBeCloseTo(0.05, 8);
    expect(s2.usdBalance.amount).toBeCloseTo(STARTING_USD - 3200, 2);
  });

  it('buyAsset ikinci alış: units toplanır, avgCost ağırlıklı ortalama (USD)', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100);
    s = buyAsset(s, ORACLE, 'THYAO', 100); // aynı fiyat
    const h = s.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(200);
    expect(h.avgCost.amount).toBeCloseTo(7.5, 2);
  });

  it('buyAsset yetersiz USD -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'THYAO', 1_000_000)).toThrow('Insufficient USD');
  });
  it('buyAsset fiyatsız varlık -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'YOKBU', 1)).toThrow('No live price');
  });
  it('buyAsset pozitif olmayan units -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'THYAO', 0)).toThrow('positive');
  });

  it('sellAsset: USD artar, units azalır', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100); // -$750
    const before = s.usdBalance.amount;
    s = sellAsset(s, ORACLE, 'THYAO', 40); // +40 × $7.5 = $300
    expect(s.holdings.find((x) => x.assetId === 'THYAO')!.units).toBe(60);
    expect(s.usdBalance.amount).toBeCloseTo(before + 300, 2);
  });
  it('sellAsset tamamı satılınca holding silinir', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100);
    s = sellAsset(s, ORACLE, 'THYAO', 100);
    expect(s.holdings.find((x) => x.assetId === 'THYAO')).toBeUndefined();
  });
  it('sellAsset sahip olunandan fazla -> hata', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 10);
    expect(() => sellAsset(s, ORACLE, 'THYAO', 11)).toThrow('Insufficient units');
  });
  it('sellAsset hiç sahip olunmayan -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => sellAsset(s, ORACLE, 'THYAO', 1)).toThrow('Insufficient units');
  });
});

describe('zaman ilerletme', () => {
  it('advanceTime günü ilerletir', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 10);
    expect(s.clock.day).toBe(11);
  });
  it('advanceTime totalDays üstüne çıkmaz', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 999);
    expect(s.clock.day).toBe(365);
  });
  it('nextEventDay son günü verir', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(nextEventDay(s)).toBe(365);
  });
  it('nextEventDay son günde null', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 999);
    expect(nextEventDay(s)).toBeNull();
  });
});

describe('skor (USD)', () => {
  it('gün 1, pozisyonsuz: net servet = $1,000,000', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(netWorthUsd(s, ORACLE).amount).toBeCloseTo(STARTING_USD, 2);
  });
  it('gün 1 pozisyonsuz: profitRate = 1.0', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(profitRate(s, ORACLE)).toBeCloseTo(1.0, 4);
  });
  it('pozisyonsuz nakit doları büyütmez (grewDollars=false)', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(grewDollars(s, ORACLE)).toBe(false);
  });
  it('alım sonrası net servet korunur (oto-takas, makas yok)', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'BTC', 1); // -$64000 nakit, +$64000 holding
    expect(netWorthUsd(s, ORACLE).amount).toBeCloseTo(STARTING_USD, 2);
  });
  it('grewDollars: holding değeri artınca true', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'BTC', 10); // -$640000, +10 BTC
    // fiyat $64000 → $80000 yükselen oracle ile değerle
    const up = stubOracle({ BTC: 80000 });
    expect(grewDollars(s, up)).toBe(true);
    expect(netWorthUsd(s, up).amount).toBeCloseTo(STARTING_USD + 10 * 16000, 2);
  });
  it('determinizm: aynı aksiyonlar -> aynı net servet', () => {
    function run() {
      let s = createGameState('vasiyet', 7, 'p', 0);
      s = buyAsset(s, ORACLE, 'BTC', 0.1);
      s = buyAsset(s, ORACLE, 'THYAO', 200);
      s = advanceTime(s, 100);
      return netWorthUsd(s, ORACLE).amount;
    }
    expect(run()).toBe(run());
  });
});
```

- [ ] **Step 2: Testi çalıştır, kırmızı doğrula**

Run: `npm.cmd run test -- src/lib/stores/gameState.test.ts`
Expected: FAIL — `grewDollars`/`UsdPriceOracle`-tabanlı imza yok, `convertUsdToTry` referansları kalktı (henüz reducer eski).

- [ ] **Step 3: `gameState.ts`'i saf-USD'ye yeniden yaz**

`src/lib/stores/gameState.ts` (TAMAMINI bununla değiştir):
```ts
import type { Money } from '../domain/money';
import { usd, add, subtract, multiply, gte } from '../domain/money';
import type { GameMode } from '../domain/types';
import type { GameClock } from '../domain/time/clock';
import { createClock, advanceDay, isFinished } from '../domain/time/clock';
import type { UsdPriceOracle } from '../domain/fx/usdOracle';

export const STARTING_USD = 1_000_000;

export interface AssetHolding {
  assetId: string;
  units: number;     // pozitif, kesirli olabilir
  avgCost: Money;    // USD, birim başı ortalama alış
}

export interface GameState {
  playerId: string;
  scenarioId: GameMode;
  seed: number;
  clock: GameClock;
  usdBalance: Money;
  holdings: AssetHolding[];
  createdAt: number;
  updatedAt: number;
}

export function createGameState(
  scenarioId: GameMode,
  seed: number,
  playerId: string,
  now: number,
): GameState {
  return {
    playerId,
    scenarioId,
    seed,
    clock: createClock(scenarioId),
    usdBalance: usd(STARTING_USD),
    holdings: [],
    createdAt: now,
    updatedAt: now,
  };
}

// NOT: reducer'lar saf kalsın diye updatedAt'i DEĞİŞTİRMEZ; store/persistence damgalar.

export function buyAsset(
  state: GameState,
  oracle: UsdPriceOracle,
  assetId: string,
  units: number,
): GameState {
  if (units <= 0) throw new Error('Units must be positive');
  const price = oracle.assetUsd(assetId); // fiyatsız/bilinmeyen -> throw
  const cost = multiply(price, units);
  if (!gte(state.usdBalance, cost)) throw new Error('Insufficient USD');

  const existing = state.holdings.find((h) => h.assetId === assetId);
  let holdings: AssetHolding[];
  if (existing) {
    const totalUnits = existing.units + units;
    const avg = (existing.avgCost.amount * existing.units + price.amount * units) / totalUnits;
    holdings = state.holdings.map((h) =>
      h.assetId === assetId ? { assetId, units: totalUnits, avgCost: usd(avg) } : h,
    );
  } else {
    holdings = [...state.holdings, { assetId, units, avgCost: price }];
  }
  return { ...state, usdBalance: subtract(state.usdBalance, cost), holdings };
}

export function sellAsset(
  state: GameState,
  oracle: UsdPriceOracle,
  assetId: string,
  units: number,
): GameState {
  if (units <= 0) throw new Error('Units must be positive');
  const existing = state.holdings.find((h) => h.assetId === assetId);
  if (!existing || existing.units < units) throw new Error('Insufficient units');
  const price = oracle.assetUsd(assetId);
  const proceeds = multiply(price, units);
  const remaining = existing.units - units;
  const holdings =
    remaining > 0
      ? state.holdings.map((h) => (h.assetId === assetId ? { ...h, units: remaining } : h))
      : state.holdings.filter((h) => h.assetId !== assetId);
  return { ...state, usdBalance: add(state.usdBalance, proceeds), holdings };
}

export function advanceTime(state: GameState, step: number): GameState {
  let s = state;
  for (let i = 0; i < step; i++) {
    if (isFinished(s.clock)) break;
    s = { ...s, clock: advanceDay(s.clock) };
  }
  return s;
}

export function nextEventDay(state: GameState): number | null {
  const today = state.clock.day;
  return state.clock.totalDays > today ? state.clock.totalDays : null;
}

export function netWorthUsd(state: GameState, oracle: UsdPriceOracle): Money {
  let total = state.usdBalance.amount;
  for (const h of state.holdings) {
    total += multiply(oracle.assetUsd(h.assetId), h.units).amount;
  }
  return usd(total);
}

export function profitRate(state: GameState, oracle: UsdPriceOracle): number {
  return netWorthUsd(state, oracle).amount / STARTING_USD;
}

/** Kazanma çizgisi: doları büyüt — net servet $1M'ı geçti mi? */
export function grewDollars(state: GameState, oracle: UsdPriceOracle): boolean {
  return netWorthUsd(state, oracle).amount > STARTING_USD;
}
```

- [ ] **Step 4: Testi çalıştır, yeşil doğrula**

Run: `npm.cmd run test -- src/lib/stores/gameState.test.ts`
Expected: PASS (tüm gameState testleri).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameState.ts src/lib/stores/gameState.test.ts
git commit -m "refactor(engine): gameState saf-USD + oto-takas (TRY/mevduat/convert kalkti)"
```

---

## Task 3: `liveFx.ts` ölü kodu temizle (`createLiveFxEngine` sil)

**Files:**
- Modify: `src/lib/domain/fx/liveFx.ts`
- Delete: `src/lib/domain/fx/liveFx.test.ts`

`createLiveFxEngine` artık hiçbir yerde kullanılmıyor (reducer'lar `UsdPriceOracle` alıyor). `LivePriceSource` arayüzü kalır — store TRY fiyat gösterimi (`PriceList`) için kullanıyor.

- [ ] **Step 1: `liveFx.test.ts`'i sil**

```bash
git rm src/lib/domain/fx/liveFx.test.ts
```

- [ ] **Step 2: `liveFx.ts`'i sadeleştir**

`src/lib/domain/fx/liveFx.ts` (TAMAMINI bununla değiştir):
```ts
/** Canlı TRY fiyat kaynağı — store (canlı fiyat cache) tarafından doldurulur.
 *  Tüm fiyatlar TRY'dir; PriceList gösterimi için kullanılır. USD çevrimi
 *  `UsdPriceOracle` (store) tarafından yapılır. */
export interface LivePriceSource {
  /** Güncel USD/TRY mid kuru. */
  usdTry(): number;
  /** Verilen varlığın güncel TRY fiyatı; canlı fiyat yoksa undefined. */
  assetTry(assetId: string): number | undefined;
}
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm.cmd run check`
Expected: FAIL — `liveGameStore.svelte.ts` hâlâ `createLiveFxEngine` import ediyor (Task 4'te düzelir). Bu beklenen; Task 4 öncesi bu adımı tek başına commit'leme.

> NOT: Bu task ve Task 4 birlikte tip-tutarlı hale gelir. Subagent-driven modda Task 3 + Task 4'ü tek implementer'a ardışık ver; check yalnız Task 4 sonunda yeşil beklenir.

- [ ] **Step 4: (Task 4 ile birlikte commit — aşağıya bak)**

---

## Task 4: `liveGameStore.svelte.ts` — oracle kur, convert sil, pozisyon USD

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Rewrite: `src/lib/stores/liveGameStore.test.ts`

- [ ] **Step 1: Store test dosyasını yeniden yaz (kırmızı)**

`src/lib/stores/liveGameStore.test.ts` (TAMAMINI bununla değiştir):
```ts
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
    expect(t.fetchFn).toHaveBeenCalledWith('/api/crypto?coins=BTC,ETH');
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

  it('13) addBist tekrarı yinelenmez (idempotent)', async () => {
    const t = setup();
    await t.store.start();
    t.store.addBist('THYAO');
    flushSync();
    expect(t.store.prices.filter((p) => p.id === 'THYAO').length).toBe(1);
  });
});
```

- [ ] **Step 2: Testi çalıştır, kırmızı doğrula**

Run: `npm.cmd run test -- src/lib/stores/liveGameStore.test.ts`
Expected: FAIL — `usdToTry` kalktı, `positions` USD alanları yok, `assetUsd` oracle yok.

- [ ] **Step 3: `liveGameStore.svelte.ts`'i refaktör et**

3a. **Importları düzelt** — `gameState` import bloğunu değiştir:
```ts
import {
  createGameState,
  buyAsset,
  sellAsset,
  netWorthUsd as netWorthUsdFn,
  STARTING_USD,
} from './gameState';
```
(`convertUsdToTry`, `convertTryToUsd` çıkar.)

3b. **liveFx importunu daralt** — şu satırı:
```ts
import { createLiveFxEngine, type LivePriceSource } from '../domain/fx/liveFx';
```
şununla değiştir:
```ts
import type { LivePriceSource } from '../domain/fx/liveFx';
import type { UsdPriceOracle } from '../domain/fx/usdOracle';
```

3c. **`PositionRow`'u USD'ye çevir** — arayüzü değiştir:
```ts
/** WalletSummary satırı — holding + güncel USD değer. */
export interface PositionRow {
  assetId: string;
  label: string;
  units: number;
  avgCostUsd: number;
  priceUsd: number | undefined;
  valueUsd: number | undefined;
}
```

3d. **`LiveGameStore` arayüzünü güncelle** — `usdToTry`/`tryToUsd` satırlarını sil, `assetUsdPrice` ekle:
```ts
  buy(assetId: string, units: number): void;
  sell(assetId: string, units: number): void;
  assetUsdPrice(assetId: string): number | undefined;
  setPeriod(days: PeriodDays): void;
  addBist(symbol: string): void;
  start(): Promise<void>;
  stop(): void;
```
(`usdToTry(amount: Money): void;` ve `tryToUsd(amount: Money): void;` satırlarını kaldır.)

3e. **`source` sonrası oracle ve fx'i değiştir** — şu bloğu:
```ts
  const fx = createLiveFxEngine(source);
```
şununla değiştir:
```ts
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
      return usd(t / fxCache.usdTry);
    },
  };
```

3f. **`netWorth` derived'ı oracle'a bağla** — `netWorthUsdFn(game, fx)` → `netWorthUsdFn(game, oracle)`:
```ts
  const netWorth = $derived.by<Money | null>(() => {
    try {
      return netWorthUsdFn(game, oracle);
    } catch {
      return null;
    }
  });
```

3g. **`positions` derived'ı USD'ye çevir** — tüm bloğu değiştir:
```ts
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
        label: CATALOG[h.assetId]?.label ?? bistName(h.assetId),
        units: h.units,
        avgCostUsd: h.avgCost.amount,
        priceUsd,
        valueUsd: priceUsd === undefined ? undefined : priceUsd * h.units,
      };
    }),
  );
```
(`prices` derived DEĞİŞMEZ — `source.assetTry` + `fxCache.prices[sym]` ile TRY gösterimi sürer.)

3h. **Yazma aksiyonlarını güncelle** — `buy`/`sell`'i oracle'a bağla, `usdToTry`/`tryToUsd`'yi sil, `assetUsdPrice` ekle:
```ts
  const buy = (assetId: string, units: number) => apply(() => buyAsset(game, oracle, assetId, units));
  const sell = (assetId: string, units: number) => apply(() => sellAsset(game, oracle, assetId, units));
  /** Seçili varlığın USD fiyatı (TradePanel MAX + maliyet yankısı için); fiyat yoksa undefined. */
  function assetUsdPrice(assetId: string): number | undefined {
    try {
      return oracle.assetUsd(assetId).amount;
    } catch {
      return undefined;
    }
  }
```
(`const usdToTry = ...` ve `const tryToUsd = ...` satırlarını sil.)

3i. **Return nesnesini güncelle** — `usdToTry,` ve `tryToUsd,` satırlarını sil, `assetUsdPrice,` ekle:
```ts
    buy,
    sell,
    assetUsdPrice,
    setPeriod,
    addBist,
    start,
    stop,
```
(`usdTry` getter'ı KALIR — parite göstergesi.)

- [ ] **Step 4: Testi çalıştır, yeşil doğrula**

Run: `npm.cmd run test -- src/lib/stores/liveGameStore.test.ts`
Expected: PASS (13 test).

- [ ] **Step 5: Tip kontrolü (Task 3 + 4 birlikte yeşil)**

Run: `npm.cmd run check`
Expected: 0 hata (component'lar Task 6/7'de güncellenecek; eğer WalletSummary/TradePanel hâlâ eski alanlara bakıyorsa burada hata çıkar — sıralı modda bu task'tan sonra check'i 6/7 sonrası bekle. Bkz. NOT.)

> NOT: WalletSummary/TradePanel hâlâ `valueTry`/`usdToTry` kullandığı için `check` Task 7 sonuna kadar kırmızı kalabilir. Sıralı subagent modunda check'i her component task'ından sonra çalıştır; tam yeşil Task 7 sonunda beklenir. Test komutları (Vitest) component'lardan bağımsız çalışır.

- [ ] **Step 6: Commit (Task 3 + 4 birlikte)**

```bash
git add src/lib/domain/fx/liveFx.ts src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "refactor(store): USD oracle + oto-takas, convert/createLiveFxEngine kalkti, pozisyon USD"
```

---

## Task 5: `format.ts` — `positionPnl` jenerik, `signedTry` sil

**Files:**
- Modify: `src/lib/components/format.ts`
- Modify: `src/lib/components/format.test.ts`

`positionPnl` saf sayısaldır; alan adı `pnlTry` yanıltıcı → `pnl`'e döner (yalnız WalletSummary kullanıyor). `signedTry` artık kullanılmıyor (WalletSummary `signedUsd`'ye geçiyor) → silinir.

- [ ] **Step 1: Test dosyasını güncelle (kırmızı)**

`src/lib/components/format.test.ts`:

1a. İlk satırdaki import'tan `signedTry`'ı çıkar:
```ts
import { displayTry, displayUsd, pnlClass, signedPercent, marketBadge, signedUsd, dailyChangeBadge, relativeTime, positionPnl, maxUnitsAffordable } from './format';
```

1b. `positionPnl` describe bloğundaki dört `expect`'i (satır ~135-144) güncelle — `pnlTry` → `pnl`:
```ts
		expect(positionPnl(1, 100, undefined)).toEqual({ pnl: undefined, pnlPct: undefined });
```
```ts
		expect(positionPnl(1, 100, 120)).toEqual({ pnl: 20, pnlPct: 20 });
```
```ts
		expect(positionPnl(2, 50, 80)).toEqual({ pnl: -20, pnlPct: -20 });
```
```ts
		expect(positionPnl(5, 0, 100)).toEqual({ pnl: 100, pnlPct: undefined });
```

1c. `signedTry` describe bloğunu (satır ~148-166, `describe('signedTry', ...)` tamamını) **sil**.

- [ ] **Step 2: Testi çalıştır, kırmızı doğrula**

Run: `npm.cmd run test -- src/lib/components/format.test.ts`
Expected: FAIL — `positionPnl` hâlâ `pnlTry` döndürüyor.

- [ ] **Step 3: `format.ts`'i güncelle**

3a. `positionPnl`'i jenerik yap (satır ~88-98'i değiştir):
```ts
/**
 * Pozisyon kâr/zararı (para birimi bağımsız — sayısal).
 * value undefined → her ikisi undefined.
 * pnl = güncel değer − (adet × ort. maliyet); pnlPct yüzde (20 = +%20).
 * maliyet 0 ise pnlPct undefined (sıfıra bölme yok).
 */
export function positionPnl(
	units: number,
	avgCost: number,
	value: number | undefined,
): { pnl: number | undefined; pnlPct: number | undefined } {
	if (value === undefined) return { pnl: undefined, pnlPct: undefined };
	const cost = units * avgCost;
	const pnl = value - cost;
	const pnlPct = cost > 0 ? (pnl / cost) * 100 : undefined;
	return { pnl, pnlPct };
}
```

3b. `signedTry` fonksiyonunu (satır ~100-108) **sil**.

- [ ] **Step 4: Testi çalıştır, yeşil doğrula**

Run: `npm.cmd run test -- src/lib/components/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/format.ts src/lib/components/format.test.ts
git commit -m "refactor(format): positionPnl para-birimi bagimsiz, signedTry kalkti"
```

---

## Task 6: `WalletSummary.svelte` — tek USD nakit + USD pozisyon

**Files:**
- Modify: `src/lib/components/WalletSummary.svelte`

- [ ] **Step 1: Component'i güncelle**

`src/lib/components/WalletSummary.svelte` (TAMAMINI bununla değiştir):
```svelte
<script lang="ts">
	import type { GameState } from '$lib/stores/gameState';
	import type { PositionRow } from '$lib/stores/liveGameStore.svelte';
	import { usd, formatMoney } from '$lib/domain/money';
	import { displayUsd, signedUsd, pnlClass, dailyChangeBadge, positionPnl } from './format';

	interface Props {
		game: GameState;
		usdTry: number;
		positions: PositionRow[];
	}

	let { game, usdTry, positions }: Props = $props();

	const usdRate = $derived(usdTry.toFixed(2));
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
			<span class="text-term-text opacity-50 text-[10px]">USD/TRY (parite)</span>
			<span class="text-term-blue text-[10px]">₺{usdRate}</span>
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
			<div class="space-y-1">
				{#each positions as p (p.assetId)}
					{@const pnl = positionPnl(p.units, p.avgCostUsd, p.valueUsd)}
					{@const pctBadge = dailyChangeBadge(pnl.pnlPct)}
					<div class="flex justify-between items-start gap-2 border-b border-term-border border-opacity-30 pb-1 last:border-0 last:pb-0">
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
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm.cmd run check`
Expected: WalletSummary hatasız (TradePanel hâlâ kırmızı olabilir — Task 7'de düzelir).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/WalletSummary.svelte
git commit -m "feat(ui): WalletSummary tek USD nakit + USD pozisyon degeri/K-Z"
```

---

## Task 7: `TradePanel.svelte` — döviz bloğu kalkar, MAX/yankı USD

**Files:**
- Modify: `src/lib/components/TradePanel.svelte`

- [ ] **Step 1: Component'i güncelle**

`src/lib/components/TradePanel.svelte` (TAMAMINI bununla değiştir):
```svelte
<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { CATALOG } from '$lib/catalog/liveAssets';
	import { bistName } from '$lib/catalog/bist100';
	import { displayUsd, maxUnitsAffordable } from './format';

	interface Props {
		store: LiveGameStore;
		selectedAssetId: string | null;
	}

	let { store, selectedAssetId }: Props = $props();

	// Hızlı-tutar düğmesi ortak stili (MAX için)
	const chipCls =
		'px-1.5 py-0.5 bg-term-bg border border-term-border text-term-blue text-[10px] ' +
		'hover:border-term-borderGlow hover:text-term-green transition-colors';

	// USD nakit + seçili varlık USD fiyatı (MAX / maliyet yankısı için)
	const usdBalance = $derived(store.game.usdBalance.amount);
	const selectedAssetUsd = $derived(
		selectedAssetId ? store.assetUsdPrice(selectedAssetId) : undefined,
	);

	// ── Al/Sat durumu ────────────────────────────────────────────────────────────
	let units = $state(0);

	function maxUnits() {
		units = maxUnitsAffordable(usdBalance, selectedAssetUsd);
	}

	const assetLabel = $derived(
		selectedAssetId ? (CATALOG[selectedAssetId]?.label ?? bistName(selectedAssetId)) : null,
	);

	function handleBuy() {
		if (!selectedAssetId || units <= 0) return;
		store.buy(selectedAssetId, units);
		units = 0;
	}

	function handleSell() {
		if (!selectedAssetId || units <= 0) return;
		store.sell(selectedAssetId, units);
		units = 0;
	}
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-4">
	<!-- Başlık -->
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		İŞLEM PANELI
	</div>

	<!-- Al / Sat (USD nakitten oto-takas) -->
	<div class="space-y-2">
		<div class="text-term-text opacity-60 text-[10px] uppercase tracking-wider">
			Al / Sat
		</div>
		<div class="text-term-amber text-[10px] leading-relaxed">
			Tüm işlemler USD nakitten yapılır. BIST/altın/gümüş alımında kur otomatik takas edilir.
		</div>

		{#if selectedAssetId === null}
			<div class="text-term-text opacity-40 italic py-2 text-center">
				Soldan bir varlık seç
			</div>
		{:else}
			<div class="text-term-green font-bold mb-2">
				{assetLabel}
				<span class="text-term-text opacity-50 font-normal ml-1 text-[10px]">({selectedAssetId})</span>
			</div>

			<div class="space-y-1">
				<div class="flex items-center gap-2">
					<label for="trade-units" class="text-term-text opacity-50 shrink-0 w-20">Adet</label>
					<input
						type="number"
						min="0"
						id="trade-units"
						step="0.0001"
						bind:value={units}
						class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
						       focus:outline-none focus:border-term-borderGlow text-xs w-full"
					/>
					<button type="button" onclick={maxUnits} class="shrink-0 {chipCls}">MAX</button>
				</div>
				<div class="flex justify-end">
					<span class="text-term-text opacity-50 text-[10px]">
						≈ {displayUsd(selectedAssetUsd !== undefined ? usd(units * selectedAssetUsd) : null)}
					</span>
				</div>
			</div>

			<div class="flex gap-2 mt-1">
				<button
					type="button"
					onclick={handleBuy}
					class="flex-1 py-1.5 bg-term-bg border border-term-green text-term-green font-bold
					       hover:bg-term-panelLight glow-border-green transition-colors"
				>
					AL
				</button>
				<button
					type="button"
					onclick={handleSell}
					class="flex-1 py-1.5 bg-term-bg border border-term-red text-term-red font-bold
					       hover:bg-term-panelLight transition-colors"
				>
					SAT
				</button>
			</div>
		{/if}
	</div>

	<!-- Hata bandı -->
	{#if store.lastError !== null}
		<div class="border border-term-red bg-term-bg px-3 py-2 text-term-red text-[11px] leading-snug">
			<span class="font-bold mr-1">HATA:</span>{store.lastError}
		</div>
	{/if}
</div>
```

- [ ] **Step 2: Tip kontrolü tam yeşil**

Run: `npm.cmd run check`
Expected: 0 hata/uyarı (tüm component'lar artık USD modeline uyumlu).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/TradePanel.svelte
git commit -m "feat(ui): TradePanel doviz blogu kalkti, USD MAX + maliyet yankisi"
```

---

## Task 8: Final doğrulama

**Files:** (yok — yalnız doğrulama)

- [ ] **Step 1: Tüm testler**

Run: `npm.cmd run test`
Expected: PASS — tüm suite yeşil (gameState USD + store USD + format + deposit domain modülü 15 test dokunulmadan + diğerleri).

- [ ] **Step 2: Tip kontrolü**

Run: `npm.cmd run check`
Expected: 0 hata, 0 uyarı.

- [ ] **Step 3: Build**

Run: `npm.cmd run build`
Expected: başarılı build (hata yok).

- [ ] **Step 4: Manuel duman testi (opsiyonel, kullanıcı)**

Run: `npm.cmd run dev` → tarayıcı → BAŞLA → bir BIST hissesi seç → MAX → AL.
Beklenen: USD nakit düşer, pozisyon USD değer+K/Z gösterir, "Döviz Çevirimi" paneli YOK, hata yok.

- [ ] **Step 5: Dal tamamlama**

`superpowers:finishing-a-development-branch` ile merge/PR kararını sun.

---

## Self-Review (yazıldıktan sonra plan↔spec)

- **Spec §2.1 tek nakit USD** → Task 2 (`tryBalance` silindi), Task 6 (UI tek nakit) ✅
- **Spec §2.1 oto-takas** → Task 2 (`buyAsset` oracle), Task 4 (oracle `assetTry/usdTry`) ✅
- **Spec §2.3 K/Z USD** → Task 4 (PositionRow USD), Task 5 (positionPnl jenerik), Task 6 ✅
- **Spec §2.4 grewDollars** → Task 2 (`grewDollars`, `INFLATION_TARGET_USD` silindi) ✅
- **Spec §2.5 mevduat rafa** → Task 2 (openDeposit/closeDeposit/advanceTime-mevduat silindi; deposit domain modülü dokunulmadı) ✅
- **Spec §2.6 Yaklaşım A** → Task 1 (UsdPriceOracle), Task 2 (reducer'lar oracle alır) ✅
- **Spec §4.1 TradePanel döviz bloğu kalkar** → Task 7 ✅
- **Spec §4.4 PriceList TRY kalır** → değişmez (Task 4 `prices` derived dokunulmadı) ✅
- **Spec §5 test stratejisi** → Task 2/4/5 testleri USD'ye yazıldı; spec §5.1 "describe.skip" yerine **silme** uygulandı (silinen sembollere referans TS hatası verir; gerekçe File Structure notunda) ✅
- **Tip tutarlılığı:** `grewDollars`, `assetUsd`, `avgCostUsd`/`valueUsd`/`priceUsd`, `assetUsdPrice`, `positionPnl().pnl` adları tüm task'larda tutarlı ✅
- **Placeholder taraması:** yok ✅
