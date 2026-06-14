# Mevduat Dilimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oyuncuya TL vadeli mevduat ekle — canlı kurla açılır, 32 gün sabit oranla işler, ekranda saniyelik akan bakiye olarak görünür, dolara dönerken lira erozyonunu "dürüst ayna" olarak yansıtır.

**Architecture:** Motor saf-USD kalır; mevduat verisi `GameState.deposit` alanına geri bağlanır (cash↔deposit atomik reducer'lar). Faiz hesabı saf `domain/deposit` modülünde (zaman-damgası tabanlı, lineer net birikim). Net servet store'da mark-to-market eklenir ((Y) kararı). Vitrin saniyelik akar (kart, `nowMs` prop), resmi mühür günlük (snapshot).

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TypeScript (strict) + Vitest.

Spec: `docs/superpowers/specs/2026-06-14-mevduat-dilimi-design.md`

---

## Dosya Haritası

| Dosya | Sorumluluk |
|-------|-----------|
| `src/lib/domain/deposit/deposit.ts` (rework) | Saf mevduat modeli + faiz hesabı (zaman-damgası) |
| `src/lib/domain/deposit/deposit.test.ts` (rework) | Mevduat domain testleri |
| `src/lib/stores/gameState.ts` (modify) | `deposit` alanı + `openDeposit`/`breakDeposit` reducer'ları |
| `src/lib/stores/gameState.test.ts` (modify) | Reducer testleri |
| `src/lib/stores/savegame.ts` (modify) | `reviveEnvelope` deposit Money sarma |
| `src/lib/stores/savegame.test.ts` (modify) | Revive testi |
| `src/lib/domain/snapshot/dailySnapshot.ts` (modify) | `computeAllocation` deposit payı + rozet |
| `src/lib/domain/snapshot/dailySnapshot.test.ts` (modify) | Allocation/rozet testi |
| `src/lib/components/format.ts` (modify) | `countdownLabel` |
| `src/lib/components/format.test.ts` (modify) | countdownLabel testi |
| `src/lib/stores/liveGameStore.svelte.ts` (modify) | Net servet MTM + aksiyonlar + allocation wiring |
| `src/lib/stores/liveGameStore.test.ts` (modify) | Store entegrasyon testi |
| `src/lib/components/DepositCard.svelte` (create) | Mevduat kartı UI |
| `src/routes/+page.svelte` (modify) | Kartı cüzdan altına yerleştir |

> **Not:** Eski `domain/deposit/deposit.ts` hiçbir üretim dosyasında import EDİLMİYOR (sadece kendi testi). Güvenle yeniden yazılır.

---

## Task 1: Mevduat domain modeli (rework)

**Files:**
- Rework: `src/lib/domain/deposit/deposit.ts`
- Rework: `src/lib/domain/deposit/deposit.test.ts`

- [ ] **Step 1: Test dosyasını tamamen yeniden yaz (failing)**

`src/lib/domain/deposit/deposit.test.ts` içeriğini tamamen değiştir:

```ts
import { describe, it, expect } from 'vitest';
import { tryM, usd } from '../money';
import {
  type ActiveDeposit,
  TERM_DAYS,
  DEPOSIT_ANNUAL_RATE,
  WITHHOLDING_TAX,
  elapsedDays,
  isMatured,
  accruedNetInterest,
  currentValueTry,
  maturityNetValueTry,
} from './deposit';

const DAY_MS = 86_400_000;

function make(principal: number, rate = DEPOSIT_ANNUAL_RATE): ActiveDeposit {
  return {
    principalTry: tryM(principal),
    usdAtOpen: usd(principal / 40),
    usdTryAtOpen: 40,
    openedAtMs: 0,
    annualRate: rate,
  };
}

describe('deposit domain (zaman-damgası tabanlı)', () => {
  it('elapsedDays: geçen süreyi gün cinsinden verir, negatif girişi 0 yapar', () => {
    const d = make(1_000_000);
    expect(elapsedDays(d, 16 * DAY_MS)).toBe(16);
    expect(elapsedDays(d, -5 * DAY_MS)).toBe(0);
  });

  it('isMatured: TERM_DAYS dolunca true', () => {
    const d = make(1_000_000);
    expect(isMatured(d, (TERM_DAYS - 1) * DAY_MS)).toBe(false);
    expect(isMatured(d, TERM_DAYS * DAY_MS)).toBe(true);
  });

  it('accruedNetInterest: 0 anında 0', () => {
    expect(accruedNetInterest(make(1_000_000), 0).amount).toBe(0);
  });

  it('accruedNetInterest: yarı yolda lineer + stopaj (16 gün)', () => {
    const gross = 1_000_000 * 0.5 * (16 / 365);
    const expected = Math.round(gross * (1 - WITHHOLDING_TAX) * 100) / 100;
    expect(accruedNetInterest(make(1_000_000), 16 * DAY_MS).amount).toBe(expected);
  });

  it('accruedNetInterest: TERM_DAYS sonrasında tavanlanır (büyümez)', () => {
    const d = make(1_000_000);
    const atTerm = accruedNetInterest(d, TERM_DAYS * DAY_MS).amount;
    const after = accruedNetInterest(d, 100 * DAY_MS).amount;
    expect(after).toBe(atTerm);
  });

  it('currentValueTry: anapara + birikmiş net faiz', () => {
    const d = make(1_000_000);
    const acc = accruedNetInterest(d, 16 * DAY_MS).amount;
    expect(currentValueTry(d, 16 * DAY_MS).amount).toBe(Math.round((1_000_000 + acc) * 100) / 100);
  });

  it('maturityNetValueTry: anapara + tam dönem net faiz = currentValueTry(vade)', () => {
    const d = make(1_000_000);
    expect(maturityNetValueTry(d).amount).toBe(currentValueTry(d, TERM_DAYS * DAY_MS).amount);
  });
});
```

- [ ] **Step 2: Testi çalıştır — fail görmeli**

Run: `npx vitest run src/lib/domain/deposit/deposit.test.ts`
Expected: FAIL (eski export'lar yok / yeni export'lar tanımsız).

- [ ] **Step 3: `deposit.ts`'yi tamamen yeniden yaz**

`src/lib/domain/deposit/deposit.ts` içeriğini tamamen değiştir:

```ts
import type { Money } from '../money';
import { tryM, add } from '../money';

/** Aktif tek mevduat (TL anapara, zaman-damgası tabanlı). */
export interface ActiveDeposit {
  readonly principalTry: Money;   // TL anapara (açılışta USD→TL)
  readonly usdAtOpen: Money;      // açılışta ödenen USD (dürüst-ayna kıyası)
  readonly usdTryAtOpen: number;  // açılış kuru
  readonly openedAtMs: number;    // gerçek zaman damgası
  readonly annualRate: number;
}

export const TERM_DAYS = 32;
export const DEPOSIT_ANNUAL_RATE = 0.5; // quant kalibre edecek
export const WITHHOLDING_TAX = 0.075;

const DAY_MS = 86_400_000;

/** Açılıştan bu yana geçen gün (kesirli); negatif → 0. */
export function elapsedDays(d: ActiveDeposit, nowMs: number): number {
  return Math.max(0, (nowMs - d.openedAtMs) / DAY_MS);
}

export function isMatured(d: ActiveDeposit, nowMs: number): boolean {
  return elapsedDays(d, nowMs) >= TERM_DAYS;
}

/** Lineer birikmiş NET faiz (stopaj sonrası); TERM_DAYS'te tavanlanır. */
export function accruedNetInterest(d: ActiveDeposit, nowMs: number): Money {
  const days = Math.min(elapsedDays(d, nowMs), TERM_DAYS);
  const gross = d.principalTry.amount * d.annualRate * (days / 365);
  return tryM(gross * (1 - WITHHOLDING_TAX));
}

/** Anapara + o ana kadar birikmiş net faiz (vitrin + mark-to-market tabanı). */
export function currentValueTry(d: ActiveDeposit, nowMs: number): Money {
  return add(d.principalTry, accruedNetInterest(d, nowMs));
}

/** Vade dolunca alınacak net değer (anapara + tam dönem net faiz). */
export function maturityNetValueTry(d: ActiveDeposit): Money {
  const gross = d.principalTry.amount * d.annualRate * (TERM_DAYS / 365);
  return add(d.principalTry, tryM(gross * (1 - WITHHOLDING_TAX)));
}
```

- [ ] **Step 4: Testi çalıştır — pass görmeli**

Run: `npx vitest run src/lib/domain/deposit/deposit.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/deposit/deposit.ts src/lib/domain/deposit/deposit.test.ts
git commit -m "feat(deposit): zaman-damgasi tabanli mevduat domain modeli"
```

---

## Task 2: GameState deposit alanı + reducer'lar

**Files:**
- Modify: `src/lib/stores/gameState.ts`
- Modify: `src/lib/stores/gameState.test.ts`

- [ ] **Step 1: Failing test ekle**

`src/lib/stores/gameState.test.ts` SONUNA ekle (üstte importları mevcut import bloğuna kat):

```ts
import { openDeposit, breakDeposit } from './gameState';
import { TERM_DAYS, DEPOSIT_ANNUAL_RATE } from '../domain/deposit/deposit';

describe('mevduat reducer\'ları', () => {
  const DAY_MS = 86_400_000;
  const base = createGameState('vasiyet', 1, 'p1', 0); // usdBalance $1M, deposit null

  it('openDeposit: USD→TL oto-takas, nakit düşer, deposit kurulur', () => {
    const s = openDeposit(base, 40, 10_000, 1000);
    expect(s.usdBalance.amount).toBe(990_000);
    expect(s.deposit?.principalTry.amount).toBe(400_000);
    expect(s.deposit?.usdAtOpen.amount).toBe(10_000);
    expect(s.deposit?.usdTryAtOpen).toBe(40);
    expect(s.deposit?.openedAtMs).toBe(1000);
    expect(s.deposit?.annualRate).toBe(DEPOSIT_ANNUAL_RATE);
  });

  it('openDeposit: yetersiz bakiye / sıfır tutar / aktif mevduat → throw', () => {
    expect(() => openDeposit(base, 40, 2_000_000, 0)).toThrow();
    expect(() => openDeposit(base, 40, 0, 0)).toThrow();
    const withDep = openDeposit(base, 40, 10_000, 0);
    expect(() => openDeposit(withDep, 40, 10_000, 0)).toThrow();
  });

  it('breakDeposit: erken bozma → sadece anapara TL→USD geri', () => {
    const opened = openDeposit(base, 40, 10_000, 0);
    const closed = breakDeposit(opened, 40, DAY_MS); // 1 gün, vade dolmadı
    expect(closed.usdBalance.amount).toBe(1_000_000); // anapara aynen geri
    expect(closed.deposit).toBeNull();
  });

  it('breakDeposit: vade dolunca anapara + net faiz geri', () => {
    const opened = openDeposit(base, 40, 10_000, 0);
    const closed = breakDeposit(opened, 40, TERM_DAYS * DAY_MS);
    expect(closed.usdBalance.amount).toBeGreaterThan(1_000_000); // faiz eklendi
    expect(closed.deposit).toBeNull();
  });
});
```

- [ ] **Step 2: Testi çalıştır — fail görmeli**

Run: `npx vitest run src/lib/stores/gameState.test.ts`
Expected: FAIL ("openDeposit is not a function" / `deposit` alanı yok).

- [ ] **Step 3: `gameState.ts`'yi düzenle**

(a) Import satırını güncelle (satır 1-2 bloğu) — `tryM` ekle:
```ts
import type { Money } from '../domain/money';
import { usd, tryM, add, subtract, multiply, gte } from '../domain/money';
```
(b) Yeni import ekle (satır 6, usdOracle import'undan sonra):
```ts
import type { ActiveDeposit } from '../domain/deposit/deposit';
import { DEPOSIT_ANNUAL_RATE, isMatured, maturityNetValueTry } from '../domain/deposit/deposit';
```
(c) `GameState` interface'ine alan ekle (satır 24, `updatedAt: number;` ÜSTÜNE):
```ts
  deposit: ActiveDeposit | null;
```
(d) `createGameState` dönüşüne ekle (satır 41, `createdAt: now,` ÜSTÜNE):
```ts
    deposit: null,
```
(e) Dosya SONUNA (grewDollars'tan sonra) ekle:
```ts

/** USD nakitten TL vadeli mevduat aç (canlı kurla oto-takas, atomik). */
export function openDeposit(
  state: GameState,
  usdTry: number,
  usdAmount: number,
  nowMs: number,
): GameState {
  if (state.deposit !== null) throw new Error('Deposit already active');
  if (usdAmount <= 0) throw new Error('Amount must be positive');
  if (usdTry <= 0) throw new Error('Invalid FX rate');
  if (usdAmount > state.usdBalance.amount) throw new Error('Insufficient USD');
  const deposit: ActiveDeposit = {
    principalTry: tryM(usdAmount * usdTry),
    usdAtOpen: usd(usdAmount),
    usdTryAtOpen: usdTry,
    openedAtMs: nowMs,
    annualRate: DEPOSIT_ANNUAL_RATE,
  };
  return { ...state, usdBalance: subtract(state.usdBalance, usd(usdAmount)), deposit };
}

/** Mevduatı boz: vade dolduysa anapara+net faiz, erken ise yalnız anapara (faiz 0); TL→USD. */
export function breakDeposit(state: GameState, usdTry: number, nowMs: number): GameState {
  if (state.deposit === null) throw new Error('No active deposit');
  if (usdTry <= 0) throw new Error('Invalid FX rate');
  const payoutTry = isMatured(state.deposit, nowMs)
    ? maturityNetValueTry(state.deposit)
    : state.deposit.principalTry;
  const payoutUsd = usd(payoutTry.amount / usdTry);
  return { ...state, usdBalance: add(state.usdBalance, payoutUsd), deposit: null };
}
```

- [ ] **Step 4: Testi çalıştır — pass görmeli**

Run: `npx vitest run src/lib/stores/gameState.test.ts`
Expected: PASS (mevcut testler + 4 yeni).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameState.ts src/lib/stores/gameState.test.ts
git commit -m "feat(deposit): gameState deposit alani + open/break reducer'lari"
```

---

## Task 3: Persistence — deposit revive

**Files:**
- Modify: `src/lib/stores/savegame.ts`
- Modify: `src/lib/stores/savegame.test.ts`

- [ ] **Step 1: Failing test ekle**

`src/lib/stores/savegame.test.ts` içine, mevcut `describe` bloğuna (veya yeni bir describe) ekle. Üstte `tryM`/`usd` ve `loadGame`/`saveGame` zaten import edilmiş olmalı; değilse ekle:

```ts
it('reviveEnvelope: deposit Money alanlarını yeniden sarar', () => {
  const storage = new Map<string, string>();
  const fake = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  } as unknown as Storage;

  const game = {
    ...createGameState('vasiyet', 1, 'p1', 0),
    deposit: {
      principalTry: { amount: 400_000, currency: 'TRY' as const },
      usdAtOpen: { amount: 10_000, currency: 'USD' as const },
      usdTryAtOpen: 40,
      openedAtMs: 123,
      annualRate: 0.5,
    },
  };
  saveGame(fake, { v: 1, game, activeBist: [] });
  const loaded = loadGame(fake);
  expect(loaded?.game.deposit?.principalTry.currency).toBe('TRY');
  expect(loaded?.game.deposit?.principalTry.amount).toBe(400_000);
  expect(loaded?.game.deposit?.usdAtOpen.currency).toBe('USD');
});

it('loadGame: deposit alanı olmayan eski kayıt → deposit null', () => {
  const storage = new Map<string, string>();
  const fake = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  } as unknown as Storage;
  // deposit alanı OLMAYAN ham kayıt (eski şema)
  const raw = { v: 1, game: { ...createGameState('vasiyet', 1, 'p1', 0), deposit: undefined }, activeBist: [] };
  fake.setItem('miras.save.v1', JSON.stringify(raw));
  expect(loadGame(fake)?.game.deposit ?? null).toBeNull();
});
```

> `createGameState`, `saveGame`, `loadGame` testte import edilmiş olmalı (mevcut testler zaten kullanıyor olabilir; yoksa import et).

- [ ] **Step 2: Testi çalıştır — fail görmeli**

Run: `npx vitest run src/lib/stores/savegame.test.ts`
Expected: FAIL (deposit revive edilmiyor → `principalTry` düz obje, currency korunur ama Money sarma/round garantisi yok; eski kayıt testinde deposit `undefined` kalır → `?? null` zaten null ama revive eklenince netleşir). Eğer ilk test yanlışlıkla geçerse Step 3'ten sonra anlamlı kalır; asıl koruma round/tip garantisi.

- [ ] **Step 3: `reviveEnvelope`'u güncelle**

(a) Import satırına `tryM` ekle (satır 2):
```ts
import { usd, tryM } from '../domain/money';
```
(b) `reviveEnvelope` (satır 37-46) gövdesini değiştir:
```ts
function reviveEnvelope(raw: SaveEnvelopeV1): SaveEnvelopeV1 {
  return {
    ...raw,
    game: {
      ...raw.game,
      usdBalance: usd(raw.game.usdBalance.amount),
      holdings: raw.game.holdings.map((h) => ({ ...h, avgCost: usd(h.avgCost.amount) })),
      deposit: raw.game.deposit
        ? {
            ...raw.game.deposit,
            principalTry: tryM(raw.game.deposit.principalTry.amount),
            usdAtOpen: usd(raw.game.deposit.usdAtOpen.amount),
          }
        : null,
    },
  };
}
```

- [ ] **Step 4: Testi çalıştır — pass görmeli**

Run: `npx vitest run src/lib/stores/savegame.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/savegame.ts src/lib/stores/savegame.test.ts
git commit -m "feat(deposit): savegame deposit revive (Money sarma + eski kayit uyumu)"
```

---

## Task 4: Snapshot allocation + strateji rozeti

**Files:**
- Modify: `src/lib/domain/snapshot/dailySnapshot.ts`
- Modify: `src/lib/domain/snapshot/dailySnapshot.test.ts`

- [ ] **Step 1: Failing test ekle**

`src/lib/domain/snapshot/dailySnapshot.test.ts` içine ekle (importlar mevcut bloğa katılır):

```ts
import { computeAllocation, strategyBadge } from './dailySnapshot';

describe('mevduat allocation + rozet', () => {
  it('computeAllocation: depositUsd payı eklenir', () => {
    // net servet 100: 40 nakit + 60 mevduat
    const a = computeAllocation(40, [], 100, () => 'bist', 60);
    expect(a.deposit).toBeCloseTo(60);
    expect(a.usd).toBeCloseTo(40);
  });

  it('strategyBadge: mevduat ≥%50 → Mevduatçı', () => {
    expect(strategyBadge({ deposit: 60, usd: 40 })).toBe('Mevduatçı');
  });

  it('strategyBadge: nakit ≥%50 → Nakitçi', () => {
    expect(strategyBadge({ usd: 80, bist: 20 })).toBe('Nakitçi');
  });
});
```

- [ ] **Step 2: Testi çalıştır — fail görmeli**

Run: `npx vitest run src/lib/domain/snapshot/dailySnapshot.test.ts`
Expected: FAIL (`depositUsd` parametresi yok / `deposit` rozeti yok / `usd` rozeti hâlâ 'Mevduatçı').

- [ ] **Step 3: `dailySnapshot.ts`'yi düzenle**

(a) `AllocationKey` (satır 6):
```ts
export type AllocationKey = AssetCategory | 'usd' | 'deposit';
```
(b) `computeAllocation` imzası + gövdesi (satır 32-49) — `depositUsd` parametresi ekle:
```ts
export function computeAllocation(
  usdBalance: number,
  holdings: ReadonlyArray<{ assetId: string; valueUsd: number }>,
  netWorthUsd: number,
  categoryOf: (assetId: string) => AssetCategory,
  depositUsd = 0,
): Partial<Record<AllocationKey, number>> {
  if (netWorthUsd <= 0) return {};
  const result: Partial<Record<AllocationKey, number>> = {};
  const add = (key: AllocationKey, valueUsd: number) => {
    result[key] = (result[key] ?? 0) + (valueUsd / netWorthUsd) * 100;
  };
  if (usdBalance > 0) add('usd', usdBalance);
  if (depositUsd > 0) add('deposit', depositUsd);
  for (const h of holdings) {
    if (h.valueUsd <= 0) continue;
    add(categoryOf(h.assetId), h.valueUsd);
  }
  return result;
}
```
(c) `STRATEGY_BADGES` (satır 82-88) — `usd` etiketini düzelt, `deposit` ekle:
```ts
const STRATEGY_BADGES: Record<AllocationKey, string> = {
  crypto: "Kripto'cu",
  bist: 'Borsacı',
  commodity: 'Altıncı',
  fx: 'Dövizci',
  usd: 'Nakitçi',
  deposit: 'Mevduatçı',
};
```
(d) `BADGE_PRIORITY` (satır 91) — `deposit` ekle (fx'ten sonra, usd'den önce):
```ts
const BADGE_PRIORITY: ReadonlyArray<AllocationKey> = ['crypto', 'bist', 'commodity', 'fx', 'deposit', 'usd'];
```

- [ ] **Step 4: Testi çalıştır — pass görmeli**

Run: `npx vitest run src/lib/domain/snapshot/dailySnapshot.test.ts`
Expected: PASS.

> **Not:** `closingCard.ts` `CATEGORY_LABELS`'ı kullanıyor; `deposit` etiketi kapanış kartı barında görünebilir. Bu task'ta gerekli DEĞİL (allocation 'deposit' anahtarı barda etiketsiz kalırsa sorun olmaz) — kapanış kartı mevduat etiketi ayrı/sonraki iş.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/snapshot/dailySnapshot.ts src/lib/domain/snapshot/dailySnapshot.test.ts
git commit -m "feat(deposit): snapshot allocation deposit payi + Mevduatci/Nakitci rozeti"
```

---

## Task 5: `countdownLabel` formatlayıcı

**Files:**
- Modify: `src/lib/components/format.ts`
- Modify: `src/lib/components/format.test.ts`

- [ ] **Step 1: Failing test ekle**

`src/lib/components/format.test.ts` içine ekle (`countdownLabel`'ı import bloğuna kat):

```ts
import { countdownLabel } from './format';

describe('countdownLabel', () => {
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  it('gün kalınca "N gün kaldı"', () => {
    expect(countdownLabel(28 * DAY)).toBe('28 gün kaldı');
    expect(countdownLabel(DAY)).toBe('1 gün kaldı');
  });
  it('1 günden az → saat', () => {
    expect(countdownLabel(5 * HOUR)).toBe('5 sa kaldı');
  });
  it('1 saatten az → dakika', () => {
    expect(countdownLabel(12 * 60_000)).toBe('12 dk kaldı');
  });
  it('süre bitti → "vade doldu"', () => {
    expect(countdownLabel(0)).toBe('vade doldu');
    expect(countdownLabel(-1000)).toBe('vade doldu');
  });
});
```

- [ ] **Step 2: Testi çalıştır — fail görmeli**

Run: `npx vitest run src/lib/components/format.test.ts`
Expected: FAIL ("countdownLabel is not a function").

- [ ] **Step 3: `format.ts`'ye ekle**

`relativeTime` fonksiyonundan sonra (satır 125 civarı) ekle:

```ts
/** Vadeye kalan süre etiketi. <=0 → 'vade doldu'; gün/saat/dakika kademeli. */
export function countdownLabel(msRemaining: number): string {
  if (msRemaining <= 0) return 'vade doldu';
  const totalMin = Math.floor(msRemaining / 60_000);
  const days = Math.floor(totalMin / 1440);
  if (days >= 1) return `${days} gün kaldı`;
  const hours = Math.floor(totalMin / 60);
  if (hours >= 1) return `${hours} sa kaldı`;
  return `${totalMin} dk kaldı`;
}
```

- [ ] **Step 4: Testi çalıştır — pass görmeli**

Run: `npx vitest run src/lib/components/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/format.ts src/lib/components/format.test.ts
git commit -m "feat(deposit): countdownLabel vade geri sayim formatlayicisi"
```

---

## Task 6: Store entegrasyonu (net servet MTM + aksiyonlar + allocation)

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Modify: `src/lib/stores/liveGameStore.test.ts`

- [ ] **Step 1: Failing test ekle**

`src/lib/stores/liveGameStore.test.ts` içine, mevcut `describe` bloğunun SONUNA ekle (setup/flushSync zaten import'lu):

```ts
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
```

- [ ] **Step 2: Testi çalıştır — fail görmeli**

Run: `npx vitest run src/lib/stores/liveGameStore.test.ts`
Expected: FAIL (`store.openDeposit` / `store.deposit` yok).

- [ ] **Step 3: `liveGameStore.svelte.ts`'yi düzenle**

(a) gameState import bloğuna (satır 4-10) `openDeposit`, `breakDeposit` ekle:
```ts
import {
  createGameState,
  buyAsset,
  sellAsset,
  netWorthUsd as netWorthUsdFn,
  openDeposit,
  breakDeposit,
  STARTING_USD,
} from './gameState';
```
(b) deposit domain import ekle (satır 27, snapshot import'undan sonra):
```ts
import { currentValueTry } from '../domain/deposit/deposit';
```
(c) `netWorth` derived'ından (satır 179) HEMEN ÖNCE `depositUsd` derived ekle:
```ts
  // Mevduat USD değeri (mark-to-market): anapara + birikmiş net faiz / canlı kur.
  const depositUsd = $derived(
    game.deposit === null ? 0 : currentValueTry(game.deposit, now()).amount / effectiveUsdTry(),
  );
```
(d) `netWorth` derived gövdesini (satır 179-185) değiştir — mevduatı dahil et:
```ts
  const netWorth = $derived.by<Money | null>(() => {
    try {
      return usd(netWorthUsdFn(game, oracle).amount + depositUsd);
    } catch {
      return game.deposit !== null ? usd(depositUsd) : null;
    }
  });
```
(e) `apply`/`buy`/`sell` tanımlarının yanına (satır 259, `sell` consttan sonra) aksiyonları ekle:
```ts
  const openDepositAction = (usdAmount: number) =>
    apply(() => openDeposit(game, effectiveUsdTry(), usdAmount, now()));
  const breakDepositAction = () => apply(() => breakDeposit(game, effectiveUsdTry(), now()));
```
(f) `recordSnapshot` içindeki `computeAllocation` çağrısına (satır 361-366) `depositUsd` argümanı ekle:
```ts
      allocation: computeAllocation(
        game.usdBalance.amount,
        positions.map((p) => ({ assetId: p.assetId, valueUsd: p.valueUsd ?? 0 })),
        netWorth.amount,
        (id) => CATALOG[id]?.category ?? 'bist',
        depositUsd,
      ),
```
(g) Return objesine (satır 431 civarı, `buy, sell, assetUsdPrice,` yanına) ekle:
```ts
    get deposit() {
      return game.deposit;
    },
    openDeposit: openDepositAction,
    breakDeposit: breakDepositAction,
```

- [ ] **Step 4: Testi çalıştır — pass görmeli**

Run: `npx vitest run src/lib/stores/liveGameStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Tip kontrolü + commit**

Run: `npm run check`
Expected: 0 hata.

```bash
git add src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "feat(deposit): store net servet MTM + open/break aksiyonlari + allocation"
```

---

## Task 7: `DepositCard.svelte` bileşeni

**Files:**
- Create: `src/lib/components/DepositCard.svelte`

> Svelte bileşeni — bu projede node unit testi yok (jsdom kullanılmıyor); doğrulama `npm run check` + `npm run build` + Task 8 manuel smoke ile.

- [ ] **Step 1: Bileşeni oluştur**

`src/lib/components/DepositCard.svelte`:

```svelte
<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd, tryM } from '$lib/domain/money';
	import {
		TERM_DAYS,
		DEPOSIT_ANNUAL_RATE,
		currentValueTry,
		isMatured,
	} from '$lib/domain/deposit/deposit';
	import { displayTry, displayUsd, countdownLabel } from './format';

	interface Props {
		store: LiveGameStore;
		nowMs: number;
	}

	let { store, nowMs }: Props = $props();

	const DAY_MS = 86_400_000;
	const ratePct = Math.round(DEPOSIT_ANNUAL_RATE * 100);

	const chipCls =
		'px-1.5 py-0.5 bg-term-bg border border-term-border text-term-blue text-[10px] ' +
		'hover:border-term-borderGlow hover:text-term-green transition-colors';

	const usdBalance = $derived(store.game.usdBalance.amount);
	const usdTry = $derived(store.usdTry);

	// ── Açma formu ───────────────────────────────────────────────────────────
	let amount = $state(0);
	function maxAmount() {
		amount = usdBalance;
	}
	function handleOpen() {
		if (amount <= 0) return;
		store.openDeposit(amount);
		amount = 0;
	}

	// ── Aktif mevduat (saniyelik: nowMs prop'una bağlı) ────────────────────────
	const dep = $derived(store.deposit);
	const valueTry = $derived(dep ? currentValueTry(dep, nowMs) : null);
	const valueUsd = $derived(dep && usdTry > 0 ? usd(valueTry!.amount / usdTry) : null);
	const matured = $derived(dep ? isMatured(dep, nowMs) : false);
	const msRemaining = $derived(dep ? dep.openedAtMs + TERM_DAYS * DAY_MS - nowMs : 0);

	function handleBreak() {
		if (!dep) return;
		if (!matured) {
			const ok = confirm(
				'Erken bozarsan faizden vazgeçersin, sadece anaparayı alırsın. Bozulsun mu?',
			);
			if (!ok) return;
		}
		store.breakDeposit();
	}
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-3">
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		MEVDUAT
	</div>

	{#if dep === null}
		<!-- Kapalı: açma formu -->
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<label for="dep-amount" class="text-term-text opacity-50 shrink-0 w-16">Tutar $</label>
				<input
					type="number"
					min="0"
					id="dep-amount"
					step="1000"
					bind:value={amount}
					class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
					       focus:outline-none focus:border-term-borderGlow text-xs w-full"
				/>
				<button type="button" onclick={maxAmount} class="shrink-0 {chipCls}">HEPSİ</button>
			</div>
			<div class="flex justify-between text-[10px] text-term-text opacity-50">
				<span>{TERM_DAYS} gün · faiz %{ratePct}/yıl</span>
				<span>≈ {displayTry(usdTry > 0 ? amount * usdTry : undefined)} yatırılacak</span>
			</div>
			<button
				type="button"
				onclick={handleOpen}
				class="w-full py-1.5 bg-term-bg border border-term-green text-term-green font-bold
				       hover:bg-term-panelLight glow-border-green transition-colors"
			>
				MEVDUAT AÇ
			</button>
		</div>
	{:else}
		<!-- Açık: aktif mevduat -->
		<div class="space-y-1.5">
			<div class="flex justify-between items-center">
				<span class="text-term-text opacity-70">{matured ? 'VADE DOLDU' : 'kilitli'}</span>
				<span class="text-term-green glow-text-green font-bold">{displayTry(valueTry?.amount)}</span>
			</div>
			<div class="flex justify-between items-center text-[10px]">
				<span class="text-term-text opacity-50">
					≈ {displayUsd(valueUsd)} (yatırdığın: {displayUsd(dep.usdAtOpen)})
				</span>
				<span class="text-term-blue">{matured ? 'faiz işledi' : countdownLabel(msRemaining)}</span>
			</div>
			<div class="flex justify-between items-center pt-1">
				<span class="text-term-text opacity-50 text-[10px]">faiz %{ratePct}/yıl</span>
				<button
					type="button"
					onclick={handleBreak}
					class="px-3 py-1 bg-term-bg border {matured ? 'border-term-green text-term-green' : 'border-term-red text-term-red'}
					       font-bold hover:bg-term-panelLight transition-colors"
				>
					{matured ? 'TOPLA' : 'BOZ'}
				</button>
			</div>
		</div>
	{/if}
</div>
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata (kullanılmayan import yok; `valueTry!` non-null assertion `dep` guard'ı altında).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/DepositCard.svelte
git commit -m "feat(deposit): DepositCard bileseni — acma formu + canli akan aktif kart"
```

---

## Task 8: +page.svelte wiring + final doğrulama

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Import ekle**

`src/routes/+page.svelte` script bloğunda, `WalletSummary` import'unun (satır 21) yanına ekle:
```ts
	import DepositCard from '$lib/components/DepositCard.svelte';
```

- [ ] **Step 2: Kartı cüzdan altına yerleştir**

`<WalletSummary ... />` bloğu (satır 252-256) ile `<DailyBreakdown rows={breakdown} />` (satır 258) ARASINA ekle:
```svelte
						<DepositCard {store} nowMs={nowMs} />
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 4: Tüm test paketi**

Run: `npm run test`
Expected: PASS (önceki 328 + bu dilimde eklenen testler; başarısız 0).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: Vite derlemesi başarılı.
> ⚠️ Windows'ta adapter-vercel symlink adımında EPERM verebilir (Developer Mode kapalı) — Vite derlemesi geçtiyse kabul (Vercel Linux etkilenmez; proje hafızasında bilinen kabul).

- [ ] **Step 6: Manuel smoke (dev)**

Run: `npm.cmd run dev` (PowerShell execution-policy nedeniyle `.cmd`)
Kontrol et: cüzdan altında MEVDUAT kartı görünür → tutar gir + MEVDUAT AÇ → nakit düşer, kart aktif duruma geçer + değer saniyelik akar + geri sayım görünür → BOZ → onay → nakit geri gelir.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(deposit): mevduat kartini cuzdan altina yerlestir"
```

---

## Self-Review Notları (yazım sonrası)
- **Spec kapsamı:** TL mevduat ✓(T1-2) · oto-takas açma/bozma ✓(T2) · hibrit gösterim (vitrin saniyelik=DepositCard nowMs, mühür günlük=snapshot) ✓(T6-7) · 32 gün tek oran ✓(T1) · erken bozma faiz 0 ✓(T2) · tek aktif mevduat (guard) ✓(T2) · cüzdan altı kart ✓(T7-8) · (Y) mark-to-market net servet ✓(T6, domain T1) · persistence ✓(T3) · allocation+rozet ✓(T4).
- **Tip tutarlılığı:** `ActiveDeposit` alan adları T1/T2/T3/T6/T7'de birebir aynı (`principalTry`/`usdAtOpen`/`usdTryAtOpen`/`openedAtMs`/`annualRate`). `openDeposit(state,usdTry,usdAmount,nowMs)` imzası T2 tanımı = T6 çağrısı. `computeAllocation(...,depositUsd)` T4 tanımı = T6 çağrısı.
- **Bilinen sınır:** net servet mevduat birikimini poll'da (~20s) tazeler; saniyelik şimşek karttadır (hibrit karar gereği, kabul).
