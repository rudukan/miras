# Canlı Çekirdek — Plan 1: Domain & Veri Katmanı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlı "şu an" oynanışının saf, deterministik temelini kur — TR piyasa-seansı takvimi (`calendar.ts`) + mevcut motoru canlı fiyatla besleyen ikinci `FxEngine` implementasyonu (`liveFx.ts`) — hiçbir mevcut dosyaya/teste dokunmadan.

**Architecture:** Spec §2'deki tek seam = `FxEngine` (`fx.ts:26`). Bu plan o arayüzü canlı fiyatla dolduran `createLiveFxEngine(source)`'u ve UI'nın "seans kapalı" davranışı için saf `calendar.ts`'i ekler. `gameState.ts` ve mevcut 129 test **bir satır değişmez** (spec §3). Çıktı: saf domain, dış bağımlılık yok, %100 unit-test'lenebilir. API çekimi (Plan 2) ve reaktif store/UI (Plan 3) bu temelin üstüne gelir.

**Tech Stack:** TypeScript (strict), Vitest, `Intl.DateTimeFormat` (Europe/Istanbul tz, deterministik). UI/Svelte YOK.

---

## Bağlam & Sınırlar (uygulayıcı için)

- **Otoriter spec:** `docs/superpowers/specs/2026-05-29-canli-cekirdek-design.md`. Bu plan onun §2 (seam), §5 (takvim), §11 (test) ve §3 (motor değişmez) bölümlerini hayata geçirir.
- **DOKUNMA:** `src/lib/stores/gameState.ts`, `src/lib/domain/fx/fx.ts`, `src/lib/data/macro2025.ts` ve hiçbir mevcut `*.test.ts`. Bu plan yalnızca **yeni dosya** ekler.
- **CLAUDE.md sınırları:** Her `domain/<sistem>/` yalnızca `money.ts` + kendi type'larına bağlı. Para = `Money` (asla çıplak `number` döndürme — `tryM()` kullan). Identifier İngilizce, yorum/UI Türkçe.
- **Mevcut tip sözleşmeleri (değişmez):**
  - `FxEngine` (`src/lib/domain/fx/fx.ts:26`): `usdTryForDay(day:number):Money` + `assetPriceForDay(assetId:string,day:number):Money`.
  - `AssetCategory` (`src/lib/domain/scenario/types.ts:3`): `'bist' | 'crypto' | 'commodity' | 'fx'`.
  - `Money` (`src/lib/domain/money.ts`): `{ amount:number; currency:'USD'|'TRY' }`, `tryM(n)` ile üret.
- **Commit kuralı:** Conventional commits + Türkçe (repo deseni: `feat(fx): ...`). Harness kuralı gereği her commit mesajı `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` ile biter. Kullanıcı toplu commit'i ("s") tercih ederse task-başı commit'ler birleştirilebilir.
- **Test ortamı:** `vite.config.ts` → `environment: 'node'`. `Intl` + `Europe/Istanbul` tz Node'da tam destekli. Test dosyası domain dosyasının yanında (`*.test.ts`).
- **İstanbul saati:** Türkiye 2016'dan beri sabit **UTC+3 (DST yok)**. Takvim mantığı bu varsayıma dayanır; testler açık `+03:00` offset'li `Date` kurar.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Bağımlılık |
|-------|-----------|-----------|
| `src/lib/domain/calendar/holidays2026.ts` (yeni) | 2026 TR resmî tatil verisi (`Set<'YYYY-MM-DD'>`) | yok |
| `src/lib/domain/calendar/calendar.ts` (yeni) | `istanbulParts`, `isHoliday`, `isMarketOpen`, `nextMarketOpen` | `holidays2026.ts`, `scenario/types` (`AssetCategory`) |
| `src/lib/domain/calendar/calendar.test.ts` (yeni) | Yukarısının deterministik unit testi | calendar.ts |
| `src/lib/domain/fx/liveFx.ts` (yeni) | `LivePriceSource` arayüzü + `createLiveFxEngine(source):FxEngine` | `money.ts`, `fx.ts` (`FxEngine` tipi) |
| `src/lib/domain/fx/liveFx.test.ts` (yeni) | `createLiveFxEngine` + seam-doğrulama (buyAsset değişmeden çalışır) | liveFx.ts, gameState.ts (sadece testte) |

