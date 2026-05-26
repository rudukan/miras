# Game State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VASİYET (ve aynı motoru paylaşan modlar) için saf, test edilebilir oyun-durumu çekirdeği: nakit, döviz çevrimi, genel varlık (borsa/kripto/emtia/döviz) al-sat, mevduat, akıllı zaman ilerletme, net servet + kâr oranı (ayna skoru).

**Architecture:** Önce FX/scenario katmanı `stock→asset` olarak genelleştirilir (Task 1). Sonra `src/lib/stores/gameState.ts` saf reducer kütüphanesi olarak kurulur — Svelte reaktivitesi yok, `(state, ...) → yeni state`. Fiyat daima `state.clock.day`'de okunur (gizli gelecek). Reaktif store (Task 7) ve persistence (Task 6) bu planın dışında.

**Tech Stack:** TypeScript (strict), Vitest. Para: `src/lib/domain/money.ts`. Bağımlılıklar: `fx`, `deposit`, `time/clock`, `scenario/types`.

**Spec:** `docs/superpowers/specs/2026-05-26-game-state-design.md`

**Kapsam dışı (bilinçli):** Emlak (Task 5b), persistence (Task 6), reaktif store (Task 7), skor tabelası (Supabase), trader ajanı, benchmark hesabı, canlı API, 2001/2018 verisi, komisyon, vergi. BIST100 roster genişletmesi = quant veri görevi (placeholder veriyle ilerlenir).

---

## Dosya Yapısı

| Dosya | Sorumluluk | İşlem |
|-------|-----------|-------|
| `src/lib/domain/scenario/types.ts` | `AssetSeed`+`category`, `assets`, `depositAnnualRate` | Değiştir |
| `src/lib/data/macro2025.ts` | `stocks`→`assets`, kategori, 5 yeni varlık, depositAnnualRate | Değiştir |
| `src/lib/data/macro2025.test.ts` | asset/kategori/yeni varlık testleri | Değiştir |
| `src/lib/domain/fx/fx.ts` | `stockPriceForDay`→`assetPriceForDay` | Değiştir |
| `src/lib/domain/fx/fx.test.ts` | rename + BTC testi | Değiştir |
| `src/lib/stores/gameState.ts` | State tipi + saf reducer'lar + skor | Oluştur |
| `src/lib/stores/gameState.test.ts` | TDD testleri | Oluştur |

---

## Task 1: FX/Scenario Genelleştirme (asset modeli + yeni varlıklar)

Davranış-koruyucu refactor + yeni varlık verisi. Önce testleri yeni API'ye çevir (RED), sonra implementasyonu güncelle (GREEN).

**Files:**
- Modify: `src/lib/domain/scenario/types.ts`
- Modify: `src/lib/data/macro2025.ts`
- Modify: `src/lib/data/macro2025.test.ts`
- Modify: `src/lib/domain/fx/fx.ts`
- Modify: `src/lib/domain/fx/fx.test.ts`

- [ ] **Step 1: macro2025.test.ts'i yeni API'yle TAMAMEN değiştir (RED)**

`src/lib/data/macro2025.test.ts` (yeni içerik):

```ts
import { describe, it, expect } from 'vitest';
import { VASIYET_2025 } from './macro2025';

const REQUIRED_BIST = [
  'THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'SASA', 'YKBNK', 'BIMAS',
];
const REQUIRED_NEW = ['BTC', 'ETH', 'XAUGRAM', 'XAGGRAM', 'EUR'];

describe('VASIYET_2025 senaryosu', () => {
  it('temel senaryo alanları doğru', () => {
    expect(VASIYET_2025.id).toBe('vasiyet');
    expect(VASIYET_2025.year).toBe(2025);
    expect(VASIYET_2025.totalDays).toBe(365);
    expect(VASIYET_2025.fxSource).toBe('seeded');
    expect(VASIYET_2025.timeMode).toBe('turn');
  });
  it('mevduat yıllık faizi 0.42', () => {
    expect(VASIYET_2025.data.depositAnnualRate).toBe(0.42);
  });
});

describe('USD/TRY çapaları', () => {
  const anchors = VASIYET_2025.data.usdTryAnchors;
  it('gün 0 ile başlar, gün 365 ile biter', () => {
    expect(anchors[0].day).toBe(0);
    expect(anchors[anchors.length - 1].day).toBe(365);
  });
  it('gün değerleri kesin artan sırada', () => {
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i].day).toBeGreaterThan(anchors[i - 1].day);
    }
  });
  it('yıl içinde yukarı trend (son > ilk)', () => {
    expect(anchors[anchors.length - 1].rate).toBeGreaterThan(anchors[0].rate);
  });
  it('gürültü genliği küçük (0, 0.01)', () => {
    expect(VASIYET_2025.data.usdTryVolatility).toBeGreaterThan(0);
    expect(VASIYET_2025.data.usdTryVolatility).toBeLessThan(0.01);
  });
});

describe('Varlık evreni (assets)', () => {
  const assets = VASIYET_2025.data.assets;
  const ids = assets.map((a) => a.id);

  it('9 kanonik BIST hissesi var ve kategorileri "bist"', () => {
    const bist = assets.filter((a) => a.category === 'bist');
    expect(bist).toHaveLength(9);
    for (const t of REQUIRED_BIST) expect(ids).toContain(t);
  });
  it('5 yeni varlık (BTC/ETH/altın/gümüş/EUR) mevcut', () => {
    for (const t of REQUIRED_NEW) expect(ids).toContain(t);
  });
  it('her varlığın geçerli bir kategorisi var', () => {
    const valid = new Set(['bist', 'crypto', 'commodity', 'fx']);
    for (const a of assets) expect(valid.has(a.category)).toBe(true);
  });
  it('BTC ve ETH crypto, altın/gümüş commodity, EUR fx', () => {
    const cat = (id: string) => assets.find((a) => a.id === id)!.category;
    expect(cat('BTC')).toBe('crypto');
    expect(cat('ETH')).toBe('crypto');
    expect(cat('XAUGRAM')).toBe('commodity');
    expect(cat('XAGGRAM')).toBe('commodity');
    expect(cat('EUR')).toBe('fx');
  });
  it('tüm başlangıç fiyatları pozitif', () => {
    for (const a of assets) expect(a.startPrice).toBeGreaterThan(0);
  });
  it('tüm volatiliteler (0, 0.1) aralığında', () => {
    for (const a of assets) {
      expect(a.volatility).toBeGreaterThan(0);
      expect(a.volatility).toBeLessThan(0.1);
    }
  });
});
```

