# Canlı Veri Hibrit USD/TRY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** USD/TRY ve EUR'u gün-içi donuk er-api'den kurtarıp canlandır — Binance `usdttry@trade` WS canlı tick (birincil) + Yahoo `USDTRY=X`/`EURTRY=X` taban/fallback.

**Architecture:** Üç dosya: (1) `yahooSource.ts` er-api'yi söker, usdTry/EUR Yahoo'dan; (2) `binance.ts` feed'e `fxPairs`+`onFxRate` ekler (mevcut WS bağlantısına `usdttry@trade` stream'i); (3) `liveGameStore.svelte.ts` `liveUsdTry` state + `effectiveUsdTry()` birleştirme (WS canlı?WS:Yahoo) kuralı oracle/source/getter'a girer. Motor (reducer) DOKUNULMAZ.

**Tech Stack:** TypeScript (strict), Svelte 5 runes, Vitest. Spec: `docs/superpowers/specs/2026-06-08-canli-veri-hibrit-design.md`.

---

## Dosya Haritası

| Dosya | Sorumluluk | İşlem |
|---|---|---|
| `src/lib/api/yahooSource.ts` | Upstream FX fetcher | Modify: `fetchUsdRates` sil, `fetchFxValue` USDTRY=X/EURTRY=X |
| `src/routes/api/yahoo/server.test.ts` | yahooSource testleri | Modify: er-api mock'ları → Yahoo sembol mock'ları |
| `src/lib/api/binance.ts` | Binance WS feed | Modify: `fxPairs`+`onFxRate` ekle |
| `src/lib/api/binance.test.ts` | feed testleri | Modify: `emitFxTrade` + 2 yeni test |
| `src/lib/stores/liveGameStore.svelte.ts` | Reaktif store + oracle | Modify: `liveUsdTry`+`effectiveUsdTry()` |
| `src/lib/stores/liveGameStore.test.ts` | store testleri | Modify: 3 yeni hibrit testi |

---

## Task 1: yahooSource — er-api → Yahoo USDTRY=X / EURTRY=X

**Files:**
- Modify: `src/lib/api/yahooSource.ts`
- Test: `src/routes/api/yahoo/server.test.ts`

- [ ] **Step 1: Testleri Yahoo sembollerine güncelle (failing)**

`src/routes/api/yahoo/server.test.ts` içinde:

(a) İmport satırından `fetchUsdRates`'i çıkar:
```ts
import { fetchYahooPrice, fetchYahooQuote, fetchFxValue } from '$lib/api/yahooSource';
```

(b) `routedFetch()`'i er-api yerine FX sembollerine yönlendir:
```ts
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('USDTRY=X')) return okJson(yahooBody(40));            // usdTry 40
    if (url.includes('EURTRY=X')) return okJson(yahooBody(80, 76));        // EUR/TRY 80, +5.26%
    if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000));  // ons altın USD -> 100 USD/gram
    if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));        // ons gümüş USD -> 1 USD/gram
    if (url.includes('THYAO.IS')) return okJson(yahooBody(300, 240));      // +25%
    return okJson(yahooBody(1));
  }) as unknown as typeof fetch;
}
```

(c) `describe('fetchUsdRates', ...)` bloğunu **tamamen sil** (er-api kalktı).