**Kalibrasyon notu (spec §12, uygulamayı BLOKLAMAZ):** `holidays2026.ts`'teki dinî bayram (Ramazan/Kurban) tarihleri lunar takvim → tahmini. Quant, Diyanet resmî takviminden doğrulayacak. Mekanizma tarihten bağımsız çalışır; yalnızca veri-doğruluğu rafine edilir.

---

### Task 1: TR Tatil Verisi + Takvim Temeli (`istanbulParts`, `isHoliday`)

**Files:**
- Create: `src/lib/domain/calendar/holidays2026.ts`
- Create: `src/lib/domain/calendar/calendar.ts`
- Test: `src/lib/domain/calendar/calendar.test.ts`

- [ ] **Step 1: Tatil verisini yaz**

`src/lib/domain/calendar/holidays2026.ts`:

```ts
// 2026 Türkiye resmî tatil takvimi — BIST'in KAPALI olduğu günler.
// Tüm değerler Europe/Istanbul yerel tarihi, 'YYYY-MM-DD' formatında.
//
// Sabit (millî) tatiller kesindir. Dinî bayramlar (Ramazan/Kurban) lunar takvime
// bağlı olduğundan AŞAĞISI EN İYİ TAHMİNDİR — QUANT KALİBRASYON (spec §12):
// Diyanet resmî takviminden doğrula. Mekanizma tarihten bağımsız; sadece veri rafine edilir.
export const HOLIDAYS_2026: ReadonlySet<string> = new Set<string>([
  // — Sabit millî tatiller —
  '2026-01-01', // Yılbaşı
  '2026-04-23', // Ulusal Egemenlik ve Çocuk Bayramı
  '2026-05-01', // Emek ve Dayanışma Günü
  '2026-05-19', // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  '2026-07-15', // Demokrasi ve Millî Birlik Günü
  '2026-08-30', // Zafer Bayramı
  '2026-10-29', // Cumhuriyet Bayramı

  // — Dinî bayramlar (TAHMİNİ — quant doğrula) —
  // Ramazan Bayramı (≈ 20–22 Mart 2026)
  '2026-03-20',
  '2026-03-21',
  '2026-03-22',
  // Kurban Bayramı (≈ 27–30 Mayıs 2026)
  '2026-05-27',
  '2026-05-28',
  '2026-05-29',
  '2026-05-30',
]);
```

- [ ] **Step 2: `istanbulParts` + `isHoliday` için başarısız test yaz**

`src/lib/domain/calendar/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { istanbulParts, isHoliday } from './calendar';

describe('istanbulParts', () => {
  it('Europe/Istanbul yerel tarih anahtarı üretir (YYYY-MM-DD)', () => {
    // 2026-01-05 10:30 Istanbul (UTC+3) -> 07:30 UTC
    const p = istanbulParts(new Date('2026-01-05T10:30:00+03:00'));
    expect(p.key).toBe('2026-01-05');
    expect(p.hour).toBe(10);
    expect(p.minute).toBe(30);
  });
  it('hafta gününü 1=Pzt..7=Paz olarak verir', () => {
    expect(istanbulParts(new Date('2026-01-05T10:00:00+03:00')).weekday).toBe(1); // Pazartesi
    expect(istanbulParts(new Date('2026-01-03T10:00:00+03:00')).weekday).toBe(6); // Cumartesi
    expect(istanbulParts(new Date('2026-01-04T10:00:00+03:00')).weekday).toBe(7); // Pazar
  });
  it('UTC ifadesini Istanbul yerel gününe çevirir', () => {
    // 2026-01-05 23:30 UTC = 2026-01-06 02:30 Istanbul -> gün ilerler
    const p = istanbulParts(new Date('2026-01-05T23:30:00Z'));
    expect(p.key).toBe('2026-01-06');
    expect(p.hour).toBe(2);
  });
});

describe('isHoliday', () => {
  it('millî tatili tanır', () => {
    expect(isHoliday(new Date('2026-04-23T12:00:00+03:00'))).toBe(true);
  });
  it('dinî bayramı tanır (tahmini)', () => {
    expect(isHoliday(new Date('2026-05-28T12:00:00+03:00'))).toBe(true);
  });
  it('normal iş gününü tatil saymaz', () => {
    expect(isHoliday(new Date('2026-01-05T12:00:00+03:00'))).toBe(false);
  });
});
```

