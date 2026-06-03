# BIST100 On-Demand + Arama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcı 100 BIST hissesini sürekli çekmeden, statik bir BIST100 listesinden arayıp seçtiği hisseyi canlı **aktif sete** ekleyebilsin; aktif set küçük kalsın (kripto + emtia + döviz + tutulan/seçilen BIST) ve aynı sprintte canlı-veri katmanı rate-limit'e karşı sağlamlaşsın.

**Architecture:** Statik BIST100 kataloğu (sembol + TR ad, **fiyatsız**) yalnızca aramayı besler. Store bir **dinamik aktif BIST seti** (`activeBist`) tutar; `addBist()` ile büyür ve hemen tek seferlik poll tetikler. `pollFx` artık sabit `BIST_SYMBOLS` yerine aktif seti `?bist=` ile çeker. İki robustluk düzeltmesi zorunlu olarak birlikte gider: **(A)** stale snapshot'ta son-gerçek fiyat korunur (fallback'le EZİLMEZ), **(B)** FX poll 5s→20s yavaşlatılır (kripto WS ile hızlı kalır). Ek olarak `fetchFxValue`'nun BIST döngüsü **sembol-bazında dayanıklı** yapılır: aranan geçersiz bir sembol tüm snapshot'ı düşürmez.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TypeScript (strict) + Vitest. Para = `Money` (domain/money). Saf domain/store mantığı UI'dan bağımsız, TDD zorunlu.

---

## Tasarım Notları (uygulamadan önce oku)

**Mevcut kırılganlık (bu plan çözer):**
1. `source.assetTry` (store) `CATALOG[id]` üyeliğine bağlı → statik 6 varlık dışındaki bir BIST sembolünün fiyatı `undefined` döner ve `buy()` "no price" ile patlar. **Çözüm (Task 4):** kripto-set kontrolü + diğer her şey için `fxCache.prices[id]` (TRY) — CATALOG'a bağımlılık kalkar.
2. `pollFx` stale snapshot'ta `fxCache = snap.value` ile son-gerçek fiyatı fallback'le EZER. **Çözüm (Task 4, fix A):** yalnız `!snap.stale` iken `fxCache` güncellenir; `fxStale` her zaman `snap.stale`'den gelir.
3. 5sn'de bir Yahoo'yu dövmek geçici rate-limit doğurur. **Çözüm (Task 4, fix B):** `pollMs` varsayılanı 20000.
4. `fetchFxValue` atomik — tek BIST sembolü patlarsa tüm snapshot patlar. On-demand'de kullanıcı geçersiz sembol aratabilir. **Çözüm (Task 3):** BIST döngüsü sembol-bazında try/catch ile dayanıklı (metaller/usdTry atomik kalır — onlar kullanıcı girdisi değil).

**Kapsam dışı (v1):** aktif setten sembol ÇIKARMA (yalnız büyür; kullanıcı az arar → küçük kalır); BIST100 fiyat ön-izleme (liste fiyatsız); BIST100 listesinin tam/güncel 100 sembol doğruluğu (anlık snapshot — quant TODO, fallback fiyat kaba).

**Dosya yapısı:**
- Create `src/lib/catalog/bist100.ts` — statik liste + `bistName()` + `searchBist100()`.
- Create `src/lib/catalog/bist100.test.ts`.
- Modify `src/lib/catalog/liveAssets.ts` — `CRYPTO_SET` + `CORE_ASSETS` türevleri.
- Modify `src/lib/catalog/liveAssets.test.ts` — yeni türevler.
- Modify `src/lib/api/yahooSource.ts` — BIST döngüsü sembol-bazında dayanıklı.
- Modify `src/routes/api/yahoo/server.test.ts` — kısmi-hata testi.
- Modify `src/lib/stores/liveGameStore.svelte.ts` — `source.assetTry` yeniden, `activeBist` + `addBist`, `prices` türevi, `pollFx` aktif set + fix A, `pollMs` fix B.
- Modify `src/lib/stores/liveGameStore.test.ts` — yeni vakalar.
- Modify `src/lib/components/PriceList.svelte` — arama BIST100'ü kapsar + `onAddBist`.
- Modify `src/routes/+page.svelte` — `onAddBist` kablolaması.

