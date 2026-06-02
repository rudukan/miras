# Eğlence Ölçütü — Minimum B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlı Çekirdek dilimine, "blurt" anına adil şans veren en küçük his katmanını eklemek: her varlık satırında **günlük %±X değişim rozeti**, durum bandında **"şu an"-lık göreli zaman**, ve **tek satır statik bağlam kartı** — arayüzü karıştırmadan.

**Architecture:** Veri katmanı (proxy fetcher'lar) zaten `value`/`asOf`/`stale` zarfını UI'a kadar taşıyor. Günlük değişim, mevcut zarfa **opsiyonel bir `change` haritası** olarak biner (Yahoo `previousClose`, Binance 24s `priceChangePercent`); route'lar değişmez (value'yu jenerik geçirir). Store bu haritayı `PriceRow.changePct`'e akıtır; saf `format.ts` helper'ları rozet/göreli-zaman metnini üretir; bileşenler sadece render eder. WS feed'e (en kırılgan katman) **dokunulmaz** — kripto değişim 5s poll'dan gelir.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes (`$state`/`$derived`) + TypeScript strict + Vitest. Para için `Money` tipi. Renkler `term.*` token'ları, font `font-mono`.

---

## Çalışma Notları (executor için)

- **PowerShell `.cmd` kuralı:** komutları `npm.cmd` / `npx.cmd` ile çağır (execution-policy `npm run dev`'i kırmızı-hata ile düşürüyor — bkz proje hafızası).
- **Tam doğrulama:** `npm.cmd run test` + `npm.cmd run check` + `npm.cmd run build` — üçü de yeşil olmadan "tamam" yok.
- **Tek dosya testi:** `npx.cmd vitest run <path>` (ör. `npx.cmd vitest run src/lib/components/format.test.ts`).
- **Başlangıç çizgisi:** 222 test yeşil, check 0/0, build ✅. Her task sonunda bu sayı artmalı, hiçbiri kırmızıya dönmemeli.
- **Mevcut testleri bozma:** `change` alanı **opsiyonel** (`change?`) — bu yüzden mevcut `FxValue`/`CryptoValue` literalleri (store testi, fx/binance testleri) derlemeyi bozmaz.

## Dosya Haritası (ne nerede değişir)

| Dosya | Sorumluluk | Değişim |
|---|---|---|
| `src/lib/api/types.ts` | Proxy değer tipleri | `FxValue.change?` + `CryptoValue.change?` eklenir |
| `src/lib/api/yahooSource.ts` | Yahoo+er-api çekimi | `fetchYahooQuote` (price+changePct) eklenir; `fetchFxValue` `change` üretir; `fetchYahooPrice` delegasyona iner; `YAHOO_FALLBACK.change` |
| `src/lib/api/cryptoSource.ts` | Binance REST çekimi | `fetchBinanceTicker` (24s) eklenir; `fetchCryptoValue` `change` üretir; `CRYPTO_FALLBACK.change` |
| `src/lib/stores/liveGameStore.svelte.ts` | Reaktif store | `cryptoChange` state + `pollFx` her zaman değişim çeker + `PriceRow.changePct` + `prices` derived |
| `src/lib/components/format.ts` | Saf gösterim helper'ları | `dailyChangeBadge` + `relativeTime` eklenir |
| `src/lib/components/PriceList.svelte` | Fiyat listesi | satıra değişim rozeti |
| `src/lib/components/StatusBadge.svelte` | Durum bandı | `now` prop + göreli zaman etiketi |
| `src/routes/+page.svelte` | Sayfa kabuğu | 1s `nowMs` tick + `ContextCard` render |
| `src/lib/data/contextCard.ts` | Statik bağlam metni | **yeni** |
| `src/lib/components/ContextCard.svelte` | Bağlam kartı render | **yeni** |

**Route'lar (`+server.ts`) DEĞİŞMEZ:** `change` haritası `value`'nun içinde jenerik olarak serialize olur.

---

## Task 1: Yahoo günlük değişim verisi (proxy katmanı)

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/yahooSource.ts`
- Test: `src/routes/api/yahoo/server.test.ts`

- [ ] **Step 1: `FxValue`'ya opsiyonel `change` ekle**

`src/lib/api/types.ts` içinde `FxValue` arayüzünü güncelle:

```ts
/** Yahoo proxy değeri: tüm fiyatlar TRY; ayrıca canlı USD/TRY mid kuru.
 *  (liveFx sözleşmesi: assetTry hep TRY — bkz Plan 1.) */
export interface FxValue {
  usdTry: number;
  prices: Record<string, number>; // TRY: BIST sembolleri + XAUGRAM + XAGGRAM + EUR
  change?: Record<string, number>; // günlük % değişim (önceki kapanışa göre); yoksa sembol atlanır
}
```

- [ ] **Step 2: Başarısız testi yaz — `fetchYahooQuote` price + changePct döner**

`src/routes/api/yahoo/server.test.ts` dosyasının başındaki import'a `fetchYahooQuote` ekle:

```ts
import { fetchYahooPrice, fetchYahooQuote, fetchUsdRates, fetchFxValue } from '$lib/api/yahooSource';
```

`yahooBody` helper'ını previousClose alacak şekilde genişlet (eski çağrılar geriye uyumlu — 2. argüman opsiyonel):

```ts
function yahooBody(price: number, previousClose?: number) {
  return { chart: { result: [{ meta: { regularMarketPrice: price, previousClose } }] } };
}
```

`describe('fetchYahooPrice'...)` bloğunun hemen ardına yeni blok ekle:

```ts
describe('fetchYahooQuote', () => {
  it('previousClose verilince changePct hesaplar', async () => {
    const f = vi.fn(() => okJson(yahooBody(110, 100))) as unknown as typeof fetch;
    const q = await fetchYahooQuote('THYAO.IS', f);
    expect(q.price).toBe(110);
    expect(q.changePct).toBe(10); // (110-100)/100*100
  });
  it('previousClose yoksa changePct undefined', async () => {
    const f = vi.fn(() => okJson(yahooBody(110))) as unknown as typeof fetch;
    const q = await fetchYahooQuote('THYAO.IS', f);
    expect(q.price).toBe(110);
    expect(q.changePct).toBeUndefined();
  });
});
```

- [ ] **Step 3: Testin kırmızı olduğunu doğrula**

Run: `npx.cmd vitest run src/routes/api/yahoo/server.test.ts`
Expected: FAIL — `fetchYahooQuote is not a function`.

- [ ] **Step 4: `fetchYahooQuote` ekle, `fetchYahooPrice`'ı delegasyona indir**

`src/lib/api/yahooSource.ts` içinde mevcut `fetchYahooPrice` fonksiyonunu **şununla değiştir**:

```ts
/** Yahoo chart API'sinden tek sembolün son fiyatı + günlük % değişimi.
 *  changePct = (fiyat − previousClose) / previousClose × 100 (yoksa undefined). */
export async function fetchYahooQuote(
  symbol: string,
  fetchFn: typeof fetch,
): Promise<{ price: number; changePct: number | undefined }> {
  const res = await fetchFn(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1m`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  const j = (await res.json()) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: unknown; previousClose?: unknown; chartPreviousClose?: unknown } }> };
  };
  const meta = j?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== 'number') throw new Error(`Yahoo ${symbol}: geçersiz yapı`);
  const prev =
    typeof meta?.previousClose === 'number' ? meta.previousClose
    : typeof meta?.chartPreviousClose === 'number' ? meta.chartPreviousClose
    : undefined;
  const changePct = prev && prev !== 0 ? round2(((price - prev) / prev) * 100) : undefined;
  return { price, changePct };
}

/** Yalnız fiyat (geriye uyumluluk; fetchYahooQuote'a delegeler). */
export async function fetchYahooPrice(symbol: string, fetchFn: typeof fetch): Promise<number> {
  return (await fetchYahooQuote(symbol, fetchFn)).price;
}
```

- [ ] **Step 5: Yeni testin yeşil, eski `fetchYahooPrice` testlerinin hâlâ yeşil olduğunu doğrula**

Run: `npx.cmd vitest run src/routes/api/yahoo/server.test.ts`
Expected: PASS (fetchYahooQuote 2 yeni + fetchYahooPrice 3 eski + diğerleri).

- [ ] **Step 6: Başarısız testi yaz — `fetchFxValue` `change` haritası üretir**

Aynı dosyada `describe('fetchFxValue ...')` bloğunun içine yeni `it` ekle. Önce `routedFetch`'i previousClose verecek şekilde güncelle (mevcut `yahooBody` çağrılarına 2. argüman ekle):

```ts
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('open.er-api.com')) return okJson({ rates: { TRY: 40, EUR: 0.5 } });
    if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000)); // ons altın
    if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));        // ons gümüş (prevClose yok)
    if (url.includes('THYAO.IS')) return okJson(yahooBody(300, 240));      // +25%
    return okJson(yahooBody(1));
  }) as unknown as typeof fetch;
}
```

`describe('fetchFxValue ...')` içine:

```ts
it('change haritası: previousClose olan semboller için günlük % döner', async () => {
  const v = await fetchFxValue(['THYAO'], routedFetch());
  expect(v.change?.THYAO).toBe(25);   // (300-240)/240*100
  expect(v.change?.XAUGRAM).toBeCloseTo(3.69, 1); // (3110.35-3000)/3000*100
  expect(v.change?.XAGGRAM).toBeUndefined();       // prevClose yok → atlanır
});
```

- [ ] **Step 7: Testin kırmızı olduğunu doğrula**

Run: `npx.cmd vitest run src/routes/api/yahoo/server.test.ts`
Expected: FAIL — `v.change` undefined.

- [ ] **Step 8: `fetchFxValue`'yu `change` üretecek şekilde güncelle + `YAHOO_FALLBACK.change`**

`src/lib/api/yahooSource.ts`'te `YAHOO_FALLBACK`'e `change: {}` ekle:

```ts
export const YAHOO_FALLBACK: FxValue = {
  usdTry: 40,
  prices: {
    THYAO: 288, EREGL: 38.68, ASELS: 410, GUBRF: 544.5, KCHOL: 190.2,
    TUPRS: 243.1, SASA: 2.65, YKBNK: 32.86, BIMAS: 392.75,
    XAUGRAM: 4000, XAGGRAM: 40, EUR: 43,
  },
  change: {},
};
```

`fetchFxValue`'yu **şununla değiştir** (quote kullanır, `change` toplar):

```ts
export async function fetchFxValue(bist: readonly string[], fetchFn: typeof fetch): Promise<FxValue> {
  const rates = await fetchUsdRates(fetchFn);
  const usdTry = rates.TRY;
  const prices: Record<string, number> = {};
  const change: Record<string, number> = {};

  await Promise.all(
    bist.map(async (sym) => {
      const q = await fetchYahooQuote(`${sym}.IS`, fetchFn);
      prices[sym] = round2(q.price);
      if (q.changePct !== undefined) change[sym] = q.changePct;
    }),
  );

  const gold = await fetchYahooQuote('GC=F', fetchFn);   // COMEX altın USD/ons
  prices.XAUGRAM = round2((gold.price * usdTry) / TROY_OUNCE_GRAMS);
  if (gold.changePct !== undefined) change.XAUGRAM = gold.changePct;

  const silver = await fetchYahooQuote('SI=F', fetchFn); // COMEX gümüş USD/ons
  prices.XAGGRAM = round2((silver.price * usdTry) / TROY_OUNCE_GRAMS);
  if (silver.changePct !== undefined) change.XAGGRAM = silver.changePct;

  if (rates.EUR) prices.EUR = round2(usdTry / rates.EUR); // EUR/TRY (er-api değişim vermez → change yok)

  return { usdTry: round2(usdTry), prices, change };
}
```

> Not: XAUGRAM/XAGGRAM değişimi, dayanak enstrümanın (ons altın/gümüş USD) kendi günlük %'sidir; gram-TRY hareketinin baskın bileşeni budur. usdTry gün-içi etkisi v1'de ihmal edilir (spec §4.2 "küçük ama gerçek").

- [ ] **Step 9: Tüm Yahoo testlerinin yeşil olduğunu doğrula**

Run: `npx.cmd vitest run src/routes/api/yahoo/server.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/yahooSource.ts src/routes/api/yahoo/server.test.ts
git commit -m "feat(api): Yahoo günlük % değişim — fetchYahooQuote + FxValue.change

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Kripto günlük değişim verisi (proxy katmanı)

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/cryptoSource.ts`
- Test: `src/routes/api/crypto/server.test.ts`

- [ ] **Step 1: `CryptoValue`'ya opsiyonel `change` ekle**

`src/lib/api/types.ts`:

```ts
/** Binance proxy değeri: tüm fiyatlar USD (USDT). TRY çevrimi store'da yapılır. */
export interface CryptoValue {
  prices: Record<string, number>; // USD
  change?: Record<string, number>; // 24s % değişim (Binance priceChangePercent); yoksa atlanır
}
```

- [ ] **Step 2: Başarısız testi yaz — `fetchBinanceTicker` + `fetchCryptoValue.change`**

`src/routes/api/crypto/server.test.ts` import'una `fetchBinanceTicker` ekle:

```ts
import { fetchBinancePrice, fetchBinanceTicker, fetchCryptoValue } from '$lib/api/cryptoSource';
```

`routedFetch`'i hem `/ticker/price` (`price`) hem `/ticker/24hr` (`lastPrice`+`priceChangePercent`) alanlarını verecek şekilde güncelle:

```ts
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('BTCUSDT'))
      return okJson({ symbol: 'BTCUSDT', price: '95000.50', lastPrice: '95000.50', priceChangePercent: '2.5' });
    if (url.includes('ETHUSDT'))
      return okJson({ symbol: 'ETHUSDT', price: '3300.10', lastPrice: '3300.10', priceChangePercent: '-1.2' });
    return okJson({ symbol: '?', price: '1', lastPrice: '1', priceChangePercent: '0' });
  }) as unknown as typeof fetch;
}
```

`describe('fetchBinancePrice'...)` ardına yeni blok + `fetchCryptoValue` testine change assertion ekle:

```ts
describe('fetchBinanceTicker', () => {
  it('24s ticker: lastPrice + priceChangePercent döner', async () => {
    const t = await fetchBinanceTicker('BTC', routedFetch());
    expect(t.price).toBe(95000.5);
    expect(t.changePct).toBe(2.5);
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 429 } as Response)) as unknown as typeof fetch;
    await expect(fetchBinanceTicker('BTC', f)).rejects.toThrow('429');
  });
});
```

Mevcut `describe('fetchCryptoValue'...)` içindeki tek `it`'i **değiştir**:

```ts
describe('fetchCryptoValue', () => {
  it('istenen coinleri USD fiyat + 24s değişimle döner', async () => {
    const v = await fetchCryptoValue(['BTC', 'ETH'], routedFetch());
    expect(v.prices).toEqual({ BTC: 95000.5, ETH: 3300.1 });
    expect(v.change).toEqual({ BTC: 2.5, ETH: -1.2 });
  });
});
```

- [ ] **Step 3: Testin kırmızı olduğunu doğrula**

Run: `npx.cmd vitest run src/routes/api/crypto/server.test.ts`
Expected: FAIL — `fetchBinanceTicker is not a function` / `v.change` undefined.

- [ ] **Step 4: `fetchBinanceTicker` ekle, `fetchCryptoValue`'yu güncelle, `CRYPTO_FALLBACK.change`**

`src/lib/api/cryptoSource.ts`'te `CRYPTO_FALLBACK`'e `change: {}` ekle:

```ts
export const CRYPTO_FALLBACK: CryptoValue = { prices: { BTC: 95000, ETH: 3300, SOL: 200 }, change: {} };
```

`fetchBinancePrice`'ı **olduğu gibi bırak** (geriye uyumlu utility). Hemen ardına ekle ve `fetchCryptoValue`'yu **değiştir**:

```ts
/** Binance 24s ticker'dan tek coin'in son fiyatı (USD) + 24s % değişimi. */
export async function fetchBinanceTicker(
  coin: string,
  fetchFn: typeof fetch,
): Promise<{ price: number; changePct: number }> {
  const res = await fetchFn(`https://api.binance.com/api/v3/ticker/24hr?symbol=${coin}USDT`);
  if (!res.ok) throw new Error(`Binance ${coin}: HTTP ${res.status}`);
  const j = (await res.json()) as { lastPrice?: unknown; priceChangePercent?: unknown };
  const price = Number(j?.lastPrice);
  if (!Number.isFinite(price)) throw new Error(`Binance ${coin}: geçersiz fiyat`);
  const changePct = Number(j?.priceChangePercent);
  return { price, changePct: Number.isFinite(changePct) ? changePct : 0 };
}

/** İstenen coinleri tek snapshot'ta (USD fiyat + 24s % değişim) birleştirir. Atomik. */
export async function fetchCryptoValue(coins: readonly string[], fetchFn: typeof fetch): Promise<CryptoValue> {
  const prices: Record<string, number> = {};
  const change: Record<string, number> = {};
  await Promise.all(
    coins.map(async (c) => {
      const t = await fetchBinanceTicker(c, fetchFn);
      prices[c] = t.price;
      change[c] = t.changePct;
    }),
  );
  return { prices, change };
}
```

- [ ] **Step 5: Tüm kripto testlerinin yeşil olduğunu doğrula**

Run: `npx.cmd vitest run src/routes/api/crypto/server.test.ts`
Expected: PASS (fetchBinancePrice 3 eski + fetchBinanceTicker 2 yeni + fetchCryptoValue 1 + GET 2).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/cryptoSource.ts src/routes/api/crypto/server.test.ts
git commit -m "feat(api): Binance 24s % değişim — fetchBinanceTicker + CryptoValue.change

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Store — değişim verisini `PriceRow`'a akıt

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Test: `src/lib/stores/liveGameStore.test.ts`

- [ ] **Step 1: Başarısız testi yaz — günlük % prices satırlarına akar**

`src/lib/stores/liveGameStore.test.ts` içinde son `it('8) ...')`'in ardına (describe bloğu kapanmadan) ekle:

```ts
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
```

- [ ] **Step 2: Testin kırmızı olduğunu doğrula**

Run: `npx.cmd vitest run src/lib/stores/liveGameStore.test.ts`
Expected: FAIL — `Property 'changePct' does not exist on type 'PriceRow'` (veya undefined).

- [ ] **Step 3: `PriceRow`'a `changePct` ekle**

`src/lib/stores/liveGameStore.svelte.ts` içinde `PriceRow` arayüzünü güncelle:

```ts
/** PriceList satırı — canlı katalog fiyatı + market-açık rozeti + günlük % değişim. */
export interface PriceRow {
  id: string;
  label: string;
  category: AssetCategory;
  source: 'crypto' | 'yahoo';
  priceTry: number | undefined; // canlı fiyat yoksa undefined
  marketOpen: boolean;
  changePct: number | undefined; // günlük/24s % değişim; yoksa undefined (rozet gösterilmez)
}
```

- [ ] **Step 4: `cryptoChange` state'i ekle**

Aynı dosyada, `let cryptoUsd = $state<...>({});` satırının hemen ardına ekle:

```ts
let cryptoChange = $state<Record<string, number>>({}); // coin → 24s % (poll'dan; WS değişim taşımaz)
```

- [ ] **Step 5: `prices` derived'ına `changePct` ekle**

`const prices = $derived.by<PriceRow[]>(...)` bloğunu **şununla değiştir**:

```ts
const prices = $derived.by<PriceRow[]>(() => {
  const at = new Date(now());
  return LIVE_ASSETS.map((m) => ({
    id: m.id,
    label: m.label,
    category: m.category,
    source: m.source,
    priceTry: source.assetTry(m.id),
    marketOpen: isMarketOpen(m.category, at),
    changePct: m.source === 'crypto' ? cryptoChange[m.id] : fxCache.change?.[m.id],
  }));
});
```

- [ ] **Step 6: `pollFx`'i değişimi her zaman çekecek şekilde güncelle**

`async function pollFx()` gövdesindeki kripto fallback bloğunu **şununla değiştir** (fx çekim kısmı aynen kalır; yalnız `if (feedStatus === 'stale') { ...crypto... }` bloğunu değiştiriyoruz):

```ts
  // Kripto: 24s % değişim WS'te yok → her poll'da proxy snapshot'undan tazelenir.
  // Fiyatı yalnız WS kopukken snapshot'tan al (WS canlıyken fiyat otoritesi WS'tedir).
  try {
    const c = await fetchCryptoSnapshot({ coins: [...CRYPTO_SYMBOLS], fetchFn });
    cryptoChange = c.value.change ?? {};
    if (feedStatus === 'stale') {
      cryptoUsd = { ...cryptoUsd, ...c.value.prices };
    }
  } catch {
    /* fallback başarısız — sessiz; fxStale/dataStale zaten "veri eski" yüzeyliyor */
  }
```

- [ ] **Step 7: Yeni + mevcut store testlerinin yeşil olduğunu doğrula**

Run: `npx.cmd vitest run src/lib/stores/liveGameStore.test.ts`
Expected: PASS (8 mevcut + 1 yeni = 9). Özellikle test 5 (`toHaveBeenCalledWith('/api/crypto?coins=BTC,ETH')`) ve test 7 (stop) hâlâ yeşil olmalı.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "feat(live): günlük % değişim store'dan PriceRow.changePct'e akar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: format helper'ları — değişim rozeti + göreli zaman

**Files:**
- Modify: `src/lib/components/format.ts`
- Test: `src/lib/components/format.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/lib/components/format.test.ts` import satırını güncelle:

```ts
import { displayTry, displayUsd, pnlClass, signedPercent, marketBadge, signedUsd, dailyChangeBadge, relativeTime } from './format';
```

Dosyanın sonuna ekle:

```ts
// ── dailyChangeBadge ────────────────────────────────────────────────────────────
describe('dailyChangeBadge', () => {
  it('undefined → null (rozet yok)', () => {
    expect(dailyChangeBadge(undefined)).toBeNull();
  });
  it('pozitif → +%, term-green', () => {
    expect(dailyChangeBadge(2.5)).toEqual({ text: '+2.50%', cls: 'text-term-green' });
  });
  it('negatif → eksi, term-red', () => {
    expect(dailyChangeBadge(-1.2)).toEqual({ text: '-1.20%', cls: 'text-term-red' });
  });
  it('sıfır → +0.00%, nötr', () => {
    expect(dailyChangeBadge(0)).toEqual({ text: '+0.00%', cls: 'text-term-text' });
  });
});

// ── relativeTime ────────────────────────────────────────────────────────────────
describe('relativeTime', () => {
  it('asOf=0 → —', () => {
    expect(relativeTime(0, 10_000)).toBe('—');
  });
  it('<5sn → az önce', () => {
    expect(relativeTime(10_000, 12_000)).toBe('az önce');
  });
  it('saniye aralığı → N sn önce', () => {
    expect(relativeTime(10_000, 40_000)).toBe('30 sn önce');
  });
  it('dakika aralığı → N dk önce', () => {
    expect(relativeTime(0 + 1, 120_001)).toBe('2 dk önce');
  });
  it('saat aralığı → N sa önce', () => {
    expect(relativeTime(1, 7_200_001)).toBe('2 sa önce');
  });
});
```

- [ ] **Step 2: Testlerin kırmızı olduğunu doğrula**

Run: `npx.cmd vitest run src/lib/components/format.test.ts`
Expected: FAIL — `dailyChangeBadge is not a function`.

- [ ] **Step 3: Helper'ları ekle**

`src/lib/components/format.ts` sonuna ekle:

```ts
/**
 * Günlük/24s % değişim rozeti.
 * undefined → null (rozet gösterilmez); +2.5 → {text:'+2.50%', green};
 * -1.2 → {text:'-1.20%', red}; 0 → {text:'+0.00%', nötr}.
 */
export function dailyChangeBadge(pct: number | undefined): { text: string; cls: string } | null {
	if (pct === undefined) return null;
	const sign = pct >= 0 ? '+' : '';
	return { text: `${sign}${pct.toFixed(2)}%`, cls: pnlClass(pct) };
}

/**
 * "Şu an"-lık göreli zaman etiketi (durum bandı).
 * asOf<=0 → '—'; <5sn → 'az önce'; <60sn → 'N sn önce'; <60dk → 'N dk önce'; üstü → 'N sa önce'.
 */
export function relativeTime(asOf: number, now: number): string {
	if (asOf <= 0) return '—';
	const sec = Math.max(0, Math.floor((now - asOf) / 1000));
	if (sec < 5) return 'az önce';
	if (sec < 60) return `${sec} sn önce`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min} dk önce`;
	return `${Math.floor(min / 60)} sa önce`;
}
```

- [ ] **Step 4: Testlerin yeşil olduğunu doğrula**

Run: `npx.cmd vitest run src/lib/components/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/format.ts src/lib/components/format.test.ts
git commit -m "feat(ui): format helper'ları — dailyChangeBadge + relativeTime

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: PriceList — değişim rozetini render et

**Files:**
- Modify: `src/lib/components/PriceList.svelte`

> Not: Bu dilimde bileşenler jsdom unit testi almıyor (Plan 3-THIN kararı). Doğrulama: `npm.cmd run check` (tip) + `npm.cmd run build` + smoke. Mantık zaten Task 4'te test edildi.

- [ ] **Step 1: `dailyChangeBadge` import et**

`src/lib/components/PriceList.svelte` script'inde import satırını güncelle:

```ts
import { displayTry, marketBadge, dailyChangeBadge } from './format';
```

- [ ] **Step 2: Satırda rozeti hesapla ve render et**

`{#each filtered as row (row.id)}` içindeki `{@const badge = marketBadge(row.marketOpen)}` satırının hemen ardına ekle:

```svelte
				{@const chg = dailyChangeBadge(row.changePct)}
```

Sağ kolondaki fiyat bloğunu **şununla değiştir** (fiyat altına: değişim rozeti + market rozeti yan yana):

```svelte
						<!-- Sağ: fiyat + günlük değişim + market rozeti -->
						<div class="flex flex-col items-end shrink-0">
							<span class="text-term-green font-bold">
								{displayTry(row.priceTry)}
							</span>
							<div class="flex items-center gap-2">
								{#if chg}
									<span class="text-[10px] {chg.cls} font-bold">{chg.text}</span>
								{/if}
								<span class="text-[10px] {badge.cls}">
									{badge.text}
								</span>
							</div>
						</div>
```

- [ ] **Step 3: Tip + build doğrula**

Run: `npm.cmd run check`
Expected: 0 hata/uyarı.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/PriceList.svelte
git commit -m "feat(ui): PriceList satırına günlük % değişim rozeti

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: StatusBadge — "şu an"-lık göreli zaman

**Files:**
- Modify: `src/lib/components/StatusBadge.svelte`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: StatusBadge'e `now` prop + göreli etiket**

`src/lib/components/StatusBadge.svelte` script bloğunu **şununla değiştir**:

```svelte
<script lang="ts">
	import { relativeTime } from './format';

	interface Props {
		stale: boolean;
		asOf: number;
		feedStatus: 'live' | 'stale';
		now: number;
	}

	let { stale, asOf, feedStatus, now }: Props = $props();

	const timeLabel = $derived(relativeTime(asOf, now));

	const dotColor = $derived(stale ? 'text-term-amber' : 'text-term-green');
	const dotGlow = $derived(stale ? '' : 'glow-text-green');
	const statusText = $derived(stale ? 'VERİ ESKİ' : 'CANLI');
	const feedLabel = $derived(feedStatus === 'live' ? 'canlı' : 'kopuk');
	const feedColor = $derived(feedStatus === 'live' ? 'text-term-green' : 'text-term-amber');
</script>
```

Markup'taki "Son güncelleme" satırını **şununla değiştir** (etiket aynı, değer artık göreli):

```svelte
	<span class="text-term-text">
		Son güncelleme: <span class="text-term-blue">{timeLabel}</span>
	</span>
```

- [ ] **Step 2: +page'de 1s `nowMs` tik'i kur ve prop'u geç**

`src/routes/+page.svelte` script'inde, `let selectedAssetId = ...` satırının ardına ekle:

```ts
	let nowMs = $state(Date.now());
	let tick: ReturnType<typeof setInterval> | null = null;
```

`handleStart` fonksiyonunu **şununla değiştir** (tek 1s tik; yalnız `$state` yazar — DOM manipülasyonu yok, CLAUDE.md uyumlu):

```ts
	function handleStart() {
		store.setPeriod(selectedPeriod);
		if (browser) {
			void store.start();
			tick = setInterval(() => (nowMs = Date.now()), 1000);
		}
		phase = 'playing';
	}
```

`onDestroy`'ı **şununla değiştir**:

```ts
	onDestroy(() => {
		store.stop();
		if (tick) clearInterval(tick);
	});
```

`<StatusBadge ... />` çağrısına `now` prop'u ekle:

```svelte
				<StatusBadge
					stale={store.dataStale}
					asOf={store.asOf}
					feedStatus={store.feedStatus}
					now={nowMs}
				/>
```

- [ ] **Step 3: Tip doğrula**

Run: `npm.cmd run check`
Expected: 0 hata/uyarı.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/StatusBadge.svelte src/routes/+page.svelte
git commit -m "feat(ui): StatusBadge göreli zaman — 'şu an'-lık (1s tik)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Statik bağlam kartı

**Files:**
- Create: `src/lib/data/contextCard.ts`
- Create: `src/lib/components/ContextCard.svelte`
- Create: `src/lib/data/contextCard.test.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Başarısız testi yaz**

`src/lib/data/contextCard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONTEXT_CARD } from './contextCard';

describe('CONTEXT_CARD', () => {
	it('boş olmayan, tek satır küratörlü bağlam', () => {
		expect(CONTEXT_CARD.trim().length).toBeGreaterThan(0);
		expect(CONTEXT_CARD).not.toContain('\n');
	});
});
```

- [ ] **Step 2: Testin kırmızı olduğunu doğrula**

Run: `npx.cmd vitest run src/lib/data/contextCard.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: Veri modülünü oluştur**

`src/lib/data/contextCard.ts`:

```ts
/**
 * Statik, küratörlü tek-satır bağlam (spec §4.3) — haber şeridi DEĞİL.
 * v1: elle güncellenen tek cümle; oyuncuya "şu an"-lık ortamı sezdirir.
 * (Canlı haber yüzeyleme sonraki katman; burada API yok.)
 */
export const CONTEXT_CARD = 'Dolar tarihi zirveye yakın · borsa rekor denemesinde · altın yüksek seyirde';
```

- [ ] **Step 4: Testin yeşil olduğunu doğrula**

Run: `npx.cmd vitest run src/lib/data/contextCard.test.ts`
Expected: PASS.

- [ ] **Step 5: Bileşeni oluştur**

`src/lib/components/ContextCard.svelte`:

```svelte
<script lang="ts">
	import { CONTEXT_CARD } from '$lib/data/contextCard';
</script>

<div class="px-3 py-1 bg-term-panel border-x border-b border-term-border text-[11px] font-mono text-term-amber">
	<span class="opacity-50 uppercase tracking-wide mr-2 text-[10px]">bağlam</span>{CONTEXT_CARD}
</div>
```

- [ ] **Step 6: +page header'a ekle**

`src/routes/+page.svelte`'te import ekle (diğer bileşen import'larının yanına):

```ts
	import ContextCard from '$lib/components/ContextCard.svelte';
```

`<header class="shrink-0">` içinde, `</StatusBadge>` kapanışından (yani `/>`'den) hemen sonra, `</header>`'dan önce `<ContextCard />` ekle:

```svelte
			<header class="shrink-0">
				<StatusBadge
					stale={store.dataStale}
					asOf={store.asOf}
					feedStatus={store.feedStatus}
					now={nowMs}
				/>
				<ContextCard />
			</header>
```

- [ ] **Step 7: Tip + build doğrula**

Run: `npm.cmd run check`
Expected: 0 hata/uyarı.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/contextCard.ts src/lib/data/contextCard.test.ts src/lib/components/ContextCard.svelte src/routes/+page.svelte
git commit -m "feat(ui): statik tek-satır bağlam kartı (spec §4.3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final Doğrulama

- [ ] **Tam test + tip + build**

```
npm.cmd run test
npm.cmd run check
npm.cmd run build
```

Expected: test sayısı 222 → **~233** (+2 fetchYahooQuote, +1 fetchFxValue change, +2 fetchBinanceTicker, +1 fetchCryptoValue change, +1 store, +4 dailyChangeBadge, +5 relativeTime, +1 contextCard). check 0/0. build ✅.

- [ ] **Smoke (canlı veri + his katmanı)**

```
npm.cmd run dev
```

Tarayıcıda: BAŞLA → playing ekranı. Gözlemle:
1. Durum bandı: "● CANLI · Son güncelleme: az önce / N sn önce" (1s'de tazeleniyor).
2. Bağlam kartı bandın hemen altında tek satır.
3. Fiyat listesinde her satırda fiyat altında **+%/−% rozeti** (yeşil/kırmızı), market rozetinin yanında. (EUR satırında rozet olmayabilir — beklenen: er-api değişim vermez.)

> Bu, spec §5 "oyna-ve-gözlemle" protokolünün **ön-koşuludur**; protokolün kendisi (soğuk açılış → 60sn → blurt hükmü) plan tamamlandıktan sonra ayrı bir adımdır.

---

## Kapsam DIŞI (spec §4 SERT KURAL — eklenmeyecek)

Çoklu grafik · haber şeridi · gelişmiş emir tipleri · sekmeler · "haklı çıkma"/canlı-olay anları · leaderboard · yeni panel. NetWorthMirror sustain döngüsü **zaten** 1M$ çapasını (renk + "USD Tutsaydın") taşıyor — değiştirilmez.

---

## Self-Review (yazım sonrası kontrol)

**Spec kapsamı:**
- §4.1 "şu an"-lık → Task 6 (göreli zaman) ✅
- §4.2 %±X günlük değişim → Task 1+2 (veri) + Task 3 (akış) + Task 4+5 (rozet) ✅
- §4.3 statik bağlam kartı → Task 7 ✅
- §4 sustain döngüsü (NetWorthMirror) → mevcut, korunur (değişiklik yok) ✅
- §4 veri bağımlılığı notu (Yahoo previousClose / Binance priceChangePercent) → Task 1+2 ✅

**Tip tutarlılığı:** `change?: Record<string, number>` (types) → `fxCache.change?.[id]` / `cryptoChange[id]` (store) → `PriceRow.changePct` → `dailyChangeBadge(row.changePct)` (UI). `fetchYahooQuote`/`fetchBinanceTicker` adları tüm task'larda tutarlı.

**Placeholder taraması:** Yok — her adımda tam kod var.

**Risk notu:** En kırılgan katman (Binance WS feed) bu planda **dokunulmadı**; kripto değişim 5s poll'dan gelir (24s % yavaş değişir, 5s tazeleme yeterli). Mevcut 222 testin hiçbiri kontrat değişikliği görmez (`change` opsiyonel).