- [ ] **Step 3: Testin başarısız olduğunu doğrula**

Run: `npm run test -- calendar`
Expected: FAIL — `calendar.ts` yok / `istanbulParts is not a function`.

- [ ] **Step 4: `calendar.ts` temelini yaz**

`src/lib/domain/calendar/calendar.ts`:

```ts
import type { AssetCategory } from '../scenario/types';
import { HOLIDAYS_2026 } from './holidays2026';

export interface IstanbulParts {
  readonly key: string;     // 'YYYY-MM-DD' (Europe/Istanbul yerel tarihi)
  readonly weekday: number; // 1=Pazartesi .. 7=Pazar
  readonly hour: number;    // 0..23 (Istanbul yerel saati)
  readonly minute: number;  // 0..59
}

const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Bir `Date` anını Europe/Istanbul yerel parçalarına böler (tz-bağımsız, deterministik). */
export function istanbulParts(at: Date): IstanbulParts {
  const key = DATE_FMT.format(at); // 'YYYY-MM-DD'
  const [hh, mm] = TIME_FMT.format(at).split(':'); // 'HH:MM'
  // weekday'i key'den saf tarih olarak hesapla (UTC gün = JS gün-of-week 0=Paz..6=Cmt)
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
  return {
    key,
    weekday: dow === 0 ? 7 : dow, // 1=Pzt..7=Paz
    hour: Number(hh),
    minute: Number(mm),
  };
}

/** Verilen an Europe/Istanbul'da bir TR resmî tatiline mi düşüyor? */
export function isHoliday(at: Date): boolean {
  return HOLIDAYS_2026.has(istanbulParts(at).key);
}
```

- [ ] **Step 5: Testin geçtiğini doğrula**

Run: `npm run test -- calendar`
Expected: PASS (istanbulParts 3 + isHoliday 3 = 6 test yeşil).

- [ ] **Step 6: Tip kontrolü + commit**

```bash
npm run check
git add src/lib/domain/calendar/holidays2026.ts src/lib/domain/calendar/calendar.ts src/lib/domain/calendar/calendar.test.ts
git commit -m "feat(calendar): 2026 TR tatil verisi + istanbulParts/isHoliday (TDD)"
```
Expected: `check` 0 hata; commit oluşur.

---

### Task 2: BIST Seans Açıklığı (`isMarketOpen`)

**Files:**
- Modify: `src/lib/domain/calendar/calendar.ts` (fonksiyon ekle)
- Test: `src/lib/domain/calendar/calendar.test.ts` (describe ekle)

- [ ] **Step 1: `isMarketOpen` için başarısız test yaz**

`calendar.test.ts` dosyasının SONUNA ekle (önce import satırını güncelle):

`import` satırını şununla değiştir:
```ts
import { istanbulParts, isHoliday, isMarketOpen } from './calendar';
```