- [ ] **Step 2: fx.test.ts'i yeni API'ye çevir (RED)**

`src/lib/domain/fx/fx.test.ts` içinde, satır 69-102 arasındaki `describe('createFxEngine.stockPriceForDay', ...)` bloğunun TAMAMINI aşağıdakiyle değiştir (rename + bilinmeyen mesaj + BTC testi):

```ts
describe('createFxEngine.assetPriceForDay', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('deterministik: aynı seed+id+gün -> aynı sonuç', () => {
    expect(fx.assetPriceForDay('THYAO', 100).amount)
      .toBe(fx.assetPriceForDay('THYAO', 100).amount);
  });
  it('TRY cinsinden döner', () => {
    expect(fx.assetPriceForDay('THYAO', 10).currency).toBe('TRY');
  });
  it('gün 0 başlangıç fiyatının ±%2 bandında (THYAO=300)', () => {
    const p = fx.assetPriceForDay('THYAO', 0).amount;
    expect(p).toBeGreaterThanOrEqual(300 * 0.98);
    expect(p).toBeLessThanOrEqual(300 * 1.02);
  });
  it('yıl sonu drift uygulanır (THYAO +%25 -> ~375, > başlangıç)', () => {
    const p = fx.assetPriceForDay('THYAO', 365).amount;
    expect(p).toBeGreaterThan(360);
    expect(p).toBeLessThan(390);
  });
  it('bilinmeyen varlık hata fırlatır', () => {
    expect(() => fx.assetPriceForDay('YOKBU', 10)).toThrow('Unknown asset: YOKBU');
  });
  it('farklı günler farklı fiyat verir (gürültü canlı)', () => {
    expect(fx.assetPriceForDay('THYAO', 5).amount)
      .not.toBe(fx.assetPriceForDay('THYAO', 6).amount);
  });
  it('varlıklar bağımsız seri: aynı gün THYAO ve EREGL bağımsız sapar', () => {
    expect(fx.assetPriceForDay('THYAO', 7).amount)
      .not.toBe(fx.assetPriceForDay('EREGL', 7).amount);
  });
  it('non-BIST varlık da fiyatlanır (BTC, crypto)', () => {
    const p = fx.assetPriceForDay('BTC', 0);
    expect(p.currency).toBe('TRY');
    expect(p.amount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Testleri çalıştır, başarısız olduğunu doğrula (RED)**

Run: `npm run test -- macro2025 fx`
Expected: FAIL — `data.assets`/`assetPriceForDay`/`depositAnnualRate` tanımsız (eski `stocks`/`stockPriceForDay` hâlâ kullanımda).

- [ ] **Step 4: scenario/types.ts'i güncelle (GREEN)**

`src/lib/domain/scenario/types.ts` (yeni içerik):

```ts
import type { GameMode } from '../types';

export type AssetCategory = 'bist' | 'crypto' | 'commodity' | 'fx';

export interface AssetSeed {
  readonly id: string;           // 'THYAO' | 'BTC' | 'XAUGRAM' | 'EUR'
  readonly category: AssetCategory;
  readonly startPrice: number;   // TRY, gün 0
  readonly annualDrift: number;  // yıllık yön (0.25 = +%25)
  readonly volatility: number;   // günlük gürültü genliği (0.02 = ±%2)
}

export interface UsdTryAnchor {
  readonly day: number;
  readonly rate: number;
}

export interface ScenarioData {
  readonly usdTryAnchors: ReadonlyArray<UsdTryAnchor>;
  readonly usdTryVolatility: number;
  readonly assets: ReadonlyArray<AssetSeed>;
  readonly dailyInflation: number;
  readonly depositAnnualRate: number; // VASIYET 0.42; 2001'de çok yüksek (sonra)
}

export type FxSource = 'seeded' | 'live';
export type Difficulty = 'orta' | 'zor' | 'cokZor';

export interface Scenario {
  readonly id: GameMode;
  readonly year: number;
  readonly totalDays: number;
  readonly timeMode: 'turn' | 'realtime';
  readonly fxSource: FxSource;
  readonly difficulty: Difficulty;
  readonly data: ScenarioData;
}
```

- [ ] **Step 5: macro2025.ts'i güncelle (GREEN)**

`src/lib/data/macro2025.ts` (yeni içerik):

```ts
import type { Scenario, AssetSeed } from '../domain/scenario/types';