(d) `fetchFxValue` testlerini güncelle — EUR artık doğrudan `EURTRY=X` fiyatı:
```ts
describe('fetchFxValue (birleşik TRY snapshot)', () => {
  it('BIST(TRY) + gram altın/gümüş(TRY) + EUR(TRY) + usdTry üretir', async () => {
    const v = await fetchFxValue(['THYAO'], routedFetch());
    expect(v.usdTry).toBe(40);
    expect(v.prices.THYAO).toBe(300);
    expect(v.prices.XAUGRAM).toBe(4000); // 100 USD/gram × 40
    expect(v.prices.XAGGRAM).toBe(40);   // 1 USD/gram × 40
    expect(v.prices.EUR).toBe(80);       // EURTRY=X doğrudan
  });

  it('change haritası: previousClose olan semboller için günlük % döner', async () => {
    const v = await fetchFxValue(['THYAO'], routedFetch());
    expect(v.change?.THYAO).toBe(25);                // (300-240)/240*100
    expect(v.change?.XAUGRAM).toBeCloseTo(3.69, 1);  // (3110.35-3000)/3000*100
    expect(v.change?.XAGGRAM).toBeUndefined();        // prevClose yok → atlanır
    expect(v.change?.EUR).toBeCloseTo(5.26, 1);      // (80-76)/76*100 → EUR rozeti (yeni)
  });

  it('geçersiz BIST sembolü tüm snapshot\'ı düşürmez — atlanır, diğerleri gelir', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('USDTRY=X')) return okJson(yahooBody(40));
      if (url.includes('EURTRY=X')) return okJson(yahooBody(80));
      if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000));
      if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));
      if (url.includes('THYAO.IS')) return okJson(yahooBody(300, 240));
      if (url.includes('ZZZZ.IS')) return Promise.resolve({ ok: false, status: 404 } as Response);
      return okJson(yahooBody(1));
    }) as unknown as typeof fetch;

    const v = await fetchFxValue(['THYAO', 'ZZZZ'], f);
    expect(v.prices.THYAO).toBe(300);
    expect(v.prices.ZZZZ).toBeUndefined();
    expect(v.usdTry).toBe(40);
    expect(v.prices.XAUGRAM).toBe(4000);
  });

  it('usdTry (USDTRY=X) hatası snapshot\'ı patlatır (atomik çekirdek)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('USDTRY=X')) return Promise.resolve({ ok: false, status: 503 } as Response);
      return okJson(yahooBody(1));
    }) as unknown as typeof fetch;
    await expect(fetchFxValue(['THYAO'], f)).rejects.toThrow();
  });

  it('EUR (EURTRY=X) hatası snapshot\'ı patlatmaz — EUR atlanır, gerisi gelir', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('USDTRY=X')) return okJson(yahooBody(40));
      if (url.includes('EURTRY=X')) return Promise.resolve({ ok: false, status: 503 } as Response);
      if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000));
      if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));
      if (url.includes('THYAO.IS')) return okJson(yahooBody(300, 240));
      return okJson(yahooBody(1));
    }) as unknown as typeof fetch;
    const v = await fetchFxValue(['THYAO'], f);
    expect(v.prices.EUR).toBeUndefined();  // EUR atlandı
    expect(v.usdTry).toBe(40);             // çekirdek ayakta
    expect(v.prices.THYAO).toBe(300);
  });
});
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `npm.cmd run test -- src/routes/api/yahoo/server.test.ts`
Expected: FAIL — `fetchUsdRates` import yok / `fetchFxValue` hâlâ er-api çağırıyor, EUR=80 yerine 80 gelmez (er-api mock kalktı → usdTry undefined).

- [ ] **Step 3: `yahooSource.ts`'i uygula**

(a) `fetchUsdRates` fonksiyonunu **tamamen sil** (satır 61-68).

(b) `fetchFxValue`'yu değiştir (satır 70-103 yerine):
```ts
/** BIST(TRY) + gram altın/gümüş(TRY) + EUR(TRY) + USD/TRY'yi tek snapshot'ta birleştirir.
 *  usdTry = Yahoo USDTRY=X (atomik çekirdek). EUR = Yahoo EURTRY=X (dayanıklı).
 *  Herhangi bir çekirdek (usdTry/metal) çağrısı patlarsa snapshot patlar (cache fallback'e düşer). */
