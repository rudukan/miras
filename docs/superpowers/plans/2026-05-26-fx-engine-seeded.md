# Seeded FX Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VASİYET modu için deterministik, seeded, gizli-gelecek FX motoru (USD/TRY + 9 BIST hissesi) ve onu besleyen senaryo-güdümlü 2025 veri katmanı.

**Architecture:** Saf TS domain modülleri. Deterministik hash-tabanlı gürültü (`noise.ts`) + senaryo sözleşmesi (`scenario/types.ts`) + statik 2025 verisi (`data/macro2025.ts`) + factory pattern FX motoru (`fx/fx.ts`). Hiç state yok, akümülatif rastgelelik yok — `(scenario, seed, day)` → her zaman aynı fiyat. UI/store/API bağımlılığı yok; sadece `money.ts` + kendi tiplerine bağlı (CLAUDE.md kuralı).

**Tech Stack:** TypeScript (strict), Vitest. Para için `src/lib/domain/money.ts` (`Money`, `tryM`, `toNumber`).

**Spec:** `docs/superpowers/specs/2026-05-26-vasiyet-oynanis-tasarimi.md`

**Kapsam dışı (sonraki sprint):** CANLI canlı API, 2001/2018 arşiv verisi, oyun döngüsü/store, tam 1000x balance simülasyonu (oyun döngüsü gerektirir — bu planda yalnızca odaklı istatistiksel özellik testleri var).

---

## Dosya Yapısı

| Dosya | Sorumluluk | Bağımlılık |
|-------|-----------|-----------|
| `CLAUDE.md` (mod.) | Kanon 2024→2025 | — |
| `src/lib/domain/fx/noise.ts` (yeni) | Deterministik pseudo-random + string seed | — |
| `src/lib/domain/fx/noise.test.ts` (yeni) | noise testleri | noise.ts |
| `src/lib/domain/scenario/types.ts` (yeni) | Senaryo sözleşmesi (Scenario, ScenarioData, StockSeed) | `../types` (GameMode) |
| `src/lib/data/macro2025.ts` (yeni) | Statik 2025 verisi (`VASIYET_2025`) | scenario/types |
| `src/lib/data/macro2025.test.ts` (yeni) | Veri bütünlüğü testleri | macro2025.ts |
| `src/lib/domain/fx/fx.ts` (yeni) | `createFxEngine`, `interpolateAnchors` | money, scenario/types, noise |
| `src/lib/domain/fx/fx.test.ts` (yeni) | FX motoru testleri | fx.ts, macro2025 |

---

## Task 1: Kanon güncellemesi (2024 → 2025)

**Files:**
- Modify: `CLAUDE.md` (4 satır)

- [ ] **Step 1: Başlık satırını güncelle**

`CLAUDE.md` satır 3'te bul ve değiştir:

```
Türkiye'nin 2024 makro koşullarında 1M USD mirası 365 günde işletme finansal simülasyonu.
```
→
```
Türkiye'nin 2025 makro koşullarında 1M USD mirası 365 günde işletme finansal simülasyonu.
```

- [ ] **Step 2: Dizin haritasındaki dosya adını güncelle**

Satır 17'de bul ve değiştir:

```
src/lib/data/      — Statik makro veri (macro2024.ts)
```
→
```
src/lib/data/      — Statik makro veri (macro2025.ts)
```

- [ ] **Step 3: Ekonomi kanonu eğrisini güncelle**

Satır 50'de bul ve değiştir:

```
- USD/TRY 2024 eğrisi: ₺29.90 → ₺35.30
```
→
```
- USD/TRY 2025 eğrisi: ₺35.30 → ₺42.50 (başlangıç değerleri — quant doğrulayacak)
```

- [ ] **Step 4: Mod tablosundaki yıl etiketini güncelle**

Satır 64'te bul ve değiştir:

```
| VASİYET SEFERİ | 365 gün | Orta (2024 gerçek verileri) |
```
→
```
| VASİYET SEFERİ | 365 gün | Orta (2025 gerçek verileri) |
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: kanon 2024 → 2025 (VASİYET senaryo yılı)"
```

---

## Task 2: Deterministik gürültü yardımcısı