// 2025 USD/TRY aylık çapa noktaları (≈30 günlük adım). quant doğrulayacak.
const USD_TRY_ANCHORS_2025 = [
  { day: 0, rate: 35.30 },
  { day: 30, rate: 36.00 },
  { day: 60, rate: 36.60 },
  { day: 90, rate: 38.00 },
  { day: 120, rate: 38.40 },
  { day: 150, rate: 38.90 },
  { day: 180, rate: 39.40 },
  { day: 210, rate: 40.00 },
  { day: 240, rate: 40.80 },
  { day: 270, rate: 41.30 },
  { day: 300, rate: 41.80 },
  { day: 330, rate: 42.30 },
  { day: 365, rate: 42.50 },
];

// Başlangıç fiyatları (TRY) ve yıllık yön — TÜMÜ knowledge-cutoff tahmini,
// quant-analyst gerçek 2025 verisiyle kalibre edecek (BIST100'e genişletme dahil).
const ASSETS_2025: AssetSeed[] = [
  // BIST (kategori 'bist') — quant BIST100'e genişletecek
  { id: 'THYAO', category: 'bist', startPrice: 300, annualDrift: 0.25, volatility: 0.020 },
  { id: 'EREGL', category: 'bist', startPrice: 28, annualDrift: 0.10, volatility: 0.020 },
  { id: 'ASELS', category: 'bist', startPrice: 65, annualDrift: 0.40, volatility: 0.025 },
  { id: 'GUBRF', category: 'bist', startPrice: 180, annualDrift: 0.15, volatility: 0.030 },
  { id: 'KCHOL', category: 'bist', startPrice: 180, annualDrift: 0.20, volatility: 0.020 },
  { id: 'TUPRS', category: 'bist', startPrice: 150, annualDrift: 0.18, volatility: 0.020 },
  { id: 'SASA', category: 'bist', startPrice: 3.5, annualDrift: 0.05, volatility: 0.030 },
  { id: 'YKBNK', category: 'bist', startPrice: 30, annualDrift: 0.30, volatility: 0.025 },
  { id: 'BIMAS', category: 'bist', startPrice: 500, annualDrift: 0.22, volatility: 0.015 },
  // crypto (TRY fiyatlı)
  { id: 'BTC', category: 'crypto', startPrice: 3_350_000, annualDrift: 0.30, volatility: 0.045 },
  { id: 'ETH', category: 'crypto', startPrice: 120_000, annualDrift: 0.25, volatility: 0.050 },
  // commodity (gram, TRY)
  { id: 'XAUGRAM', category: 'commodity', startPrice: 3050, annualDrift: 0.30, volatility: 0.015 },
  { id: 'XAGGRAM', category: 'commodity', startPrice: 36, annualDrift: 0.28, volatility: 0.020 },
  // fx (EUR/TRY)
  { id: 'EUR', category: 'fx', startPrice: 37.0, annualDrift: 0.18, volatility: 0.004 },
];

export const VASIYET_2025: Scenario = {
  id: 'vasiyet',
  year: 2025,
  totalDays: 365,
  timeMode: 'turn',
  fxSource: 'seeded',
  difficulty: 'orta',
  data: {
    usdTryAnchors: USD_TRY_ANCHORS_2025,
    usdTryVolatility: 0.003,
    assets: ASSETS_2025,
    dailyInflation: 0.0001,
    depositAnnualRate: 0.42,
  },
};
```

- [ ] **Step 6: fx.ts'i güncelle (GREEN)**

`src/lib/domain/fx/fx.ts` (yeni içerik):

```ts
import type { Money } from '../money';
import { tryM } from '../money';
import type { Scenario, UsdTryAnchor, AssetSeed } from '../scenario/types';
import { signedNoise, stringSeed } from './noise';

/** Çapa noktaları arası lineer interpolasyon; aralık dışında uç değere sabitlenir. */
export function interpolateAnchors(
  anchors: ReadonlyArray<UsdTryAnchor>,
  day: number,
): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (day <= first.day) return first.rate;
  if (day >= last.day) return last.rate;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (day >= a.day && day <= b.day) {
      const t = (day - a.day) / (b.day - a.day);
      return a.rate + (b.rate - a.rate) * t;
    }
  }
  return last.rate;
}

export interface FxEngine {
  usdTryForDay(day: number): Money;
  assetPriceForDay(assetId: string, day: number): Money;
}

export function createFxEngine(scenario: Scenario, seed: number): FxEngine {
  const { usdTryAnchors, usdTryVolatility, assets } = scenario.data;
  const assetMap = new Map<string, AssetSeed>(assets.map((a) => [a.id, a]));

  function usdTryForDay(day: number): Money {
    const base = interpolateAnchors(usdTryAnchors, day);
    const rate = base * (1 + usdTryVolatility * signedNoise(seed, day));
    return tryM(rate);
  }

  function assetPriceForDay(assetId: string, day: number): Money {
    const asset = assetMap.get(assetId);
    if (!asset) throw new Error(`Unknown asset: ${assetId}`);
    const trend = asset.startPrice * (1 + asset.annualDrift * (day / scenario.totalDays));
    const price = trend * (1 + asset.volatility * signedNoise(seed, day, stringSeed(assetId)));
    return tryM(price);
  }

  return { usdTryForDay, assetPriceForDay };
}
```

- [ ] **Step 7: Testleri çalıştır, geçtiğini doğrula (GREEN)**

Run: `npm run test -- macro2025 fx`
Expected: PASS. Eski FX davranış testleri (determinizm/anchor/drift) yeni isimlerle yeşil = refactor davranışı korudu.

- [ ] **Step 8: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 9: Commit**

```bash
git add src/lib/domain/scenario/types.ts src/lib/data/macro2025.ts src/lib/data/macro2025.test.ts src/lib/domain/fx/fx.ts src/lib/domain/fx/fx.test.ts
git commit -m "refactor(domain): FX/scenario genel varlık modeli (asset+category) + BTC/ETH/altın/gümüş/EUR + depositAnnualRate"
```

---

## Task 2: GameState tipi + createGameState

**Files:**
- Create: `src/lib/stores/gameState.ts`
- Test: `src/lib/stores/gameState.test.ts`

- [ ] **Step 1: Failing test yaz**

`src/lib/stores/gameState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGameState, STARTING_USD } from './gameState';