Dosya sonuna ekle:
```ts
describe('isMarketOpen', () => {
  it('kripto her zaman açık (7/24)', () => {
    expect(isMarketOpen('crypto', new Date('2026-01-03T03:00:00+03:00'))).toBe(true); // Cmt gece
    expect(isMarketOpen('crypto', new Date('2026-01-01T12:00:00+03:00'))).toBe(true); // tatil
  });
  it('döviz ve emtia her zaman açık (v1)', () => {
    expect(isMarketOpen('fx', new Date('2026-01-03T22:00:00+03:00'))).toBe(true);
    expect(isMarketOpen('commodity', new Date('2026-01-01T22:00:00+03:00'))).toBe(true);
  });
  it('BIST hafta içi 10:00–18:00 arası açık', () => {
    expect(isMarketOpen('bist', new Date('2026-01-05T10:30:00+03:00'))).toBe(true);  // Pzt 10:30
    expect(isMarketOpen('bist', new Date('2026-01-05T17:59:00+03:00'))).toBe(true);  // kapanışa yakın
  });
  it('BIST açılış öncesi kapalı (10:00 sınırı)', () => {
    expect(isMarketOpen('bist', new Date('2026-01-05T09:59:00+03:00'))).toBe(false);
    expect(isMarketOpen('bist', new Date('2026-01-05T10:00:00+03:00'))).toBe(true); // 10:00 dahil
  });
  it('BIST kapanışta ve sonrasında kapalı (18:00 sınırı)', () => {
    expect(isMarketOpen('bist', new Date('2026-01-05T18:00:00+03:00'))).toBe(false); // 18:00 hariç
    expect(isMarketOpen('bist', new Date('2026-01-05T18:30:00+03:00'))).toBe(false);
  });
  it('BIST hafta sonu kapalı', () => {
    expect(isMarketOpen('bist', new Date('2026-01-03T12:00:00+03:00'))).toBe(false); // Cmt
    expect(isMarketOpen('bist', new Date('2026-01-04T12:00:00+03:00'))).toBe(false); // Paz
  });
  it('BIST resmî tatilde kapalı (saat uygun olsa bile)', () => {
    expect(isMarketOpen('bist', new Date('2026-04-23T12:00:00+03:00'))).toBe(false);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm run test -- calendar`
Expected: FAIL — `isMarketOpen is not exported`.

- [ ] **Step 3: `isMarketOpen`'u uygula**

`calendar.ts`'e ekle (`isHoliday`'in altına):