---

## Task 1: Statik BIST100 kataloğu

**Files:**
- Create: `src/lib/catalog/bist100.ts`
- Test: `src/lib/catalog/bist100.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/catalog/bist100.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BIST100, bistName, searchBist100 } from './bist100';

describe('BIST100 statik katalog', () => {
  it('sembol+ad yapısı; fiyat ALANI YOK (yalnız arama beslemesi)', () => {
    expect(BIST100.length).toBeGreaterThanOrEqual(30);
    for (const e of BIST100) {
      expect(typeof e.symbol).toBe('string');
      expect(e.symbol).toBe(e.symbol.toUpperCase());
      expect(typeof e.name).toBe('string');
      expect((e as Record<string, unknown>).price).toBeUndefined();
    }
  });

  it('semboller tekil', () => {
    const set = new Set(BIST100.map((e) => e.symbol));
    expect(set.size).toBe(BIST100.length);
  });

  it('bistName: bilinen sembolün adını döner, bilinmeyende sembolün kendisini', () => {
    expect(bistName('THYAO')).toBe('Türk Hava Yolları');
    expect(bistName('ZZZZ')).toBe('ZZZZ');
  });

  it('searchBist100: sembol VEYA ada göre büyük/küçük harf duyarsız eşleşir, sonuç sınırlı', () => {
    expect(searchBist100('thy').some((e) => e.symbol === 'THYAO')).toBe(true);
    expect(searchBist100('hava').some((e) => e.symbol === 'THYAO')).toBe(true);
    expect(searchBist100('').length).toBe(0); // boş sorgu → sonuç yok
    expect(searchBist100('a').length).toBeLessThanOrEqual(12); // sınır
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/catalog/bist100.test.ts`
Expected: FAIL — `Cannot find module './bist100'`.

- [ ] **Step 3: Write the implementation**

`src/lib/catalog/bist100.ts`:

```ts
/** Statik BIST100 arama kataloğu — sembol + TR ad, FİYATSIZ.
 *  Sadece aramayı besler; canlı fiyat YALNIZ aktif sete (store.activeBist) eklenince çekilir.
 *  ⚠️ Anlık snapshot: BIST100 ~3 ayda yeniden dengelenir; liste data'dır, genişletilebilir/quant rafine eder. */
export interface Bist100Entry {
  readonly symbol: string;
  readonly name: string;
}

/** En likit/bilinen BIST sembolleri (genişletilebilir; v1 yeterli kapsam). */
export const BIST100: ReadonlyArray<Bist100Entry> = [
  { symbol: 'THYAO', name: 'Türk Hava Yolları' },
  { symbol: 'ASELS', name: 'Aselsan Elektronik' },
  { symbol: 'EREGL', name: 'Ereğli Demir Çelik' },
  { symbol: 'GUBRF', name: 'Gübre Fabrikaları' },
  { symbol: 'KCHOL', name: 'Koç Holding' },
  { symbol: 'TUPRS', name: 'Tüpraş Rafinerileri' },
  { symbol: 'SASA', name: 'SASA Polyester' },
  { symbol: 'YKBNK', name: 'Yapı Kredi Bankası' },
  { symbol: 'BIMAS', name: 'BİM Birleşik Mağazalar' },
  { symbol: 'AKBNK', name: 'Akbank' },
  { symbol: 'GARAN', name: 'Garanti BBVA' },
  { symbol: 'ISCTR', name: 'İş Bankası (C)' },
  { symbol: 'SISE', name: 'Şişecam' },
  { symbol: 'PETKM', name: 'Petkim Petrokimya' },
  { symbol: 'FROTO', name: 'Ford Otosan' },
  { symbol: 'TOASO', name: 'Tofaş Oto Fabrika' },
  { symbol: 'TCELL', name: 'Turkcell' },
  { symbol: 'TTKOM', name: 'Türk Telekom' },
  { symbol: 'KOZAL', name: 'Koza Altın' },
  { symbol: 'KOZAA', name: 'Koza Anadolu Metal' },
  { symbol: 'PGSUS', name: 'Pegasus Hava Taşımacılığı' },
  { symbol: 'HEKTS', name: 'Hektaş' },
  { symbol: 'SAHOL', name: 'Sabancı Holding' },
  { symbol: 'ENKAI', name: 'Enka İnşaat' },
  { symbol: 'TAVHL', name: 'TAV Havalimanları' },
  { symbol: 'ARCLK', name: 'Arçelik' },
  { symbol: 'VESTL', name: 'Vestel Elektronik' },
  { symbol: 'EKGYO', name: 'Emlak Konut GYO' },
  { symbol: 'HALKB', name: 'Halkbank' },
  { symbol: 'VAKBN', name: 'VakıfBank' },
  { symbol: 'OYAKC', name: 'Oyak Çimento' },
  { symbol: 'MGROS', name: 'Migros Ticaret' },
  { symbol: 'ULKER', name: 'Ülker Bisküvi' },
  { symbol: 'DOHOL', name: 'Doğan Holding' },
  { symbol: 'ASTOR', name: 'Astor Enerji' },
  { symbol: 'ALARK', name: 'Alarko Holding' },
  { symbol: 'BRSAN', name: 'Borusan Boru' },
  { symbol: 'TTRAK', name: 'Türk Traktör' },
  { symbol: 'KRDMD', name: 'Kardemir (D)' },
  { symbol: 'GESAN', name: 'Girişim Elektrik' },
];

const BY_SYMBOL: Readonly<Record<string, string>> = Object.fromEntries(
  BIST100.map((e) => [e.symbol, e.name]),
);

/** Sembolün TR adı; bilinmiyorsa sembolün kendisi (store/PriceList etiketlemesi). */
export function bistName(symbol: string): string {
  return BY_SYMBOL[symbol] ?? symbol;
}

const SEARCH_LIMIT = 12;

/** Sembol VEYA ada göre büyük/küçük harf duyarsız arama; boş sorgu → []. Sonuç SEARCH_LIMIT ile sınırlı. */
export function searchBist100(query: string): Bist100Entry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const out: Bist100Entry[] = [];
  for (const e of BIST100) {
    if (e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) {
      out.push(e);
      if (out.length >= SEARCH_LIMIT) break;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/catalog/bist100.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/bist100.ts src/lib/catalog/bist100.test.ts
git commit -m "feat(catalog): statik BIST100 arama listesi (sembol+ad, fiyatsız)"
```