describe('createGameState', () => {
  const s = createGameState('vasiyet', 12345, 'player-1', 1000);

  it('başlangıçta $1,000,000 USD', () => {
    expect(s.usdBalance).toEqual({ amount: STARTING_USD, currency: 'USD' });
  });
  it('başlangıçta ₺0 TRY', () => {
    expect(s.tryBalance).toEqual({ amount: 0, currency: 'TRY' });
  });
  it('gün 1, vasiyet 365g', () => {
    expect(s.clock.day).toBe(1);
    expect(s.clock.totalDays).toBe(365);
  });
  it('boş portföy ve mevduat', () => {
    expect(s.deposits).toEqual([]);
    expect(s.holdings).toEqual([]);
  });
  it('kimlik ve zaman alanları', () => {
    expect(s.playerId).toBe('player-1');
    expect(s.scenarioId).toBe('vasiyet');
    expect(s.seed).toBe(12345);
    expect(s.createdAt).toBe(1000);
    expect(s.updatedAt).toBe(1000);
    expect(s.depositSeq).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- gameState`
Expected: FAIL — "Cannot find module './gameState'".

- [ ] **Step 3: Minimal implementation**

`src/lib/stores/gameState.ts`:

```ts
import type { Money } from '../domain/money';
import { usd, tryM } from '../domain/money';
import type { GameMode } from '../domain/types';
import type { GameClock } from '../domain/time/clock';
import { createClock } from '../domain/time/clock';
import type { Deposit } from '../domain/deposit/deposit';

export const STARTING_USD = 1_000_000;
export const INFLATION_TARGET_USD = 1_037_172;

export interface AssetHolding {
  assetId: string;
  units: number;     // pozitif, kesirli olabilir
  avgCost: Money;    // TRY, birim başı ortalama alış
}

export interface GameState {
  playerId: string;
  scenarioId: GameMode;
  seed: number;
  clock: GameClock;
  usdBalance: Money;
  tryBalance: Money;
  deposits: Deposit[];
  holdings: AssetHolding[];
  depositSeq: number;
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
    tryBalance: tryM(0),
    deposits: [],
    holdings: [],
    depositSeq: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// NOT: reducer'lar saf kalsın diye updatedAt'i DEĞİŞTİRMEZ (Date.now() determinizmi
// bozar). updatedAt'i kaydederken store/persistence (Task 6/7) damgalar.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- gameState`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameState.ts src/lib/stores/gameState.test.ts
git commit -m "feat(store): GameState tipi + createGameState (TDD)"
```

---

## Task 3: Döviz çevrimi (convertUsdToTry / convertTryToUsd)

**Files:**
- Modify: `src/lib/stores/gameState.ts`
- Modify: `src/lib/stores/gameState.test.ts`

- [ ] **Step 1: Failing test ekle**

`gameState.test.ts` SONUNA ekle:

```ts
import { convertUsdToTry, convertTryToUsd } from './gameState';
import { usd, tryM } from '../domain/money';
import { createFxEngine } from '../domain/fx/fx';
import { VASIYET_2025 } from '../data/macro2025';

describe('döviz çevrimi', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('USD->TRY: USD düşer, TRY artar, kur gün 1', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const s1 = convertUsdToTry(s0, fx, usd(1000));
    const rate = fx.usdTryForDay(s0.clock.day).amount;
    expect(s1.usdBalance.amount).toBeCloseTo(STARTING_USD - 1000, 2);
    expect(s1.tryBalance.amount).toBeCloseTo(1000 * rate, 2);
  });

  it('TRY->USD: TRY düşer, USD artar', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const withTry = convertUsdToTry(s0, fx, usd(1000));
    const s2 = convertTryToUsd(withTry, fx, tryM(3530));
    expect(s2.tryBalance.amount).toBeCloseTo(withTry.tryBalance.amount - 3530, 2);
    expect(s2.usdBalance.amount).toBeGreaterThan(withTry.usdBalance.amount);
  });

  it('yetersiz USD -> hata', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => convertUsdToTry(s0, fx, usd(2_000_000))).toThrow('Insufficient USD');
  });
  it('yetersiz TRY -> hata', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => convertTryToUsd(s0, fx, tryM(100))).toThrow('Insufficient TRY');
  });
  it('pozitif olmayan miktar -> hata', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => convertUsdToTry(s0, fx, usd(0))).toThrow('positive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- gameState`
Expected: FAIL — `convertUsdToTry is not a function`.

- [ ] **Step 3: Implementation ekle**

`gameState.ts` import satırını genişlet ve fonksiyonları ekle. Import satırı:

```ts
import { usd, tryM, add, subtract, toTRY, toUSD, gte } from '../domain/money';
import type { FxEngine } from '../domain/fx/fx';
```

Dosya sonuna ekle:

```ts
export function convertUsdToTry(state: GameState, fx: FxEngine, usdAmount: Money): GameState {
  if (usdAmount.currency !== 'USD') throw new Error('Amount must be USD');
  if (usdAmount.amount <= 0) throw new Error('Amount must be positive');
  if (!gte(state.usdBalance, usdAmount)) throw new Error('Insufficient USD');
  const rate = fx.usdTryForDay(state.clock.day).amount;
  return {
    ...state,
    usdBalance: subtract(state.usdBalance, usdAmount),
    tryBalance: add(state.tryBalance, toTRY(usdAmount, rate)),
  };
}

export function convertTryToUsd(state: GameState, fx: FxEngine, tryAmount: Money): GameState {
  if (tryAmount.currency !== 'TRY') throw new Error('Amount must be TRY');
  if (tryAmount.amount <= 0) throw new Error('Amount must be positive');
  if (!gte(state.tryBalance, tryAmount)) throw new Error('Insufficient TRY');
  const rate = fx.usdTryForDay(state.clock.day).amount;
  return {
    ...state,
    tryBalance: subtract(state.tryBalance, tryAmount),
    usdBalance: add(state.usdBalance, toUSD(tryAmount, rate)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- gameState`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameState.ts src/lib/stores/gameState.test.ts
git commit -m "feat(store): USD<->TRY döviz çevrimi reducer'ları (TDD)"
```

---

## Task 4: Varlık al/sat (buyAsset / sellAsset)

**Files:**
- Modify: `src/lib/stores/gameState.ts`
- Modify: `src/lib/stores/gameState.test.ts`

- [ ] **Step 1: Failing test ekle**

`gameState.test.ts` SONUNA ekle:

```ts
import { buyAsset, sellAsset } from './gameState';

describe('varlık al/sat', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  function funded() {
    // 100k USD -> TRY ki hisse alabilelim
    return convertUsdToTry(createGameState('vasiyet', 12345, 'p', 0), fx, usd(100_000));
  }

  it('buyAsset: TRY düşer, holding eklenir, avgCost = alış fiyatı', () => {
    const s = funded();
    const price = fx.assetPriceForDay('THYAO', s.clock.day).amount;
    const s2 = buyAsset(s, fx, 'THYAO', 100);
    const h = s2.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(100);
    expect(h.avgCost.amount).toBeCloseTo(price, 2);
    expect(s2.tryBalance.amount).toBeCloseTo(s.tryBalance.amount - price * 100, 2);
  });

  it('buyAsset kesirli units (0.05 BTC)', () => {
    const s = funded();
    const s2 = buyAsset(s, fx, 'BTC', 0.05);
    expect(s2.holdings.find((x) => x.assetId === 'BTC')!.units).toBeCloseTo(0.05, 8);
  });

  it('buyAsset ikinci alış: units toplanır, avgCost ağırlıklı ortalama', () => {
    let s = funded();
    s = buyAsset(s, fx, 'THYAO', 100); // gün 1
    s = buyAsset(s, fx, 'THYAO', 100); // aynı gün, aynı fiyat
    const h = s.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(200);
    const price = fx.assetPriceForDay('THYAO', 1).amount;
    expect(h.avgCost.amount).toBeCloseTo(price, 2);
  });

  it('buyAsset yetersiz TRY -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0); // TRY=0
    expect(() => buyAsset(s, fx, 'THYAO', 1)).toThrow('Insufficient TRY');
  });
  it('buyAsset bilinmeyen varlık -> hata', () => {
    const s = funded();
    expect(() => buyAsset(s, fx, 'YOKBU', 1)).toThrow('Unknown asset');
  });
  it('buyAsset pozitif olmayan units -> hata', () => {
    const s = funded();
    expect(() => buyAsset(s, fx, 'THYAO', 0)).toThrow('positive');
  });

  it('sellAsset: TRY artar, units azalır', () => {
    let s = funded();
    s = buyAsset(s, fx, 'THYAO', 100);
    const before = s.tryBalance.amount;
    const price = fx.assetPriceForDay('THYAO', s.clock.day).amount;
    s = sellAsset(s, fx, 'THYAO', 40);
    expect(s.holdings.find((x) => x.assetId === 'THYAO')!.units).toBe(60);
    expect(s.tryBalance.amount).toBeCloseTo(before + price * 40, 2);
  });
  it('sellAsset tamamı satılınca holding silinir', () => {
    let s = funded();
    s = buyAsset(s, fx, 'THYAO', 100);
    s = sellAsset(s, fx, 'THYAO', 100);
    expect(s.holdings.find((x) => x.assetId === 'THYAO')).toBeUndefined();
  });
  it('sellAsset sahip olunandan fazla -> hata', () => {
    let s = funded();
    s = buyAsset(s, fx, 'THYAO', 10);
    expect(() => sellAsset(s, fx, 'THYAO', 11)).toThrow('Insufficient units');
  });
  it('sellAsset hiç sahip olunmayan -> hata', () => {
    const s = funded();
    expect(() => sellAsset(s, fx, 'THYAO', 1)).toThrow('Insufficient units');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- gameState`
Expected: FAIL — `buyAsset is not a function`.

- [ ] **Step 3: Implementation ekle**

`gameState.ts` import satırına `multiply` ekle:

```ts
import { usd, tryM, add, subtract, multiply, toTRY, toUSD, gte } from '../domain/money';
```

Dosya sonuna ekle:

```ts
export function buyAsset(state: GameState, fx: FxEngine, assetId: string, units: number): GameState {
  if (units <= 0) throw new Error('Units must be positive');
  const price = fx.assetPriceForDay(assetId, state.clock.day); // bilinmeyen -> throw
  const cost = multiply(price, units);
  if (!gte(state.tryBalance, cost)) throw new Error('Insufficient TRY');

  const existing = state.holdings.find((h) => h.assetId === assetId);
  let holdings: AssetHolding[];
  if (existing) {
    const totalUnits = existing.units + units;
    const avg = (existing.avgCost.amount * existing.units + price.amount * units) / totalUnits;
    holdings = state.holdings.map((h) =>
      h.assetId === assetId ? { assetId, units: totalUnits, avgCost: tryM(avg) } : h,
    );
  } else {
    holdings = [...state.holdings, { assetId, units, avgCost: price }];
  }
  return { ...state, tryBalance: subtract(state.tryBalance, cost), holdings };
}

export function sellAsset(state: GameState, fx: FxEngine, assetId: string, units: number): GameState {
  if (units <= 0) throw new Error('Units must be positive');
  const existing = state.holdings.find((h) => h.assetId === assetId);
  if (!existing || existing.units < units) throw new Error('Insufficient units');
  const price = fx.assetPriceForDay(assetId, state.clock.day);
  const proceeds = multiply(price, units);
  const remaining = existing.units - units;
  const holdings =
    remaining > 0
      ? state.holdings.map((h) => (h.assetId === assetId ? { ...h, units: remaining } : h))
      : state.holdings.filter((h) => h.assetId !== assetId);
  return { ...state, tryBalance: add(state.tryBalance, proceeds), holdings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- gameState`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameState.ts src/lib/stores/gameState.test.ts
git commit -m "feat(store): genel varlık al/sat reducer'ları (avgCost, kesirli units, TDD)"
```

---

## Task 5: Mevduat (openDeposit / closeDeposit)

**Files:**
- Modify: `src/lib/stores/gameState.ts`
- Modify: `src/lib/stores/gameState.test.ts`

- [ ] **Step 1: Failing test ekle**

`gameState.test.ts` SONUNA ekle:

```ts
import { openDeposit, closeDeposit } from './gameState';

describe('mevduat', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);
  const RATE = VASIYET_2025.data.depositAnnualRate; // 0.42

  function funded() {
    return convertUsdToTry(createGameState('vasiyet', 12345, 'p', 0), fx, usd(100_000));
  }

  it('openDeposit: TRY düşer, mevduat id ile eklenir, seq artar', () => {
    const s = funded();
    const before = s.tryBalance.amount;
    const s2 = openDeposit(s, tryM(100_000), 90, RATE);
    expect(s2.deposits).toHaveLength(1);
    expect(s2.deposits[0].id).toBe('dep-0');
    expect(s2.deposits[0].annualRate).toBe(RATE);
    expect(s2.depositSeq).toBe(1);
    expect(s2.tryBalance.amount).toBeCloseTo(before - 100_000, 2);
  });

  it('closeDeposit erken (vade dolmadan) -> sadece principal', () => {
    let s = funded();
    s = openDeposit(s, tryM(100_000), 90, RATE); // gün 1 açıldı
    const beforeClose = s.tryBalance.amount;
    s = closeDeposit(s, 'dep-0'); // hâlâ gün 1, vade dolmadı
    expect(s.tryBalance.amount).toBeCloseTo(beforeClose + 100_000, 2);
    expect(s.deposits).toHaveLength(0);
  });

  it('openDeposit yetersiz TRY -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => openDeposit(s, tryM(1000), 30, RATE)).toThrow('Insufficient TRY');
  });
  it('closeDeposit bilinmeyen id -> hata', () => {
    const s = funded();
    expect(() => closeDeposit(s, 'yok')).toThrow('Unknown deposit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- gameState`
Expected: FAIL — `openDeposit is not a function`.

- [ ] **Step 3: Implementation ekle**

`gameState.ts`'e deposit importunu ekle (mevcut deposit fonksiyonlarıyla isim çakışmasını önlemek için alias):

```ts
import {
  openDeposit as createDeposit,
  closeDeposit as settleDeposit,
  isMatured,
} from '../domain/deposit/deposit';
```

Dosya sonuna ekle:

```ts
export function openDeposit(
  state: GameState,
  tryAmount: Money,
  termDays: 30 | 90 | 180,
  annualRate: number,
): GameState {
  // createDeposit currency/pozitiflik validasyonunu yapar; bakiyeyi burada kontrol et
  if (tryAmount.currency === 'TRY' && !gte(state.tryBalance, tryAmount)) {
    throw new Error('Insufficient TRY');
  }
  const id = `dep-${state.depositSeq}`;
  const deposit = createDeposit(id, tryAmount, termDays, state.clock.day, annualRate);
  return {
    ...state,
    tryBalance: subtract(state.tryBalance, tryAmount),
    deposits: [...state.deposits, deposit],
    depositSeq: state.depositSeq + 1,
  };
}

export function closeDeposit(state: GameState, depositId: string): GameState {
  const deposit = state.deposits.find((d) => d.id === depositId);
  if (!deposit) throw new Error(`Unknown deposit: ${depositId}`);
  const payout = settleDeposit(deposit, state.clock.day); // erken=principal, vadeli=+net faiz
  return {
    ...state,
    tryBalance: add(state.tryBalance, payout),
    deposits: state.deposits.filter((d) => d.id !== depositId),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- gameState`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameState.ts src/lib/stores/gameState.test.ts
git commit -m "feat(store): mevduat aç/kapa reducer'ları (deterministik id, TDD)"
```

---

## Task 6: Zaman ilerletme (advanceTime / nextEventDay)

**Files:**
- Modify: `src/lib/stores/gameState.ts`
- Modify: `src/lib/stores/gameState.test.ts`

- [ ] **Step 1: Failing test ekle**

`gameState.test.ts` SONUNA ekle:

```ts
import { advanceTime, nextEventDay } from './gameState';

describe('zaman ilerletme', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);
  const RATE = VASIYET_2025.data.depositAnnualRate;

  function funded() {
    return convertUsdToTry(createGameState('vasiyet', 12345, 'p', 0), fx, usd(100_000));
  }

  it('advanceTime günü ilerletir', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 10);
    expect(s.clock.day).toBe(11); // gün 1 + 10
  });

  it('advanceTime totalDays üstüne çıkmaz', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 999);
    expect(s.clock.day).toBe(365);
  });

  it('advanceTime vadesi dolan mevduatı otomatik nakde çevirir', () => {
    let s = funded();
    s = openDeposit(s, tryM(100_000), 30, RATE); // gün 1 açıldı, vade gün 31
    const beforeTry = s.tryBalance.amount; // mevduat sonrası kalan TRY
    s = advanceTime(s, 35); // gün 36, vade geçti
    expect(s.deposits).toHaveLength(0); // otomatik kapandı
    // principal + net faiz geri geldi (net faiz > 0)
    expect(s.tryBalance.amount).toBeGreaterThan(beforeTry + 100_000);
  });

  it('advanceTime vadesi dolmayan mevduata dokunmaz', () => {
    let s = funded();
    s = openDeposit(s, tryM(100_000), 180, RATE); // vade gün 181
    s = advanceTime(s, 30); // gün 31
    expect(s.deposits).toHaveLength(1);
  });

  it('nextEventDay en yakın mevduat vadesini verir', () => {
    let s = funded();
    s = openDeposit(s, tryM(50_000), 90, RATE);  // vade 91
    s = openDeposit(s, tryM(20_000), 30, RATE);  // vade 31
    expect(nextEventDay(s)).toBe(31);
  });
  it('nextEventDay mevduat yoksa son günü verir', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(nextEventDay(s)).toBe(365);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- gameState`
Expected: FAIL — `advanceTime is not a function`.

- [ ] **Step 3: Implementation ekle**

`gameState.ts` clock importunu genişlet:

```ts
import { createClock, advanceDay, isFinished } from '../domain/time/clock';
```

Dosya sonuna ekle:

```ts
export function advanceTime(state: GameState, step: number): GameState {
  let s = state;
  for (let i = 0; i < step; i++) {
    if (isFinished(s.clock)) break;
    const clock = advanceDay(s.clock);
    const matured = s.deposits.filter((d) => isMatured(d, clock.day));
    if (matured.length === 0) {
      s = { ...s, clock };
    } else {
      let tryBalance = s.tryBalance;
      for (const d of matured) tryBalance = add(tryBalance, settleDeposit(d, clock.day));
      s = {
        ...s,
        clock,
        tryBalance,
        deposits: s.deposits.filter((d) => !isMatured(d, clock.day)),
      };
    }
  }
  return s;
}

export function nextEventDay(state: GameState): number | null {
  const today = state.clock.day;
  const candidates: number[] = [];
  for (const d of state.deposits) {
    const maturity = d.openedDay + d.termDays;
    if (maturity > today) candidates.push(maturity);
  }
  if (state.clock.totalDays > today) candidates.push(state.clock.totalDays);
  return candidates.length === 0 ? null : Math.min(...candidates);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- gameState`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameState.ts src/lib/stores/gameState.test.ts
git commit -m "feat(store): akıllı advanceTime (otomatik mevduat kapanışı) + nextEventDay (TDD)"
```

---

## Task 7: Skor (netWorthUsd / profitRate / beatInflation)

**Files:**
- Modify: `src/lib/stores/gameState.ts`
- Modify: `src/lib/stores/gameState.test.ts`

- [ ] **Step 1: Failing test ekle**

`gameState.test.ts` SONUNA ekle:

```ts
import { netWorthUsd, profitRate, beatInflation, INFLATION_TARGET_USD } from './gameState';

describe('skor', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('gün 1, pozisyonsuz: net servet = $1,000,000', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(netWorthUsd(s, fx).amount).toBeCloseTo(STARTING_USD, 0);
  });
  it('gün 1 pozisyonsuz: profitRate = 1.0', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(profitRate(s, fx)).toBeCloseTo(1.0, 4);
  });
  it('pozisyonsuz nakit enflasyon hedefini geçmez (beatInflation=false)', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(netWorthUsd(s, fx).amount).toBeLessThan(INFLATION_TARGET_USD);
    expect(beatInflation(s, fx)).toBe(false);
  });
  it('USD->TRY->hisse sonrası net servet pozitif ve makul', () => {
    let s = convertUsdToTry(createGameState('vasiyet', 12345, 'p', 0), fx, usd(100_000));
    s = buyAsset(s, fx, 'THYAO', 100);
    const nw = netWorthUsd(s, fx).amount;
    // çevrim+alış aynı gün, komisyon yok -> ~$1M civarı (gürültü payı)
    expect(nw).toBeGreaterThan(950_000);
    expect(nw).toBeLessThan(1_050_000);
  });
  it('beatInflation: net servet >= hedef ise true', () => {
    // yapay: hisseyi gün 1 al, gün 365 değerle (drift net serveti yukarı taşır)
    let s = convertUsdToTry(createGameState('vasiyet', 12345, 'p', 0), fx, usd(900_000));
    s = buyAsset(s, fx, 'ASELS', 1000); // yüksek drift (+%40)
    s = advanceTime(s, 364); // gün 365
    // bu senaryoda net servet hedefi geçmeli (deterministik)
    expect(beatInflation(s, fx)).toBe(netWorthUsd(s, fx).amount >= INFLATION_TARGET_USD);
  });

  it('determinizm: aynı seed + aynı aksiyonlar -> aynı net servet', () => {
    function run() {
      let s = convertUsdToTry(createGameState('vasiyet', 7, 'p', 0), fx2, usd(500_000));
      s = buyAsset(s, fx2, 'BTC', 0.1);
      s = buyAsset(s, fx2, 'THYAO', 200);
      s = advanceTime(s, 100);
      return netWorthUsd(s, fx2).amount;
    }
    const fx2 = createFxEngine(VASIYET_2025, 7);
    expect(run()).toBe(run());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- gameState`
Expected: FAIL — `netWorthUsd is not a function`.

- [ ] **Step 3: Implementation ekle**

`gameState.ts` dosya sonuna ekle:

```ts
export function netWorthUsd(state: GameState, fx: FxEngine): Money {
  const rate = fx.usdTryForDay(state.clock.day).amount;
  let total = state.usdBalance.amount;
  total += toUSD(state.tryBalance, rate).amount;
  for (const d of state.deposits) {
    const valueTry = settleDeposit(d, state.clock.day); // bugün nakde çevrilebilir değer
    total += toUSD(valueTry, rate).amount;
  }
  for (const h of state.holdings) {
    const priceTry = fx.assetPriceForDay(h.assetId, state.clock.day);
    total += toUSD(multiply(priceTry, h.units), rate).amount;
  }
  return usd(total);
}

export function profitRate(state: GameState, fx: FxEngine): number {
  return netWorthUsd(state, fx).amount / STARTING_USD;
}

export function beatInflation(state: GameState, fx: FxEngine): boolean {
  return netWorthUsd(state, fx).amount >= INFLATION_TARGET_USD;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- gameState`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameState.ts src/lib/stores/gameState.test.ts
git commit -m "feat(store): skor — netWorthUsd + profitRate + beatInflation (ayna, TDD)"
```

---

## Task 8: Tam doğrulama

**Files:** yok (sadece doğrulama)

- [ ] **Step 1: Tüm testler**

Run: `npm run test`
Expected: PASS — önceki testler + Task 1 güncellemeleri + gameState (yaklaşık 40+ yeni assertion) yeşil.

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata, 0 uyarı.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: başarılı build.

- [ ] **Step 4: Sonuç notu**

Üçü de geçtiyse Task 5 (Game State) tamamlandı. Sıradaki: Task 5b (Emlak — ayrı brainstorm/spec) veya Task 6 (Persistence) / Task 7 (Reaktif store). Açık veri kalemleri (BIST100 + varlık eğrileri) quant-analyst ile, balance simülasyonu ile birlikte kalibre edilir.

---

## Self-Review Notları

- **Spec kapsamı:** §2 yerleşim → gameState.ts (Task 2-7); §3 genelleştirme + depositAnnualRate → Task 1; §4 state şekli → Task 2; §5 reducer'lar → Task 3 (çevrim), Task 4 (al/sat), Task 5 (mevduat); §6 advanceTime/nextEventDay → Task 6; §7 skor (netWorthUsd/profitRate/beatInflation) → Task 7; §8 varlık evreni → Task 1 (5 yeni varlık; BIST100 = quant, bilinçli ertelendi); §10 emlak forward-compat → kod deseni (advanceTime/nextEventDay/netWorth genişletilebilir, bu planda eklenmez); §12 test planı → her task. **Boşluk yok.**
- **Tip tutarlılığı:** `AssetSeed.{id,category,startPrice,annualDrift,volatility}`, `FxEngine.{usdTryForDay, assetPriceForDay}`, `GameState.{...,holdings,deposits,depositSeq}`, `AssetHolding.{assetId,units,avgCost}`, reducer imzaları (`buyAsset/sellAsset(state,fx,assetId,units)`, `convert*(state,fx,amount)`, `openDeposit(state,tryAmount,termDays,annualRate)`, `closeDeposit(state,id)`, `advanceTime(state,step)`, `nextEventDay(state)`, `netWorthUsd/profitRate/beatInflation(state,fx)`) tüm task'larda tutarlı. Sabitler: `STARTING_USD`, `INFLATION_TARGET_USD`.
- **Placeholder yok:** Veri değerleri "knowledge-cutoff tahmini, quant kalibre eder" olarak işaretli ama somut sayılarla dolu (motor çalışır, testler bütünlük doğrular). TODO/TBD yok.
- **updatedAt notu:** reducer'lar saf kalsın diye değiştirmez; store/persistence damgalar (Task 6/7) — bilinçli karar, Task 2'de belgelendi.