```ts
const BIST_OPEN_HOUR = 10;   // 10:00 (Europe/Istanbul) — seans başlangıcı (dahil)
const BIST_CLOSE_HOUR = 18;  // 18:00 — seans bitişi (hariç)

/** Verilen kategori, verilen anda işleme açık mı?
 *  Kripto/döviz/emtia v1'de her zaman açık; BIST hafta içi 10:00–18:00 ve tatil değil. */
export function isMarketOpen(category: AssetCategory, at: Date): boolean {
  if (category !== 'bist') return true;
  const p = istanbulParts(at);
  if (p.weekday >= 6) return false;                 // Cmt(6)/Paz(7)
  if (HOLIDAYS_2026.has(p.key)) return false;       // resmî tatil
  if (p.hour < BIST_OPEN_HOUR) return false;        // açılış öncesi
  if (p.hour >= BIST_CLOSE_HOUR) return false;      // kapanış ve sonrası
  return true;
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm run test -- calendar`
Expected: PASS (7 yeni test dahil tümü yeşil).

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/lib/domain/calendar/calendar.ts src/lib/domain/calendar/calendar.test.ts
git commit -m "feat(calendar): BIST seans açıklığı isMarketOpen (TDD)"
```

---

### Task 3: Sonraki Açılış (`nextMarketOpen`)

**Files:**
- Modify: `src/lib/domain/calendar/calendar.ts`
- Test: `src/lib/domain/calendar/calendar.test.ts`

- [ ] **Step 1: `nextMarketOpen` için başarısız test yaz**

`calendar.test.ts` import satırını güncelle:
```ts
import { istanbulParts, isHoliday, isMarketOpen, nextMarketOpen } from './calendar';
```

Dosya sonuna ekle:
```ts
describe('nextMarketOpen', () => {
  it('BIST dışı kategoride argümanı aynen döndürür (hep açık)', () => {
    const at = new Date('2026-01-03T22:00:00+03:00');
    expect(nextMarketOpen('crypto', at).getTime()).toBe(at.getTime());
  });
  it('BIST açıkken o anı döndürür', () => {
    const at = new Date('2026-01-05T11:00:00+03:00'); // Pzt seans içi
    expect(nextMarketOpen('bist', at).getTime()).toBe(at.getTime());
  });
  it('açılış öncesi -> aynı günün 10:00 açılışı', () => {
    const at = new Date('2026-01-05T08:00:00+03:00'); // Pzt 08:00
    const expected = new Date('2026-01-05T10:00:00+03:00');
    expect(nextMarketOpen('bist', at).getTime()).toBe(expected.getTime());
  });
  it('kapanış sonrası -> ertesi iş gününün 10:00 açılışı', () => {
    const at = new Date('2026-01-02T19:00:00+03:00'); // Cuma 19:00 (kapalı)
    const expected = new Date('2026-01-05T10:00:00+03:00'); // sonraki Pzt
    expect(nextMarketOpen('bist', at).getTime()).toBe(expected.getTime());
  });
  it('hafta sonu -> Pazartesi 10:00 açılışı', () => {
    const at = new Date('2026-01-03T12:00:00+03:00'); // Cmt
    const expected = new Date('2026-01-05T10:00:00+03:00');
    expect(nextMarketOpen('bist', at).getTime()).toBe(expected.getTime());
  });
  it('tatil gününü atlar (1 Ocak Per -> 2 Ocak Cum 10:00)', () => {
    const at = new Date('2026-01-01T12:00:00+03:00'); // Yılbaşı (Perşembe, tatil)
    const expected = new Date('2026-01-02T10:00:00+03:00'); // Cuma normal
    expect(nextMarketOpen('bist', at).getTime()).toBe(expected.getTime());
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm run test -- calendar`
Expected: FAIL — `nextMarketOpen is not exported`.

- [ ] **Step 3: `nextMarketOpen`'u uygula**

`calendar.ts`'e ekle (`isMarketOpen`'un altına):

```ts
const DAY_MS = 86_400_000;
const MAX_LOOKAHEAD_DAYS = 14;

/** Verilen andan itibaren piyasanın açık olacağı bir sonraki anı döndürür.
 *  Şu an açıksa `at`'ı aynen döndürür. BIST dışı kategoriler hep açık → `at`.
 *  (Istanbul sabit UTC+3 olduğundan günün açılışı 10:00+03:00 olarak kurulur.) */
export function nextMarketOpen(category: AssetCategory, at: Date): Date {
  if (category !== 'bist') return at;
  if (isMarketOpen(category, at)) return at;
  for (let i = 0; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const probeKey = istanbulParts(new Date(at.getTime() + i * DAY_MS)).key;
    const openAt = new Date(`${probeKey}T10:00:00+03:00`); // o günün açılış anı
    if (openAt.getTime() < at.getTime()) continue;          // açılışı geçmiş günü atla
    if (isMarketOpen('bist', openAt)) return openAt;        // hafta içi + tatil değil
  }
  return at; // güvenlik (14 gün içinde mutlaka açık seans var)
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm run test -- calendar`
Expected: PASS (6 yeni test dahil tümü yeşil).

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/lib/domain/calendar/calendar.ts src/lib/domain/calendar/calendar.test.ts
git commit -m "feat(calendar): nextMarketOpen — sonraki seans açılışı (TDD)"
```

---

### Task 4: Canlı FX Motoru (`liveFx.ts`) — tek seam

**Files:**
- Create: `src/lib/domain/fx/liveFx.ts`
- Test: `src/lib/domain/fx/liveFx.test.ts`

> **Tasarım kararı (spec §2 ile uyumlu sadeleştirme):** `LivePriceSource` tüm fiyatları **TRY** döndürür; kriptonun USD→TRY çevrimi store/source katmanında (canlı kur ile) yapılır. Böylece `liveFx.ts` kategori-bilmez ve saf kalır, mevcut TRY-tabanlı reducer'lar (`buyAsset`/`sellAsset`/`convert*`/`netWorthUsd`) **imza değişmeden** çalışır (spec §3). Bu, store'un Plan 3'te `assetTry(crypto)` = `usdPrice × güncel usdTry` hesaplamasını gerektirir.

- [ ] **Step 1: Başarısız test yaz**

`src/lib/domain/fx/liveFx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createLiveFxEngine, type LivePriceSource } from './liveFx';
import { createGameState, buyAsset } from '../../stores/gameState';
import { tryM } from '../money';

// Sahte canlı kaynak: sabit fiyatlar (deterministik test)
function stubSource(prices: Record<string, number>, rate = 40): LivePriceSource {
  return {
    usdTry: () => rate,
    assetTry: (id) => prices[id],
  };
}

describe('createLiveFxEngine', () => {
  const fx = createLiveFxEngine(stubSource({ BTC: 4_000_000, THYAO: 320 }, 40));

  it('usdTryForDay canlı kuru TRY olarak döner, day yok sayılır', () => {
    expect(fx.usdTryForDay(0).amount).toBe(40);
    expect(fx.usdTryForDay(999).amount).toBe(40); // farklı day -> aynı (canlı)
    expect(fx.usdTryForDay(5).currency).toBe('TRY');
  });
  it('assetPriceForDay canlı TRY fiyatı döner, day yok sayılır', () => {
    expect(fx.assetPriceForDay('BTC', 0).amount).toBe(4_000_000);
    expect(fx.assetPriceForDay('BTC', 123).amount).toBe(4_000_000);
    expect(fx.assetPriceForDay('THYAO', 7).currency).toBe('TRY');
  });
  it('bilinmeyen (canlı fiyatı olmayan) varlıkta hata fırlatır', () => {
    expect(() => fx.assetPriceForDay('YOKBU', 1)).toThrow('No live price: YOKBU');
  });
  it('güncel kaynak değişimini yansıtır (canlılık)', () => {
    let p = 100;
    const live = createLiveFxEngine({ usdTry: () => 40, assetTry: () => p });
    expect(live.assetPriceForDay('X', 0).amount).toBe(100);
    p = 150;
    expect(live.assetPriceForDay('X', 0).amount).toBe(150);
  });
});

// SEAM DOĞRULAMA (spec §3): mevcut reducer canlı motorla DEĞİŞMEDEN çalışır.
describe("liveFx seam: mevcut reducer'lar degismeden calisir", () => {
  it('buyAsset canlı fiyatla TRY bakiyeden düşer ve holding ekler', () => {
    const fx = createLiveFxEngine(stubSource({ BTC: 1_000_000 }, 40));
    let s = createGameState('canli', 1, 'p1', 0);
    s = { ...s, tryBalance: tryM(5_000_000) }; // test için TRY yükle
    s = buyAsset(s, fx, 'BTC', 2); // 2 × 1.000.000 = 2.000.000 TRY
    expect(s.tryBalance.amount).toBe(3_000_000);
    expect(s.holdings).toHaveLength(1);
    expect(s.holdings[0]).toMatchObject({ assetId: 'BTC', units: 2 });
    expect(s.holdings[0].avgCost.amount).toBe(1_000_000);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm run test -- liveFx`
Expected: FAIL — `./liveFx` modülü yok.

- [ ] **Step 3: `liveFx.ts`'i uygula**

`src/lib/domain/fx/liveFx.ts`:

```ts
import type { Money } from '../money';
import { tryM } from '../money';
import type { FxEngine } from './fx';

/** Canlı fiyat kaynağı — Plan 3'te reaktif store (canlı fiyat cache) tarafından doldurulur.
 *  Tüm fiyatlar TRY'dir; kripto USD→TRY çevrimi store/source katmanında (güncel kur) yapılır. */
export interface LivePriceSource {
  /** Güncel USD/TRY mid kuru. */
  usdTry(): number;
  /** Verilen varlığın güncel TRY fiyatı; canlı fiyat yoksa undefined. */
  assetTry(assetId: string): number | undefined;
}

/** Mevcut `FxEngine` arayüzünü canlı fiyatla doldurur.
 *  `day` argümanı YOK SAYILIR — fiyat zamana değil son canlı değere bağlıdır (spec §2).
 *  Makas yok → işlem fiyatı = değerleme fiyatı = mid; reducer'lar değişmeden çalışır (spec §3). */
export function createLiveFxEngine(source: LivePriceSource): FxEngine {
  return {
    usdTryForDay(_day: number): Money {
      return tryM(source.usdTry());
    },
    assetPriceForDay(assetId: string, _day: number): Money {
      const price = source.assetTry(assetId);
      if (price === undefined) throw new Error(`No live price: ${assetId}`);
      return tryM(price);
    },
  };
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm run test -- liveFx`
Expected: PASS (createLiveFxEngine 4 + seam 1 = 5 test yeşil).

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/lib/domain/fx/liveFx.ts src/lib/domain/fx/liveFx.test.ts
git commit -m "feat(fx): createLiveFxEngine — canlı fiyatla FxEngine seam (TDD)"
```

---

### Task 5: Tam Doğrulama (regresyon + motor değişmedi kanıtı)

**Files:** (kod değişikliği yok — kapanış kapısı)

- [ ] **Step 1: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: PASS. Mevcut **129 test aynen yeşil** (gameState dahil hiçbiri değişmedi — spec §3) + yeni testler: calendar (19) + liveFx (5) = **toplam ~153 test**.

- [ ] **Step 2: Tip + lint kontrolü**

Run: `npm run check`
Expected: 0 hata, 0 uyarı.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Başarılı build (yeni domain dosyaları derlenir).

- [ ] **Step 4: Motor değişmedi teyidi (manuel)**

Doğrula: `git diff e5a8a24 --stat -- src/lib/stores/gameState.ts src/lib/domain/fx/fx.ts src/lib/data/macro2025.ts`
Expected: **boş çıktı** (bu üç dosyada sıfır değişiklik — spec §3 garantisi).

- [ ] **Step 5: (opsiyonel) Doğrulama özetini commit'le** — kod değişmediyse commit gerekmez; sadece raporla.

---

## Self-Review (spec ↔ plan kapsamı)

- **Spec §2 (seam):** `createLiveFxEngine(source)` `FxEngine`'i canlı fiyatla dolduruyor (Task 4). ✅
- **Spec §3 (motor değişmez):** `gameState.ts`/`fx.ts`/`macro2025.ts`'e dokunulmuyor; seam testi `buyAsset`'in değişmeden çalıştığını kanıtlıyor; Task 5 git-diff ile teyit. ✅
- **Spec §5 (takvim v1):** `isMarketOpen` (BIST 10–18 + tatil + hafta sonu; kripto/döviz/emtia hep açık) + `nextMarketOpen` ("açılışta gel" için). ✅
- **Spec §11 (test):** calendar deterministik unit (Task 1-3); liveFx `day`-yoksayma + eksik-sembol + seam (Task 4); gameState'e yeni test EKLENMEDİ (§11.1). ✅
- **Spec §12 (kalibrasyon):** Dinî bayram tarihleri tahmini + `QUANT DOĞRULA` notu; mekanizma tarihten bağımsız → uygulamayı bloklamıyor. ✅
- **Kapsam dışı (bu plan):** API çekimi (Plan 2), reaktif store/UI/periyot seçimi/E2E (Plan 3). Bilinçli. ✅
- **Placeholder taraması:** Tüm step'lerde tam kod var; "TODO/TBD/uygun hata ekle" yok. ✅
- **Tip tutarlılığı:** `LivePriceSource` (usdTry/assetTry), `IstanbulParts` (key/weekday/hour/minute), `AssetCategory` mevcut tiple uyumlu; `FxEngine` imzası birebir. ✅

---

## Plan 2 & 3 — yol haritası (bu planın dışında, ayrıca yazılacak)

- **Plan 2 (API & Proxy):** `src/routes/api/yahoo/+server.ts` (BIST `*.IS` + altın `GC=F` + USD/TRY, 5s cache — legacy `server.js` deseni) · `src/routes/api/crypto/+server.ts` · `src/lib/api/fx.ts` (poll) · `src/lib/api/binance.ts` (WS, BTC/ETH USDT). Mock'lu unit test.
- **Plan 3 (Store & UI):** `src/lib/stores/liveGameStore.svelte.ts` (runes: gerçek-zaman saat + canlı fiyat cache `LivePriceSource` impl + `createLiveFxEngine` enjeksiyonu + `$derived` skor + periyot **60/180/365** clock override) · 7 bileşen (HudBar/WalletPanel/MarketPanel/TradePanel/FxDeskPanel/DepositPanel/BalanceMirror — legacy görsel port) · minimal giriş (mod + periyot) · sayfa montajı (yerleşim A) · Playwright E2E (canlı route mock'lu).