---

## Task 2: Katalog türevleri — CRYPTO_SET + CORE_ASSETS

**Files:**
- Modify: `src/lib/catalog/liveAssets.ts`
- Test: `src/lib/catalog/liveAssets.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/catalog/liveAssets.test.ts` dosyasının sonundaki `describe(...)` bloğunun içine (kapanış `});`'inden hemen önce) ekle:

```ts
  it('CRYPTO_SET kripto id\'lerini içerir, BIST\'i içermez', () => {
    expect(CRYPTO_SET.has('BTC')).toBe(true);
    expect(CRYPTO_SET.has('ETH')).toBe(true);
    expect(CRYPTO_SET.has('THYAO')).toBe(false);
  });

  it('CORE_ASSETS = BIST olmayan çekirdek (kripto + emtia + döviz); BIST yok', () => {
    const ids = CORE_ASSETS.map((a) => a.id);
    expect(ids).toContain('BTC');
    expect(ids).toContain('XAUGRAM');
    expect(ids).toContain('EUR');
    expect(ids).not.toContain('THYAO');
    expect(CORE_ASSETS.every((a) => a.category !== 'bist')).toBe(true);
  });
```

Aynı dosyanın en üstündeki import satırına `CRYPTO_SET` ve `CORE_ASSETS`'i ekle (mevcut `import { ... } from './liveAssets';` listesine).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/catalog/liveAssets.test.ts`
Expected: FAIL — `CRYPTO_SET`/`CORE_ASSETS` export edilmemiş.

- [ ] **Step 3: Write the implementation**

`src/lib/catalog/liveAssets.ts` dosyasının sonuna ekle:

```ts
/** Hızlı kripto üyelik kontrolü (store source closure'ı: kripto → USD×usdTry, diğer → TRY proxy). */
export const CRYPTO_SET: ReadonlySet<string> = new Set(CRYPTO_SYMBOLS);

/** BIST olmayan çekirdek varlıklar — fiyat listesinde HER ZAMAN görünür (kripto + emtia + döviz). */
export const CORE_ASSETS: ReadonlyArray<LiveAssetMeta> = LIVE_ASSETS.filter(
  (a) => a.category !== 'bist',
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/catalog/liveAssets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/liveAssets.ts src/lib/catalog/liveAssets.test.ts
git commit -m "feat(catalog): CRYPTO_SET + CORE_ASSETS türevleri (on-demand BIST için)"
```

---

## Task 3: `fetchFxValue` BIST döngüsü sembol-bazında dayanıklı

**Files:**
- Modify: `src/lib/api/yahooSource.ts:78-84` (BIST `Promise.all` döngüsü)
- Test: `src/routes/api/yahoo/server.test.ts`

**Neden:** On-demand'de kullanıcı geçersiz/delisted bir sembol aratabilir; atomik döngü tek hata ile TÜM snapshot'ı düşürür (usdTry+metaller+diğer hisseler dahil). BIST döngüsü hatayı YUTUP sembolü atlamalı. usdTry ve metaller atomik kalır (onlar kullanıcı girdisi değil, çekirdek).

- [ ] **Step 1: Write the failing test**

`src/routes/api/yahoo/server.test.ts` içindeki `describe('fetchFxValue ...')` bloğuna yeni `it` ekle:

```ts
  it('geçersiz BIST sembolü tüm snapshot\'ı düşürmez — atlanır, diğerleri gelir', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('open.er-api.com')) return okJson({ rates: { TRY: 40, EUR: 0.5 } });
      if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000));
      if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));
      if (url.includes('THYAO.IS')) return okJson(yahooBody(300, 240));
      if (url.includes('ZZZZ.IS')) return Promise.resolve({ ok: false, status: 404 } as Response);
      return okJson(yahooBody(1));
    }) as unknown as typeof fetch;

    const v = await fetchFxValue(['THYAO', 'ZZZZ'], f);
    expect(v.prices.THYAO).toBe(300);   // sağlam sembol geldi
    expect(v.prices.ZZZZ).toBeUndefined(); // hatalı sembol atlandı
    expect(v.usdTry).toBe(40);          // çekirdek korundu
    expect(v.prices.XAUGRAM).toBe(4000); // metaller korundu
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/routes/api/yahoo/server.test.ts`
Expected: FAIL — `fetchFxValue` THYAO'yu da çekmeden reject ediyor (atomik `Promise.all`).

- [ ] **Step 3: Write the implementation**

`src/lib/api/yahooSource.ts` içindeki BIST döngüsünü (mevcut `await Promise.all( bist.map(async (sym) => { ... }) );`) şununla değiştir:

```ts
  // Sembol-bazında dayanıklı: on-demand'de geçersiz/delisted sembol diğerlerini düşürmesin.
  // (usdTry + metaller aşağıda atomik kalır — onlar çekirdek, kullanıcı girdisi değil.)
  await Promise.all(
    bist.map(async (sym) => {
      try {
        const q = await fetchYahooQuote(`${sym}.IS`, fetchFn);
        prices[sym] = round2(q.price);
        if (q.changePct !== undefined) change[sym] = q.changePct;
      } catch (err) {
        console.warn(`[yahooSource] BIST ${sym} atlandı:`, err instanceof Error ? err.message : err);
      }
    }),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/routes/api/yahoo/server.test.ts`
Expected: PASS (mevcut testler + yeni test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/yahooSource.ts src/routes/api/yahoo/server.test.ts
git commit -m "fix(api): BIST snapshot döngüsü sembol-bazında dayanıklı (geçersiz sembol atlanır)"
```

---

## Task 4: Store — on-demand aktif set + robustluk düzeltmeleri (A+B) + CATALOG-bağımsız fiyat çözümü

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Test: `src/lib/stores/liveGameStore.test.ts`

Bu task'ın 4 ayrı değişikliği var; hepsi tek dosyada ve birbirine bağlı. Önce TÜM testleri ekle, sonra implementasyonu yap, sonra koştur.

- [ ] **Step 1: Write the failing tests**

`src/lib/stores/liveGameStore.test.ts` içindeki `describe('createLiveGameStore', () => { ... })` bloğunun sonuna (kapanış `});`'ten önce) ekle:

```ts
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
    await Promise.resolve(); // addBist'in tetiklediği pollFx'i bekle
    await Promise.resolve();
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
  });

  it('12) addBist tekrarı yinelenmez (idempotent)', async () => {
    const t = setup();
    await t.store.start();
    t.store.addBist('THYAO'); // zaten başlangıç setinde
    flushSync();
    expect(t.store.prices.filter((p) => p.id === 'THYAO').length).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/stores/liveGameStore.test.ts`
Expected: FAIL — `addBist` yok (tip hatası/`is not a function`); test 10 fiyat ezildiği için 300 yerine 1 görür.

- [ ] **Step 3a: `LiveGameStore` arayüzüne `addBist` ekle**

`src/lib/stores/liveGameStore.svelte.ts` içindeki `export interface LiveGameStore` bloğunda, `setPeriod(days: PeriodDays): void;` satırının altına ekle:

```ts
  addBist(symbol: string): void;
```

- [ ] **Step 3b: `bistName` + katalog türevlerini import et**

Dosyanın üstündeki `import { LIVE_ASSETS, CATALOG, CRYPTO_SYMBOLS, BIST_SYMBOLS } from '../catalog/liveAssets';` satırını şununla değiştir:

```ts
import { CATALOG, CRYPTO_SYMBOLS, CRYPTO_SET, CORE_ASSETS, BIST_SYMBOLS } from '../catalog/liveAssets';
import { bistName } from '../catalog/bist100';
```

(`LIVE_ASSETS` artık `prices` türevinde kullanılmıyor — kaldırıldı.)

- [ ] **Step 3c: `activeBist` durumunu ekle**

`let selectedPeriodDays = $state<PeriodDays>(opts.periodDays ?? 365);` satırının hemen altına ekle:

```ts
  // Dinamik aktif BIST seti — başlangıç = katalog başlangıç hisseleri; addBist ile büyür (v1: yalnız büyür).
  let activeBist = $state<string[]>([...BIST_SYMBOLS]);
```

- [ ] **Step 3d: `source.assetTry`'ı CATALOG-bağımsız yap**

Mevcut `source` tanımındaki `assetTry` fonksiyonunu şununla değiştir:

```ts
    assetTry: (id) => {
      // Kripto: USD fiyatını canlı kurla TRY'ye çevir.
      if (CRYPTO_SET.has(id)) {
        const u = cryptoUsd[id];
        return u === undefined ? undefined : u * fxCache.usdTry;
      }
      // Diğer her şey (BIST/emtia/döviz) proxy'den zaten TRY gelir — CATALOG üyeliği gerekmez
      // (on-demand aranan BIST sembolleri de böyle çözülür).
      return fxCache.prices[id];
    },
```

- [ ] **Step 3e: `prices` türevini çekirdek + aktif BIST olarak yeniden yaz**

Mevcut `const prices = $derived.by<PriceRow[]>(() => { ... });` bloğunu şununla değiştir:

```ts
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
        marketOpen: bistOpen,
        changePct: fxCache.change?.[sym],
      });
    }
    return rows;
  });