export async function fetchFxValue(bist: readonly string[], fetchFn: typeof fetch): Promise<FxValue> {
  const usdQuote = await fetchYahooQuote('USDTRY=X', fetchFn); // atomik çekirdek (THE parite)
  const usdTry = usdQuote.price;
  const prices: Record<string, number> = {};
  const change: Record<string, number> = {};

  // Sembol-bazında dayanıklı: on-demand'de geçersiz/delisted sembol diğerlerini düşürmesin.
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

  const gold = await fetchYahooQuote('GC=F', fetchFn);   // COMEX altın USD/ons
  prices.XAUGRAM = round2((gold.price * usdTry) / TROY_OUNCE_GRAMS);
  if (gold.changePct !== undefined) change.XAUGRAM = gold.changePct;

  const silver = await fetchYahooQuote('SI=F', fetchFn); // COMEX gümüş USD/ons
  prices.XAGGRAM = round2((silver.price * usdTry) / TROY_OUNCE_GRAMS);
  if (silver.changePct !== undefined) change.XAGGRAM = silver.changePct;

  // EUR/TRY: dayanıklı (tek gösterim varlığı; patlarsa atlanır, snapshot ayakta kalır).
  try {
    const eur = await fetchYahooQuote('EURTRY=X', fetchFn);
    prices.EUR = round2(eur.price);
    if (eur.changePct !== undefined) change.EUR = eur.changePct;
  } catch (err) {
    console.warn('[yahooSource] EUR (EURTRY=X) atlandı:', err instanceof Error ? err.message : err);
  }

  return { usdTry: round2(usdTry), prices, change };
}
```

(c) Dosyanın başındaki `fetchUsdRates` JSDoc/yorumları da gittiyse sorun değil; başka referans yok (route `fetchUsdRates` import etmiyor).

- [ ] **Step 4: Testi çalıştır, geç**

Run: `npm.cmd run test -- src/routes/api/yahoo/server.test.ts`
Expected: PASS (tüm fetchFxValue + GET testleri yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/yahooSource.ts src/routes/api/yahoo/server.test.ts
git commit -m "feat(api): usdTry+EUR Yahoo USDTRY=X/EURTRY=X (er-api sokuldu)"
```

---

## Task 2: binance feed — fxPairs + onFxRate

**Files:**
- Modify: `src/lib/api/binance.ts`
- Test: `src/lib/api/binance.test.ts`

- [ ] **Step 1: FakeWS'e fx trade emit + 2 yeni test ekle (failing)**

`src/lib/api/binance.test.ts` içinde, `FakeWS` sınıfına `emitTrade`'in altına ekle:
```ts
  emitFxTrade(pair: string, price: number) {
    this.onmessage?.({
      data: JSON.stringify({ stream: `${pair.toLowerCase()}@trade`, data: { s: pair.toUpperCase(), p: String(price) } }),
    });
  }
```

`describe('createBinanceFeed', ...)` içine 2 yeni test ekle:
```ts
  it('fxPairs verilince @trade stream kurar (USDT eki YOK)', () => {
    createBinanceFeed({ symbols: ['BTC'], fxPairs: ['USDTTRY'], onPrice() {}, WebSocketImpl: FakeWS as any });
    expect(FakeWS.instances[0].url).toContain('btcusdt@trade');
    expect(FakeWS.instances[0].url).toContain('usdttry@trade');
  });
  it('fx çifti frame onFxRate tetikler, onPrice DEĞİL', () => {
    const prices: Array<[string, number]> = [];
    const fx: Array<[string, number]> = [];
    createBinanceFeed({
      symbols: ['BTC'], fxPairs: ['USDTTRY'],
      onPrice: (c, p) => prices.push([c, p]),
      onFxRate: (s, r) => fx.push([s, r]),
      WebSocketImpl: FakeWS as any,
    });
    FakeWS.instances[0].emitFxTrade('USDTTRY', 46.09);
    expect(fx).toEqual([['USDTTRY', 46.09]]);
    expect(prices).toEqual([]); // onPrice çağrılmadı
  });
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `npm.cmd run test -- src/lib/api/binance.test.ts`
Expected: FAIL — `usdttry@trade` stream URL'de yok; `onFxRate` tipi/çağrısı yok.

- [ ] **Step 3: `binance.ts`'i uygula**

(a) `BinanceFeedOptions` arayüzüne ekle (mevcut alanların yanına):
```ts
  fxPairs?: string[];                                  // ham çiftler ['USDTTRY'] → `${s}@trade`
  onFxRate?: (pair: string, rate: number) => void;     // fx çifti trade push'ında