**Files:**
- Create: `src/lib/domain/fx/noise.ts`
- Test: `src/lib/domain/fx/noise.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/domain/fx/noise.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pseudoRandom, signedNoise, stringSeed } from './noise';

describe('pseudoRandom', () => {
  it('is deterministic: same (seed, day) -> same value', () => {
    expect(pseudoRandom(42, 100)).toBe(pseudoRandom(42, 100));
  });
  it('returns a value in [0, 1)', () => {
    for (let day = 0; day < 500; day++) {
      const v = pseudoRandom(7, day);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('differs across days (not constant)', () => {
    const values = new Set([0, 1, 2, 3, 4].map((d) => pseudoRandom(7, d)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('signedNoise', () => {
  it('is deterministic', () => {
    expect(signedNoise(42, 100)).toBe(signedNoise(42, 100));
  });
  it('returns a value in [-1, 1)', () => {
    for (let day = 0; day < 500; day++) {
      const v = signedNoise(7, day);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });
  it('salt produces an independent series', () => {
    // Aynı gün, farklı salt -> (neredeyse her zaman) farklı değer
    expect(signedNoise(7, 50, 0)).not.toBe(signedNoise(7, 50, 12345));
  });
});

describe('stringSeed', () => {
  it('is deterministic', () => {
    expect(stringSeed('THYAO')).toBe(stringSeed('THYAO'));
  });
  it('differs for different strings', () => {
    expect(stringSeed('THYAO')).not.toBe(stringSeed('EREGL'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- noise`
Expected: FAIL — "Cannot find module './noise'" / fonksiyonlar tanımsız.

- [ ] **Step 3: Write minimal implementation**

`src/lib/domain/fx/noise.ts`:

```ts
/**
 * Deterministik pseudo-random: aynı (seed, day) -> aynı sonuç.
 * Akümülatif DEĞİL — her gün bağımsız hesaplanır (random walk yok).
 * Tam sayı seed beklenir.
 * @returns [0, 1) aralığında değer
 */
export function pseudoRandom(seed: number, day: number): number {
  let h = (Math.imul(seed, 374761393) + Math.imul(day, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * İşaretli gürültü: [-1, 1) aralığında, deterministik.
 * @param salt farklı seriler (örn. her hisse) için ofset; varsayılan 0
 */
export function signedNoise(seed: number, day: number, salt = 0): number {
  return pseudoRandom(seed + salt, day) * 2 - 1;
}

/** String'i deterministik tam-sayı seed'e çevirir (ticker -> salt). FNV-1a. */
export function stringSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- noise`
Expected: PASS (tüm noise testleri yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/fx/noise.ts src/lib/domain/fx/noise.test.ts
git commit -m "feat(domain): deterministik FX gürültü yardımcısı (noise) — TDD"
```

---

## Task 3: Senaryo tipleri

**Files:**
- Create: `src/lib/domain/scenario/types.ts`

Pure tip dosyası — runtime davranışı yok; `npm run check` (svelte-check) ile doğrulanır.

- [ ] **Step 1: Tipleri yaz**

`src/lib/domain/scenario/types.ts`:

```ts
import type { GameMode } from '../types';

export interface StockSeed {
  readonly ticker: string;
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
  readonly usdTryVolatility: number; // günlük gürültü genliği (2025: 0.003 = ±%0.3)
  readonly stocks: ReadonlyArray<StockSeed>;
  readonly dailyInflation: number;   // USD %0.01/gün hedefiyle uyumlu
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

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata (yeni tip dosyası temiz derlenir).

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain/scenario/types.ts
git commit -m "feat(domain): senaryo sözleşmesi tipleri (Scenario, ScenarioData)"
```

---

## Task 4: 2025 makro verisi + bütünlük testi

**Files:**
- Create: `src/lib/data/macro2025.ts`
- Test: `src/lib/data/macro2025.test.ts`

> **NOT:** Aşağıdaki sayısal değerler başlangıç tahminleridir (knowledge-cutoff tabanlı). quant-analyst doğrulayıp ince ayar yapacak (spec §13). Motor herhangi bir değerle çalışır; testler *bütünlük* (sıralı çapa, 9 hisse, pozitif fiyat) doğrular, kesin sayıyı değil.

- [ ] **Step 1: Write the failing test**

`src/lib/data/macro2025.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { VASIYET_2025 } from './macro2025';

const REQUIRED_TICKERS = [
  'THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'SASA', 'YKBNK', 'BIMAS',
];

describe('VASIYET_2025 senaryosu', () => {
  it('temel senaryo alanları doğru', () => {
    expect(VASIYET_2025.id).toBe('vasiyet');
    expect(VASIYET_2025.year).toBe(2025);
    expect(VASIYET_2025.totalDays).toBe(365);
    expect(VASIYET_2025.fxSource).toBe('seeded');
    expect(VASIYET_2025.timeMode).toBe('turn');
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
  it('tüm kurlar pozitif', () => {
    for (const a of anchors) expect(a.rate).toBeGreaterThan(0);
  });
  it('yıl içinde yukarı trend (son > ilk)', () => {
    expect(anchors[anchors.length - 1].rate).toBeGreaterThan(anchors[0].rate);
  });
  it('gürültü genliği küçük (0, 0.01)', () => {
    expect(VASIYET_2025.data.usdTryVolatility).toBeGreaterThan(0);
    expect(VASIYET_2025.data.usdTryVolatility).toBeLessThan(0.01);
  });
});

describe('BIST hisseleri', () => {
  const stocks = VASIYET_2025.data.stocks;
  it('tam 9 hisse var', () => {
    expect(stocks).toHaveLength(9);
  });
  it('9 kanonik ticker da mevcut', () => {
    const tickers = stocks.map((s) => s.ticker);
    for (const t of REQUIRED_TICKERS) expect(tickers).toContain(t);
  });
  it('tüm başlangıç fiyatları pozitif', () => {
    for (const s of stocks) expect(s.startPrice).toBeGreaterThan(0);
  });
  it('tüm volatiliteler (0, 0.1) aralığında', () => {
    for (const s of stocks) {
      expect(s.volatility).toBeGreaterThan(0);
      expect(s.volatility).toBeLessThan(0.1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- macro2025`
Expected: FAIL — "Cannot find module './macro2025'".

- [ ] **Step 3: Write the data**

`src/lib/data/macro2025.ts`:

```ts
import type { Scenario } from '../domain/scenario/types';

// 2025 USD/TRY aylık çapa noktaları (≈30 günlük adım).
// Başlangıç tahminleri — quant-analyst doğrulayıp ince ayar yapacak.
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

// Başlangıç fiyatları (TRY) ve yıllık yön — quant doğrulayacak.
const BIST_STOCKS_2025 = [
  { ticker: 'THYAO', startPrice: 300, annualDrift: 0.25, volatility: 0.020 },
  { ticker: 'EREGL', startPrice: 28, annualDrift: 0.10, volatility: 0.020 },
  { ticker: 'ASELS', startPrice: 65, annualDrift: 0.40, volatility: 0.025 },
  { ticker: 'GUBRF', startPrice: 180, annualDrift: 0.15, volatility: 0.030 },
  { ticker: 'KCHOL', startPrice: 180, annualDrift: 0.20, volatility: 0.020 },
  { ticker: 'TUPRS', startPrice: 150, annualDrift: 0.18, volatility: 0.020 },
  { ticker: 'SASA', startPrice: 3.5, annualDrift: 0.05, volatility: 0.030 },
  { ticker: 'YKBNK', startPrice: 30, annualDrift: 0.30, volatility: 0.025 },
  { ticker: 'BIMAS', startPrice: 500, annualDrift: 0.22, volatility: 0.015 },
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
    stocks: BIST_STOCKS_2025,
    dailyInflation: 0.0001,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- macro2025`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/macro2025.ts src/lib/data/macro2025.test.ts
git commit -m "feat(data): 2025 makro verisi (VASIYET_2025) + bütünlük testleri"
```

---

## Task 5: FX motoru — interpolasyon + usdTryForDay

**Files:**
- Create: `src/lib/domain/fx/fx.ts`
- Test: `src/lib/domain/fx/fx.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/domain/fx/fx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createFxEngine, interpolateAnchors } from './fx';
import { VASIYET_2025 } from '../../data/macro2025';

const ANCHORS = [
  { day: 0, rate: 35.30 },
  { day: 30, rate: 36.00 },
  { day: 365, rate: 42.50 },
];

describe('interpolateAnchors', () => {
  it('ilk çapada başlangıç kuru', () => {
    expect(interpolateAnchors(ANCHORS, 0)).toBe(35.30);
  });
  it('son çapada bitiş kuru', () => {
    expect(interpolateAnchors(ANCHORS, 365)).toBe(42.50);
  });
  it('ara çapada tam değer', () => {
    expect(interpolateAnchors(ANCHORS, 30)).toBe(36.00);
  });
  it('çapalar arası lineer interpolasyon', () => {
    // gün 15: 35.30 + (36.00-35.30)*0.5 = 35.65
    expect(interpolateAnchors(ANCHORS, 15)).toBeCloseTo(35.65, 5);
  });
  it('aralık öncesi -> ilk kura sabitlenir', () => {
    expect(interpolateAnchors(ANCHORS, -10)).toBe(35.30);
  });
  it('aralık sonrası -> son kura sabitlenir', () => {
    expect(interpolateAnchors(ANCHORS, 999)).toBe(42.50);
  });
});

describe('createFxEngine.usdTryForDay', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('deterministik: aynı seed+gün -> aynı sonuç', () => {
    expect(fx.usdTryForDay(100).amount).toBe(fx.usdTryForDay(100).amount);
  });
  it('farklı seed -> (genelde) farklı sonuç', () => {
    const a = createFxEngine(VASIYET_2025, 1).usdTryForDay(100).amount;
    const b = createFxEngine(VASIYET_2025, 2).usdTryForDay(100).amount;
    expect(a).not.toBe(b);
  });
  it('TRY cinsinden döner', () => {
    expect(fx.usdTryForDay(50).currency).toBe('TRY');
  });
  it('gün 0 başlangıç kurunun ±%0.3 bandında', () => {
    // ±0.01 tolerans tryM'in 2 ondalık yuvarlamasını karşılar
    const r = fx.usdTryForDay(0).amount;
    expect(r).toBeGreaterThanOrEqual(35.30 * 0.997 - 0.01);
    expect(r).toBeLessThanOrEqual(35.30 * 1.003 + 0.01);
  });
  it('gürültü trendi bastırmaz: gün 365 > gün 0 (her seed)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const e = createFxEngine(VASIYET_2025, seed);
      expect(e.usdTryForDay(365).amount).toBeGreaterThan(e.usdTryForDay(0).amount);
    }
  });
  it('günlük sapma çapa bandında kalır (±%0.3)', () => {
    for (let day = 0; day <= 365; day++) {
      const base = interpolateAnchors(VASIYET_2025.data.usdTryAnchors, day);
      const r = fx.usdTryForDay(day).amount;
      expect(r).toBeGreaterThanOrEqual(base * 0.997 - 0.01);
      expect(r).toBeLessThanOrEqual(base * 1.003 + 0.01);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- fx`
Expected: FAIL — "Cannot find module './fx'".

- [ ] **Step 3: Write minimal implementation**

`src/lib/domain/fx/fx.ts`:

```ts
import type { Money } from '../money';
import { tryM } from '../money';
import type { Scenario, UsdTryAnchor } from '../scenario/types';
import { signedNoise } from './noise';

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
}

export function createFxEngine(scenario: Scenario, seed: number): FxEngine {
  const { usdTryAnchors, usdTryVolatility } = scenario.data;

  function usdTryForDay(day: number): Money {
    const base = interpolateAnchors(usdTryAnchors, day);
    const rate = base * (1 + usdTryVolatility * signedNoise(seed, day));
    return tryM(rate);
  }

  return { usdTryForDay };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- fx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/fx/fx.ts src/lib/domain/fx/fx.test.ts
git commit -m "feat(domain): FX motoru — usdTryForDay + interpolasyon (TDD)"
```

---

## Task 6: FX motoru — stockPriceForDay

**Files:**
- Modify: `src/lib/domain/fx/fx.ts` (FxEngine arayüzü + createFxEngine'e stockPriceForDay ekle)
- Modify: `src/lib/domain/fx/fx.test.ts` (yeni describe bloğu ekle)

- [ ] **Step 1: Write the failing test**

`src/lib/domain/fx/fx.test.ts` dosyasının SONUNA ekle:

```ts
describe('createFxEngine.stockPriceForDay', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('deterministik: aynı seed+ticker+gün -> aynı sonuç', () => {
    expect(fx.stockPriceForDay('THYAO', 100).amount)
      .toBe(fx.stockPriceForDay('THYAO', 100).amount);
  });
  it('TRY cinsinden döner', () => {
    expect(fx.stockPriceForDay('THYAO', 10).currency).toBe('TRY');
  });
  it('gün 0 başlangıç fiyatının ±%2 bandında (THYAO=300)', () => {
    const p = fx.stockPriceForDay('THYAO', 0).amount;
    expect(p).toBeGreaterThanOrEqual(300 * 0.98);
    expect(p).toBeLessThanOrEqual(300 * 1.02);
  });
  it('yıl sonu drift uygulanır (THYAO +%25 -> ~375, > başlangıç)', () => {
    const p = fx.stockPriceForDay('THYAO', 365).amount;
    expect(p).toBeGreaterThan(360); // 375 * 0.98 = 367.5, başlangıç 300'ün üstünde
    expect(p).toBeLessThan(390);    // 375 * 1.02 = 382.5
  });
  it('bilinmeyen ticker hata fırlatır', () => {
    expect(() => fx.stockPriceForDay('YOKBU', 10)).toThrow('Unknown ticker: YOKBU');
  });
  it('farklı günler farklı fiyat verir (gürültü canlı)', () => {
    expect(fx.stockPriceForDay('THYAO', 5).amount)
      .not.toBe(fx.stockPriceForDay('THYAO', 6).amount);
  });
  it('hisseler bağımsız seri: aynı gün THYAO ve EREGL bağımsız sapar', () => {
    // Başlangıç fiyatları farklı zaten; sapma oranlarının da bağımlı olmadığını
    // doğrulamak için iki farklı hissenin aynı günde eşit olmadığını kontrol et.
    expect(fx.stockPriceForDay('THYAO', 7).amount)
      .not.toBe(fx.stockPriceForDay('EREGL', 7).amount);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- fx`
Expected: FAIL — `fx.stockPriceForDay is not a function`.

- [ ] **Step 3: Write the implementation**

`src/lib/domain/fx/fx.ts`'i güncelle. Importları değiştir:

```ts
import type { Scenario, UsdTryAnchor, StockSeed } from '../scenario/types';
import { signedNoise, stringSeed } from './noise';
```

`FxEngine` arayüzüne ekle:

```ts
export interface FxEngine {
  usdTryForDay(day: number): Money;
  stockPriceForDay(ticker: string, day: number): Money;
}
```

`createFxEngine` gövdesini güncelle (stockMap + fonksiyon + return):

```ts
export function createFxEngine(scenario: Scenario, seed: number): FxEngine {
  const { usdTryAnchors, usdTryVolatility, stocks } = scenario.data;
  const stockMap = new Map<string, StockSeed>(stocks.map((s) => [s.ticker, s]));

  function usdTryForDay(day: number): Money {
    const base = interpolateAnchors(usdTryAnchors, day);
    const rate = base * (1 + usdTryVolatility * signedNoise(seed, day));
    return tryM(rate);
  }

  function stockPriceForDay(ticker: string, day: number): Money {
    const stock = stockMap.get(ticker);
    if (!stock) throw new Error(`Unknown ticker: ${ticker}`);
    const trend = stock.startPrice * (1 + stock.annualDrift * (day / scenario.totalDays));
    const price = trend * (1 + stock.volatility * signedNoise(seed, day, stringSeed(ticker)));
    return tryM(price);
  }

  return { usdTryForDay, stockPriceForDay };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- fx`
Expected: PASS (usdTryForDay + stockPriceForDay tüm testleri).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/fx/fx.ts src/lib/domain/fx/fx.test.ts
git commit -m "feat(domain): FX motoru — stockPriceForDay (drift + per-ticker gürültü, TDD)"
```

---

## Task 7: Tam doğrulama

**Files:** yok (sadece doğrulama)

- [ ] **Step 1: Tüm testler**

Run: `npm run test`
Expected: PASS — önceki 53 test + noise (8) + macro2025 (10) + fx (19) yeşil.

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata, 0 uyarı.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: başarılı build.

- [ ] **Step 4: Sonuç notu**

Üç komut da geçtiyse Task 3 (FX Engine) tamamlandı. Açık kalan veri kalibrasyonu (spec §13) sonraki adımda quant-analyst ile yapılır; motor ve testler hazır.

---

## Self-Review Notları

- **Spec kapsamı:** §3 (senaryo-güdümlü tipler) → Task 3; §4 (deterministik gizli-gelecek dünya) → Task 2+5+6; §8 (FX engine, macro2025) → Task 4+5+6; §10 (kanon 2024→2025) → Task 1; §11 (determinizm/trend/noise testleri) → Task 5+6. Gizli-gelecek (`day ≤ buGün`) çağrı disiplini store/UI'da uygulanır (bu plan dışı, spec §4 ile uyumlu).
- **Ertelenen (spec §12):** CANLI canlı API, 2001/2018 verisi, oyun döngüsü, tam 1000x balance sim. Plan bunları kapsamaz — bilinçli.
- **Tip tutarlılığı:** `signedNoise(seed, day, salt?)`, `stringSeed`, `interpolateAnchors(anchors, day)`, `createFxEngine(scenario, seed)`, `FxEngine.{usdTryForDay, stockPriceForDay}`, `ScenarioData.{usdTryAnchors, usdTryVolatility, stocks, dailyInflation}` — tüm task'larda tutarlı.