```

- [ ] **Step 3f: `pollFx`'i aktif set + fix-A ile güncelle**

Mevcut `pollFx` içindeki ilk `try { ... }` bloğunu (yahoo çekimi) şununla değiştir:

```ts
    try {
      const snap = await fetchFxSnapshot({ bist: [...activeBist], fetchFn });
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
```

- [ ] **Step 3g: `addBist` fonksiyonunu ekle**

`const setPeriod = (days: PeriodDays) => { selectedPeriodDays = days; };` satırının altına ekle:

```ts
  // On-demand BIST: aktif sete ekle (normalize + idempotent) → hemen tek seferlik poll ile fiyatı getir.
  const addBist = (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (s === '' || activeBist.includes(s)) return;
    activeBist = [...activeBist, s];
    if (started) void pollFx(); // anında fiyat çek (≤poll periyodu beklemeden)
  };
```

- [ ] **Step 3h: `pollMs` varsayılanını yavaşlat (fix-B)**

Mevcut `const pollMs = opts.pollMs ?? 5000;` satırını şununla değiştir:

```ts
  // fix-B: FX poll'u yavaşlat (hisse yavaş değişir) → Yahoo rate-limit kök sebebini keser.
  // Kripto WS push ile hızlı kalır; bu poll yalnız FX + kripto 24s%/WS-stale fallback içindir.
  const pollMs = opts.pollMs ?? 20000;
```

- [ ] **Step 3i: `addBist`'i dönüş nesnesine ekle**

Dönüş nesnesinde `setPeriod,` satırının altına ekle:

```ts
    addBist,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/stores/liveGameStore.test.ts`
Expected: PASS — mevcut 9 test + yeni 10/11/12. (Test 1-9 kontratı korur: BTC kripto-set ile, THYAO/ASELS başlangıç aktif setinde, EUR/XAUGRAM CORE_ASSETS'te.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "feat(store): on-demand aktif BIST seti + addBist; fix-A stale-koru, fix-B 20s poll, CATALOG-bağımsız fiyat"
```

---

## Task 5: PriceList — arama BIST100'ü kapsasın + "ekle" eylemi

**Files:**
- Modify: `src/lib/components/PriceList.svelte`

**Davranış:** Boş arama → yalnız aktif fiyatlar (mevcut davranış). Dolu arama → eşleşen aktif satırlar (canlı fiyatlı) + henüz aktif OLMAYAN eşleşen BIST100 sonuçları (fiyatsız, "+ EKLE" görünümü). BIST100 sonucuna tıklanınca `onAddBist(symbol)` çağrılır (store ekler + tek poll tetikler + +page seçer).

- [ ] **Step 1: `Props`'a `onAddBist` ekle**

`src/lib/components/PriceList.svelte` içindeki `interface Props` bloğunu ve `$props()` satırını şununla değiştir:

```ts
	interface Props {
		prices: PriceRow[];
		onSelect: (id: string) => void;
		onAddBist: (symbol: string) => void;
	}

	let { prices, onSelect, onAddBist }: Props = $props();
```

- [ ] **Step 2: Import + arama türevi ekle**

`import { displayTry, marketBadge, dailyChangeBadge } from './format';` satırının altına ekle:

```ts
	import { searchBist100 } from '$lib/catalog/bist100';
```

Mevcut `const filtered = $derived(...)` bloğunun hemen altına ekle:

```ts
	// Arama yapılınca: BIST100'den eşleşip henüz aktif sette OLMAYAN semboller ("eklenebilir").
	const addable = $derived.by(() => {
		if (q.trim() === '') return [];
		const activeIds = new Set(prices.map((p) => p.id));
		return searchBist100(q).filter((e) => !activeIds.has(e.symbol));
	});

	function handleAdd(symbol: string) {
		onAddBist(symbol);
		q = ''; // aramayı temizle → yeni eklenen aktif listede görünür
	}
```

- [ ] **Step 3: "Eklenebilir" bölümünü listeye ekle**

Liste `<div class="flex-1 overflow-y-auto">` içinde, mevcut `{#if filtered.length === 0} ... {/if}` bloğunun KAPANIŞINDAN hemen sonra (yani `</div>` liste kapanışından önce) ekle:

```svelte
		{#if addable.length > 0}
			<div class="px-3 pt-3 pb-1 text-[10px] uppercase tracking-widest text-term-blue opacity-60 border-t border-term-border">
				BIST100 — Ekle
			</div>
			{#each addable as e (e.symbol)}
				<button
					type="button"
					onclick={() => handleAdd(e.symbol)}
					class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
					       hover:bg-term-panelLight hover:border-term-borderGlow
					       focus:outline-none focus:bg-term-panelLight
					       transition-colors duration-75 cursor-pointer flex items-center justify-between gap-2"
				>
					<div class="flex flex-col min-w-0">
						<span class="text-term-text font-bold truncate">{e.name}</span>
						<span class="text-[10px] text-term-blue opacity-70 uppercase tracking-wide">{e.symbol}</span>
					</div>
					<span class="text-[10px] text-term-green font-bold shrink-0">+ EKLE</span>
				</button>
			{/each}
		{/if}
```

Ayrıca "Sonuç bulunamadı" mesajı artık yalnız HEM aktif HEM eklenebilir boşsa görünmeli. Mevcut `{#if filtered.length === 0}` koşulunu şununla değiştir:

```svelte
			{#if filtered.length === 0 && addable.length === 0}
```

- [ ] **Step 4: Verify (component — derleme + tip)**

Run: `npm run check`
Expected: 0 hata/uyarı (PriceList artık `onAddBist` zorunlu prop'u ister — Task 6 +page'i günceller; bu adımda check henüz +page hatası verebilir, Task 6'dan sonra temizlenir).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/PriceList.svelte
git commit -m "feat(ui): PriceList aramada BIST100'den eklenebilir hisseler + '+ EKLE'"
```

---

## Task 6: +page kablolaması — onAddBist → store.addBist + seç

**Files:**
- Modify: `src/routes/+page.svelte:114-117` (`<PriceList ... />`)

- [ ] **Step 1: PriceList kullanımına `onAddBist` ekle**

`src/routes/+page.svelte` içindeki `<PriceList ... />` bloğunu şununla değiştir:

```svelte
					<PriceList
						prices={store.prices}
						onSelect={(id) => (selectedAssetId = id)}
						onAddBist={(symbol) => {
							store.addBist(symbol);
							selectedAssetId = symbol;
						}}
					/>
```

- [ ] **Step 2: Tip + derleme doğrula**

Run: `npm run check`
Expected: 0 hata/uyarı.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(ui): +page onAddBist kablolaması — seçilen BIST aktif sete eklenir+seçilir"
```

---

## Task 7: Final doğrulama

**Files:** Yok (yalnız doğrulama).

- [ ] **Step 1: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: PASS — 251 + yeni (~bist100 4 + liveAssets 2 + yahoo 1 + store 3 = ~261). Hiç başarısız yok.

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata, 0 uyarı.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Başarılı (`adapter-auto` üretim uyarısı bloklayıcı değil — bilinen açık iş).

- [ ] **Step 4: Manuel duman testi (opsiyonel, kullanıcı ortamında)**

Run: `npm run dev` → tarayıcı → BAŞLA → sol arama kutusuna "garanti"/"GARAN" yaz → "+ EKLE" → fiyat ≤20sn içinde gelir → seç → AL.
Expected: GARAN aktif listeye girer, canlı fiyat gelir, alınabilir.

- [ ] **Step 5: Verification-before-completion**

`superpowers:verification-before-completion` skill'i: test + check + build çıktılarını fiilen koştur ve yapıştır. Yeşil olmadan "tamam" deme.

---

## Self-Review (yazar tarafından koşuldu)

**1. Tasarım kapsamı:** ✅ Statik liste (T1) · aktif set + addBist (T4) · arama 100'den çeker (T5) · +page kablolama (T6). Fix-A (T4 3f) · Fix-B (T4 3h) · atomiklik/on-demand dayanıklılık (T3) · CATALOG-bağımsız fiyat (T4 3d — buy() on-demand sembolde patlamasın diye kritik).

**2. Placeholder taraması:** Yok — her kod adımı tam içerik taşır.

**3. Tip tutarlılığı:** `addBist(symbol: string)` arayüz (T4 3a) + impl (T4 3g) + dönüş (T4 3i) + çağrı (T5/T6) aynı imza. `onAddBist: (symbol: string) => void` PriceList Props (T5) ↔ +page (T6) eşleşir. `bistName`/`searchBist100`/`BIST100` (T1) → store (T4) + PriceList (T5) tüketir. `CRYPTO_SET`/`CORE_ASSETS` (T2) → store (T4). `PriceRow` alanları (id/label/category/source/priceTry/marketOpen/changePct) prices türevinde eksiksiz.

**4. Regresyon riski:** `prices` sıralaması değişti (CORE önce, BIST sonra) ama tüm store testleri `.find()` kullanır → etkilenmez. `pollMs` varsayılanı 20000 → test 7 stop sonrası no-call kontrolü, test 8 `pollMs:5000` override → ikisi de güvenli. `LIVE_ASSETS` import'u store'dan kaldırıldı → artık kullanılmıyor (prices türevi CORE_ASSETS+activeBist).