```

(b) `createBinanceFeed` gövdesinde `streams` tanımını (satır 34) değiştir:
```ts
  const cryptoStreams = opts.symbols.map((s) => `${s.toLowerCase()}usdt@trade`);
  const fxStreams = (opts.fxPairs ?? []).map((s) => `${s.toLowerCase()}@trade`);
  const streams = [...cryptoStreams, ...fxStreams].join('/');
  const fxSet = new Set((opts.fxPairs ?? []).map((s) => s.toUpperCase()));
```

(c) `onmessage` handler'ında fiyat dağıtımını güncelle (satır 49-51):
```ts
        if (d?.s && d?.p !== undefined) {
          const sym = String(d.s);
          if (fxSet.has(sym)) {
            opts.onFxRate?.(sym, Number(d.p));
          } else {
            // USDT eki soyularak saf coin sembolü (BTC, ETH...) iletilir
            opts.onPrice(sym.replace(/USDT$/, ''), Number(d.p));
          }
        }
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `npm.cmd run test -- src/lib/api/binance.test.ts`
Expected: PASS (yeni 2 test + mevcut 8 test yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/binance.ts src/lib/api/binance.test.ts
git commit -m "feat(api): Binance feed fxPairs + onFxRate (usdttry@trade)"
```

---

## Task 3: store — liveUsdTry + effectiveUsdTry + feed wiring

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Test: `src/lib/stores/liveGameStore.test.ts`

- [ ] **Step 1: 3 hibrit testi ekle (failing)**

`src/lib/stores/liveGameStore.test.ts` içinde `describe('createLiveGameStore (USD-taban)', ...)` bloğunun sonuna ekle:
```ts
  it('hibrit: WS usdttry tick effectiveUsdTry\'ı günceller (Yahoo\'yu ezer)', async () => {
    const t = setup({ throttleMs: 0 });
    await t.store.start();
    t.feed.onStatus?.('live');
    t.feed.onFxRate?.('USDTTRY', 50);
    flushSync();
    expect(t.store.usdTry).toBe(50); // Yahoo 40 yerine WS 50
  });

  it('hibrit: WS stale olunca Yahoo usdTry\'a düşer', async () => {
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

  it('hibrit: liveUsdTry yokken Yahoo kullanılır (regresyon yok)', async () => {
    const t = setup();
    await t.store.start();
    t.feed.onStatus?.('live');
    flushSync();
    expect(t.store.usdTry).toBe(40);
  });
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `npm.cmd run test -- src/lib/stores/liveGameStore.test.ts`
Expected: FAIL — `onFxRate` feed options'ta yok; `usdTry` getter hâlâ `fxCache.usdTry` dönüyor (50 görmez).

- [ ] **Step 3: `liveGameStore.svelte.ts`'i uygula**

(a) Reaktif durum bloğuna ekle (satır 114 civarı, `activeBist`'in altına):
```ts
  // Hibrit USD/TRY: WS usdttry tick'i (birincil); yokken/stale'ken Yahoo'ya düşülür.
  let liveUsdTry = $state<number | undefined>(undefined);
```

(b) `source`/`oracle`'dan hemen önce `effectiveUsdTry` yardımcısını ekle (satır 116 civarı):
```ts
  // WS canlı + tick var → WS; aksi halde Yahoo (fxCache); o da yoksa FALLBACK_FX.usdTry.
  const effectiveUsdTry = (): number =>
    feedStatus === 'live' && liveUsdTry !== undefined ? liveUsdTry : fxCache.usdTry;
```

(c) `source` içinde iki yeri değiştir:
```ts
  const source: LivePriceSource = {
    usdTry: () => effectiveUsdTry(),
    assetTry: (id) => {
      if (CRYPTO_SET.has(id)) {
        const u = cryptoUsd[id];
        return u === undefined ? undefined : u * effectiveUsdTry();
      }
      return fxCache.prices[id];
    },
  };
```

(d) `oracle.assetUsd` BIST/emtia/döviz dalını değiştir (satır 141):
```ts
      return usd(t / effectiveUsdTry());
```

(e) `usdTry` getter'ı değiştir (satır 336-338):
```ts
    get usdTry() {
      return effectiveUsdTry();
    },
```

(f) Throttle flush'ı genelleştir — `flushCrypto` (satır 248-251) yerine:
```ts
  let pendingUsdTry: number | undefined = undefined;
  function flushPending(): void {
    if (Object.keys(pending).length > 0) {
      cryptoUsd = { ...cryptoUsd, ...pending };
      pending = {};
    }
    if (pendingUsdTry !== undefined) {
      liveUsdTry = pendingUsdTry;
      pendingUsdTry = undefined;
    }
  }
```

(g) `onPrice` içindeki iki `flushCrypto()` çağrısını `flushPending()` yap (satır 256 ve 262).

(h) `onStatus`'un (satır 266-268) hemen altına `onFxRate` ekle:
```ts
  function onFxRate(pair: string, rate: number): void {
    if (pair !== 'USDTTRY') return;
    pendingUsdTry = rate;
    if (throttleMs <= 0) {
      flushPending();
      return;
    }
    if (throttleTimer === null) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        flushPending();
      }, throttleMs);
    }
  }
```

(i) `start()` içinde feed kurulumunu güncelle (satır 299):
```ts
    feed = makeFeed({ symbols: [...CRYPTO_SYMBOLS], fxPairs: ['USDTTRY'], onPrice, onStatus, onFxRate });
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `npm.cmd run test -- src/lib/stores/liveGameStore.test.ts`
Expected: PASS (3 yeni hibrit testi + mevcut store testleri yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "feat(store): hibrit effectiveUsdTry (WS usdttry > Yahoo fallback)"
```

---

## Task 4: Tam doğrulama (test + check + build + canlı smoke)

**Files:** (yok — doğrulama)

- [ ] **Step 1: Tüm test paketi**

Run: `npm.cmd run test`
Expected: PASS, toplam test sayısı 247'den artmış (yeni: yahoo +2, binance +2, store +3).

- [ ] **Step 2: Tip kontrolü**

Run: `npm.cmd run check`
Expected: 0 hata, 0 uyarı.

- [ ] **Step 3: Build**

Run: `npm.cmd run build`
Expected: başarılı (adapter-auto uyarısı bloklayıcı değil).

- [ ] **Step 4: Canlı smoke — er-api gitti mi, USDTRY=X geliyor mu**

Dev sunucusu açıkken (`npm.cmd run dev`):
Run: `curl -s "http://localhost:5173/api/yahoo" | python -c "import sys,json; d=json.load(sys.stdin); print('usdTry:', d['value']['usdTry'], '| EUR:', d['value']['prices'].get('EUR'), '| EUR change:', d['value'].get('change',{}).get('EUR'), '| stale:', d['stale'])"`
Expected: `usdTry` ~46 (canlı), `EUR` ~53, `EUR change` bir sayı (rozet geldi), `stale: false`. er-api artık çağrılmıyor.

- [ ] **Step 5: Canlı smoke — WS usdttry akıyor mu (tarayıcı)**

Tarayıcıda `http://localhost:5173/` aç → DevTools Network → WS sekmesi → Binance stream'inde `usdttry@trade` frame'leri akıyor mu kontrol et. Cüzdan/PriceList'te dolar bazlı değerlerin saniyeler içinde mikro-oynadığını gözle.

- [ ] **Step 6: Final commit (gerekiyorsa — plan dosyası)**

```bash
git add docs/superpowers/plans/2026-06-08-canli-veri-hibrit.md
git commit -m "docs(plan): canli veri hibrit USD/TRY uygulama plani"
```

---

## Notlar

- **Motor (`gameState.ts`) DOKUNULMAZ** — değişiklik yalnız fx/api/store katmanında. `git diff src/lib/stores/gameState.ts` boş olmalı.
- **Kapsam dışı (Supabase fazı):** `?bist=` cache fix, deploy, hesaplar, leaderboard. BU PLANA GİRMEZ.
- **`fxPairs:['USDTTRY']` sabit** — v1 yalnız USD/TRY canlı tick. EUR Yahoo'dan yeterli (Binance EUR/TRY likiditesi düşük).
