# Canlı Çekirdek — Plan 2: API & Proxy Katmanı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlı fiyatı güvenli, önbellekli ve fallback'li biçimde tarayıcıya taşıyan veri katmanını kur — Yahoo (BIST + gram altın/gümüş + USD/TRY + EUR) ve Binance (kripto) için 5s server-cache'li proxy endpoint'leri + bunları tüketen, "veri eski" durumunu yüzeye çıkaran client'lar — Plan 1 `liveFx.ts` seam'ini besleyecek `LivePriceSource` verisini üretir.

**Architecture:** İki katman. **Server proxy** (`src/routes/api/yahoo`, `src/routes/api/crypto`) upstream API'leri çağırır, TTL'li hata-toleranslı önbellekten geçirir, `Cached<T> = {value, asOf, stale}` zarfıyla döner. **Client** (`src/lib/api/fx.ts`, `binance.ts`) kendi proxy'mizi tüketir; kripto için Binance WS canlı push + poll fallback primitifi sunar. Tüm çekirdek mantık enjekte edilebilir `fetch`/`WebSocket` ile saf ve %100 mock'la test edilebilir. **Bu plan domain veya store/UI'a dokunmaz** — `liveGameStore` enjeksiyonu Plan 3'tedir.

**Tech Stack:** SvelteKit 2 endpoint (`+server.ts`, `RequestHandler`, `json`), TypeScript (strict), Vitest (mock fetch + FakeWebSocket + fake timers). Upstream: Yahoo Finance chart API, open.er-api.com, Binance REST + WS.

---

## Bağlam & Sınırlar (uygulayıcı için)

- **Otoriter spec'ler:** `docs/superpowers/specs/2026-05-29-canli-cekirdek-design.md` (§4 evren, §7 fiyat akışı, §11.2 API test) + `docs/superpowers/specs/2026-06-01-vizyon-haber-rolu-design.md` (vizyon kararı). Bu plan, canlı-çekirdek spec'inin **API katmanını** hayata geçirir.
- **🚫 VİZYON SINIRI (2026-06-01 kararı):** API katmanı **yalnızca fiyat-proxy'sidir. Haber/RSS endpoint'i GİRMEZ.** Legacy `server.js`'teki `/api/news` (Bloomberg HT RSS) **port EDİLMEZ**. Canlı modun "zengin ayna" bağlamı statik `holidays2026.ts` verisinden (Plan 1'de var) Plan 3 UI'ında beslenir — API'den değil. Bu sınır, projenin en kırılgan katmanını (canlı dış API) şişirmemek içindir.
- **DOKUNMA:** `src/lib/stores/gameState.ts`, `src/lib/domain/fx/fx.ts`, `src/lib/domain/fx/liveFx.ts`, `src/lib/data/macro2025.ts`, `src/lib/domain/calendar/*` ve hiçbir mevcut `*.test.ts`. Bu plan yalnızca **yeni dosya** ekler.
- **CLAUDE.md sınırları:** Dış API çağrıları `src/routes/api/` (server proxy) + `src/lib/api/` (client) altında kalır — dizin haritası bu ikisini açıkça izinli sayar. Para tipi bu katmanda kullanılmaz: API ham `number` (TRY/USD) taşır; `Money`'ye çevrim Plan 1 `tryM()`/Plan 3 store'unda yapılır. Yahoo proxy **5s server cache zorunlu** (CLAUDE.md performans kısıtı). Identifier İngilizce, yorum/UI Türkçe.
- **liveFx sözleşmesi (Plan 1, değişmez):** `LivePriceSource` = `{ usdTry(): number; assetTry(id): number | undefined }`, **tüm assetTry değerleri TRY**. Yani: Yahoo proxy BIST/altın/gümüş/EUR'u **TRY** döndürür (gram altın = `onsUSD × usdTry / 31.1034768`); Binance proxy kripto'yu **USD** döndürür → kripto'nun TRY'ye çevrimi Plan 3 store'unda `usdPrice × güncel usdTry` ile yapılır (bu plan kripto'yu USD bırakır).
- **Önbellek envanteri:** Plan 1'deki `*.IS` BIST sembolleri, gram altın `GC=F`, gümüş `SI=F`, USD/TRY (er-api). 9 kanon BIST: THYAO, EREGL, ASELS, GUBRF, KCHOL, TUPRS, SASA, YKBNK, BIMAS.
- **`$lib` alias:** vitest aynı `vite.config.ts`'i (`plugins:[sveltekit()]`) kullandığından `$lib/...` testte de çözülür. Domain stiliyle tutarlı olmak için `src/lib/api/` içi importlar **relative** (`./types`), `+server.ts` ise `$lib/api/...` kullanır (SvelteKit standardı).
- **Test ortamı:** `vite.config.ts` → `environment: 'node'`. `Response`/`json()` Node 18+ globalleriyle çalışır. `+server.ts` testleri `GET`'i doğrudan import edip `{ url } as RequestEvent` ile çağırır; upstream `fetch` `vi.stubGlobal`/enjeksiyon ile mock'lanır (gerçek ağ YOK).
- **Commit kuralı:** Conventional + Türkçe (`feat(api): ...`). Her commit `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` ile biter. Kullanıcı toplu commit ("s") tercih ederse task-başı commit'ler birleştirilebilir.
- **Kalibrasyon notu (spec §12, uygulamayı BLOKLAMAZ):** Fallback fiyatları + Binance/Yahoo sembol formatı makul tahmindir; quant rafine edecek. Mekanizma değerden bağımsız çalışır.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Bağımlılık |
|-------|-----------|-----------|
| `src/lib/api/types.ts` (yeni) | Wire tipleri: `FxValue` (TRY), `CryptoValue` (USD), `Cached<T>` zarfı | yok |
| `src/lib/api/cachedFetch.ts` (yeni) | `createTtlCache` — TTL'li, hata-toleranslı, enjekte edilebilir önbellek | `./types` |
| `src/lib/api/cachedFetch.test.ts` (yeni) | Önbellek deterministik unit (enjekte `now` + fetcher spy) | cachedFetch |
| `src/routes/api/yahoo/+server.ts` (yeni) | Yahoo proxy: BIST+altın+gümüş+EUR+USD/TRY → TRY snapshot, 5s cache | `$lib/api/cachedFetch`, `$lib/api/types` |
| `src/routes/api/yahoo/server.test.ts` (yeni) | Upstream fetch/parse + birleşik snapshot + GET zarfı (mock fetch) | +server |
| `src/routes/api/crypto/+server.ts` (yeni) | Binance proxy: kripto → USD snapshot, 5s cache | `$lib/api/cachedFetch`, `$lib/api/types` |
| `src/routes/api/crypto/server.test.ts` (yeni) | Upstream fetch/parse + GET zarfı (mock fetch) | +server |
| `src/lib/api/fx.ts` (yeni) | `fetchFxSnapshot` — `/api/yahoo` poll client (staleness yüzeyler) | `./types` |
| `src/lib/api/fx.test.ts` (yeni) | URL kurulumu + parse + HTTP hata (mock fetch) | fx |
| `src/lib/api/binance.ts` (yeni) | `createBinanceFeed` (WS canlı push + reconnect) + `fetchCryptoSnapshot` (poll fallback) | `./types` |
| `src/lib/api/binance.test.ts` (yeni) | WS push/status/reconnect (FakeWebSocket + fake timers) + poll client | binance |

**Önbellek tasarımı (DRY):** Hem Yahoo hem Binance proxy aynı ihtiyaca sahip — TTL cache + hata fallback + `{value, asOf, stale}` zarfı. Tek `createTtlCache` helper'ı her ikisini de besler. Helper saf (enjekte `now` + `fetcher`) → Task 1'de izole test edilir; endpoint'ler ince kalır.

---

### Task 1: Wire Tipleri + TTL Önbellek (`types.ts`, `cachedFetch.ts`)

**Files:**
- Create: `src/lib/api/types.ts`
- Create: `src/lib/api/cachedFetch.ts`
- Test: `src/lib/api/cachedFetch.test.ts`

- [ ] **Step 1: Wire tiplerini yaz**

`src/lib/api/types.ts`:

```ts
/** Yahoo proxy değeri: tüm fiyatlar TRY; ayrıca canlı USD/TRY mid kuru.
 *  (liveFx sözleşmesi: assetTry hep TRY — bkz Plan 1.) */
export interface FxValue {
  usdTry: number;
  prices: Record<string, number>; // TRY: BIST sembolleri + XAUGRAM + XAGGRAM + EUR
}

/** Binance proxy değeri: tüm fiyatlar USD (USDT). TRY çevrimi store'da yapılır. */
export interface CryptoValue {
  prices: Record<string, number>; // USD
}

/** Önbellek zarfı: değer + son başarılı güncelleme anı + bayatlık bayrağı.
 *  `stale:true` => upstream başarısız; değer fallback ya da son-bilinen.
 *  `asOf` => son BAŞARILI çekimin epoch-ms'i (hiç başarı yoksa 0). UI "veri eski" rozetini bundan türetir. */
export interface Cached<T> {
  value: T;
  asOf: number;
  stale: boolean;
}
```

- [ ] **Step 2: `createTtlCache` için başarısız test yaz**

`src/lib/api/cachedFetch.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createTtlCache } from './cachedFetch';

describe('createTtlCache', () => {
  it('ilk çağrıda fetcher değerini taze döner (stale:false)', async () => {
    const get = createTtlCache({ ttlMs: 5000, fallback: 0, fetcher: async () => 42, now: () => 1000 });
    expect(await get()).toEqual({ value: 42, asOf: 1000, stale: false });
  });

  it('TTL içinde fetcher’ı tekrar çağırmaz (cache hit)', async () => {
    let t = 1000;
    const fetcher = vi.fn(async () => 42);
    const get = createTtlCache({ ttlMs: 5000, fallback: 0, fetcher, now: () => t });
    await get();        // t=1000 -> çekim
    t = 3000;           // +2s, TTL içinde
    const r = await get();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ value: 42, asOf: 1000, stale: false });
  });

  it('TTL dolunca fetcher’ı yeniden çağırır', async () => {
    let t = 1000;
    let val = 42;
    const fetcher = vi.fn(async () => val);
    const get = createTtlCache({ ttlMs: 5000, fallback: 0, fetcher, now: () => t });
    await get();
    t = 7000; val = 99; // +6s, TTL doldu
    const r = await get();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ value: 99, asOf: 7000, stale: false });
  });

  it('hata + önceki başarı -> son değeri stale:true ile döner', async () => {
    let t = 1000;
    let fail = false;
    const fetcher = vi.fn(async () => { if (fail) throw new Error('down'); return 42; });
    const get = createTtlCache({ ttlMs: 5000, fallback: -1, fetcher, now: () => t });
    await get();          // başarı: value=42, asOf=1000
    t = 7000; fail = true; // TTL doldu + upstream çöktü
    expect(await get()).toEqual({ value: 42, asOf: 1000, stale: true });
  });

  it('hata + hiç başarı yok -> fallback’i stale:true, asOf:0 ile döner', async () => {
    const get = createTtlCache({
      ttlMs: 5000, fallback: -1,
      fetcher: async () => { throw new Error('down'); },
      now: () => 1000,
    });
    expect(await get()).toEqual({ value: -1, asOf: 0, stale: true });
  });
});
```

- [ ] **Step 3: Testin başarısız olduğunu doğrula**

Run: `npm run test -- cachedFetch`
Expected: FAIL — `./cachedFetch` modülü yok.

- [ ] **Step 4: `createTtlCache`'i uygula**

`src/lib/api/cachedFetch.ts`:

```ts
import type { Cached } from './types';

export interface TtlCacheOptions<T> {
  ttlMs: number;
  fallback: T;
  fetcher: () => Promise<T>;
  now?: () => number; // enjekte edilebilir saat (test determinizmi)
}

/** TTL'li, hata-toleranslı önbellek. TTL içinde son başarılı değeri çağrısız döner;
 *  süresi dolunca fetcher'ı dener. Başarısızsa son-bilinen değeri `stale:true` ile,
 *  hiç başarı yoksa `fallback`'i `stale:true` ile döner. Hatalar cache'lenmez (her
 *  çağrıda yeniden denenir). Saf + enjekte edilebilir. */
export function createTtlCache<T>(opts: TtlCacheOptions<T>): () => Promise<Cached<T>> {
  const now = opts.now ?? Date.now;
  let value: T = opts.fallback;
  let asOf = 0;
  let everSucceeded = false;

  return async function get(): Promise<Cached<T>> {
    if (everSucceeded && now() - asOf < opts.ttlMs) {
      return { value, asOf, stale: false };
    }
    try {
      value = await opts.fetcher();
      asOf = now();
      everSucceeded = true;
      return { value, asOf, stale: false };
    } catch {
      return { value, asOf, stale: true };
    }
  };
}
```

- [ ] **Step 5: Testin geçtiğini doğrula**

Run: `npm run test -- cachedFetch`
Expected: PASS (5 test yeşil).

- [ ] **Step 6: Tip kontrolü + commit**

```bash
npm run check
git add src/lib/api/types.ts src/lib/api/cachedFetch.ts src/lib/api/cachedFetch.test.ts
git commit -m "feat(api): wire tipleri + createTtlCache (5s hata-toleranslı önbellek, TDD)"
```
Expected: `check` 0 hata; commit oluşur.

---

### Task 2: Yahoo Proxy (`/api/yahoo`) — BIST + altın/gümüş + EUR + USD/TRY → TRY

**Files:**
- Create: `src/routes/api/yahoo/+server.ts`
- Test: `src/routes/api/yahoo/server.test.ts`

- [ ] **Step 1: Başarısız test yaz**

`src/routes/api/yahoo/server.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchYahooPrice, fetchUsdRates, fetchFxValue, GET } from './+server';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
function yahooBody(price: number) {
  return { chart: { result: [{ meta: { regularMarketPrice: price } }] } };
}
/** URL'ye göre yönlendiren sahte fetch (er-api + Yahoo sembolleri). */
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('open.er-api.com')) return okJson({ rates: { TRY: 40, EUR: 0.5 } });
    if (url.includes('GC=F')) return okJson(yahooBody(3110.34768)); // ons altın USD -> /31.1034768 = 100 USD/gram
    if (url.includes('SI=F')) return okJson(yahooBody(31.1034768)); // ons gümüş USD -> 1 USD/gram
    if (url.includes('THYAO.IS')) return okJson(yahooBody(300));
    return okJson(yahooBody(1));
  }) as unknown as typeof fetch;
}

describe('fetchYahooPrice', () => {
  it('regularMarketPrice değerini çeker', async () => {
    const f = vi.fn(() => okJson(yahooBody(288.5))) as unknown as typeof fetch;
    expect(await fetchYahooPrice('THYAO.IS', f)).toBe(288.5);
  });
  it('geçersiz yapıda hata fırlatır', async () => {
    const f = vi.fn(() => okJson({ chart: { result: [] } })) as unknown as typeof fetch;
    await expect(fetchYahooPrice('X.IS', f)).rejects.toThrow();
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response)) as unknown as typeof fetch;
    await expect(fetchYahooPrice('X.IS', f)).rejects.toThrow('503');
  });
});

describe('fetchUsdRates', () => {
  it('USD bazlı kur tablosunu döner', async () => {
    const f = vi.fn(() => okJson({ rates: { TRY: 40.2, EUR: 0.92 } })) as unknown as typeof fetch;
    expect((await fetchUsdRates(f)).TRY).toBe(40.2);
  });
  it('TRY yoksa fırlatır', async () => {
    const f = vi.fn(() => okJson({ rates: { EUR: 0.92 } })) as unknown as typeof fetch;
    await expect(fetchUsdRates(f)).rejects.toThrow();
  });
});

describe('fetchFxValue (birleşik TRY snapshot)', () => {
  it('BIST(TRY) + gram altın/gümüş(TRY) + EUR(TRY) + usdTry üretir', async () => {
    const v = await fetchFxValue(['THYAO'], routedFetch());
    expect(v.usdTry).toBe(40);
    expect(v.prices.THYAO).toBe(300);
    expect(v.prices.XAUGRAM).toBe(4000); // 100 USD/gram × 40
    expect(v.prices.XAGGRAM).toBe(40);   // 1 USD/gram × 40
    expect(v.prices.EUR).toBe(80);       // usdTry / eurPerUsd = 40 / 0.5
  });
});

describe('GET /api/yahoo', () => {
  it('?bist= verildiğinde Cached<FxValue> zarfı döner', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = routedFetch();
    try {
      const res = await GET({ url: new URL('http://localhost/api/yahoo?bist=THYAO') } as any);
      const body = await res.json();
      expect(body.stale).toBe(false);
      expect(body.value.prices.THYAO).toBe(300);
      expect(typeof body.asOf).toBe('number');
    } finally {
      globalThis.fetch = real;
    }
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm run test -- api/yahoo`
Expected: FAIL — `./+server` yok / export'lar tanımsız.

- [ ] **Step 3: `+server.ts`'i uygula**

`src/routes/api/yahoo/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTtlCache } from '$lib/api/cachedFetch';
import type { FxValue } from '$lib/api/types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TROY_OUNCE_GRAMS = 31.1034768;
const TTL_MS = 5000; // CLAUDE.md: Yahoo proxy 5s server cache zorunlu

/** 9 kanon BIST hissesi (varsayılan set; ?bist= ile özelleştirilir). */
const DEFAULT_BIST = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'SASA', 'YKBNK', 'BIMAS'];

/** Upstream çökerse dönen makul fallback (TRY). Quant rafine edecek (spec §12). */
const FALLBACK: FxValue = {
  usdTry: 40,
  prices: {
    THYAO: 288, EREGL: 38.68, ASELS: 410, GUBRF: 544.5, KCHOL: 190.2,
    TUPRS: 243.1, SASA: 2.65, YKBNK: 32.86, BIMAS: 392.75,
    XAUGRAM: 4000, XAGGRAM: 40, EUR: 43,
  },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Yahoo chart API'sinden tek sembolün son fiyatını çeker. */
export async function fetchYahooPrice(symbol: string, fetchFn: typeof fetch): Promise<number> {
  const res = await fetchFn(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1m`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  const j: any = await res.json();
  const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== 'number') throw new Error(`Yahoo ${symbol}: geçersiz yapı`);
  return price;
}

/** open.er-api.com'dan USD bazlı kur tablosunu çeker. */
export async function fetchUsdRates(fetchFn: typeof fetch): Promise<Record<string, number>> {
  const res = await fetchFn('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error(`er-api: HTTP ${res.status}`);
  const j: any = await res.json();
  if (!j?.rates?.TRY) throw new Error('er-api: geçersiz yapı');
  return j.rates as Record<string, number>;
}

/** BIST(TRY) + gram altın/gümüş(TRY) + EUR(TRY) + USD/TRY'yi tek snapshot'ta birleştirir.
 *  Atomik: herhangi bir upstream çağrısı patlarsa snapshot patlar (cache fallback'e düşer). */
export async function fetchFxValue(bist: readonly string[], fetchFn: typeof fetch): Promise<FxValue> {
  const rates = await fetchUsdRates(fetchFn);
  const usdTry = rates.TRY;
  const prices: Record<string, number> = {};

  await Promise.all(
    bist.map(async (sym) => { prices[sym] = round2(await fetchYahooPrice(`${sym}.IS`, fetchFn)); }),
  );

  const goldOz = await fetchYahooPrice('GC=F', fetchFn);   // COMEX altın USD/ons
  prices.XAUGRAM = round2((goldOz * usdTry) / TROY_OUNCE_GRAMS);
  const silverOz = await fetchYahooPrice('SI=F', fetchFn); // COMEX gümüş USD/ons
  prices.XAGGRAM = round2((silverOz * usdTry) / TROY_OUNCE_GRAMS);

  if (rates.EUR) prices.EUR = round2(usdTry / rates.EUR); // EUR/TRY

  return { usdTry: round2(usdTry), prices };
}

// Varsayılan sembol seti için modül-seviyesi 5s önbellek.
const cache = createTtlCache<FxValue>({
  ttlMs: TTL_MS,
  fallback: FALLBACK,
  fetcher: () => fetchFxValue(DEFAULT_BIST, fetch),
});

export const GET: RequestHandler = async ({ url }) => {
  const bistParam = url.searchParams.get('bist');
  const headers = { 'cache-control': 'public, max-age=5' };

  // Özel sembol istenirse cache'i bypass et (basit v1; varsayılan set cache'lenir).
  if (bistParam) {
    const bist = bistParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    try {
      const value = await fetchFxValue(bist, fetch);
      return json({ value, asOf: Date.now(), stale: false }, { headers });
    } catch {
      return json({ value: FALLBACK, asOf: 0, stale: true }, { headers });
    }
  }
  return json(await cache(), { headers });
};
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm run test -- api/yahoo`
Expected: PASS (fetchYahooPrice 3 + fetchUsdRates 2 + fetchFxValue 1 + GET 1 = 7 test yeşil).

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/routes/api/yahoo/+server.ts src/routes/api/yahoo/server.test.ts
git commit -m "feat(api): /api/yahoo proxy — BIST+altın/gümüş+EUR+USD/TRY TRY snapshot, 5s cache (TDD)"
```

---

### Task 3: Binance Proxy (`/api/crypto`) — kripto → USD (poll fallback kaynağı)

**Files:**
- Create: `src/routes/api/crypto/+server.ts`
- Test: `src/routes/api/crypto/server.test.ts`

> **Not:** Canlı kripto akışı v1'de Binance **WS** ile gelir (Task 5, `binance.ts`). Bu proxy, WS düşünce kullanılacak **poll fallback** kaynağıdır + ilk-yükleme anlık değeri. Fiyatlar **USD** döner (TRY çevrimi store'da).

- [ ] **Step 1: Başarısız test yaz**

`src/routes/api/crypto/server.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchBinancePrice, fetchCryptoValue, GET } from './+server';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('BTCUSDT')) return okJson({ symbol: 'BTCUSDT', price: '95000.50' });
    if (url.includes('ETHUSDT')) return okJson({ symbol: 'ETHUSDT', price: '3300.10' });
    return okJson({ symbol: '?', price: '1' });
  }) as unknown as typeof fetch;
}

describe('fetchBinancePrice', () => {
  it('ticker fiyatını number olarak çeker (USDT eki)', async () => {
    expect(await fetchBinancePrice('BTC', routedFetch())).toBe(95000.5);
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 429 } as Response)) as unknown as typeof fetch;
    await expect(fetchBinancePrice('BTC', f)).rejects.toThrow('429');
  });
  it('geçersiz fiyatta fırlatır', async () => {
    const f = vi.fn(() => okJson({ symbol: 'BTCUSDT', price: 'NaN' })) as unknown as typeof fetch;
    await expect(fetchBinancePrice('BTC', f)).rejects.toThrow();
  });
});

describe('fetchCryptoValue', () => {
  it('istenen coinleri USD fiyatlarıyla döner', async () => {
    const v = await fetchCryptoValue(['BTC', 'ETH'], routedFetch());
    expect(v.prices).toEqual({ BTC: 95000.5, ETH: 3300.1 });
  });
});

describe('GET /api/crypto', () => {
  it('?coins= verildiğinde Cached<CryptoValue> zarfı döner', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = routedFetch();
    try {
      const res = await GET({ url: new URL('http://localhost/api/crypto?coins=BTC,ETH') } as any);
      const body = await res.json();
      expect(body.stale).toBe(false);
      expect(body.value.prices.BTC).toBe(95000.5);
      expect(typeof body.asOf).toBe('number');
    } finally {
      globalThis.fetch = real;
    }
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm run test -- api/crypto`
Expected: FAIL — `./+server` yok.

- [ ] **Step 3: `+server.ts`'i uygula**

`src/routes/api/crypto/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTtlCache } from '$lib/api/cachedFetch';
import type { CryptoValue } from '$lib/api/types';

const TTL_MS = 5000;
const DEFAULT_COINS = ['BTC', 'ETH', 'SOL'];

/** Upstream çökerse dönen fallback (USD). Quant rafine edecek (spec §12). */
const FALLBACK: CryptoValue = { prices: { BTC: 95000, ETH: 3300, SOL: 200 } };

/** Binance ticker/price'tan tek coin'in USDT fiyatını number olarak çeker. */
export async function fetchBinancePrice(coin: string, fetchFn: typeof fetch): Promise<number> {
  const res = await fetchFn(`https://api.binance.com/api/v3/ticker/price?symbol=${coin}USDT`);
  if (!res.ok) throw new Error(`Binance ${coin}: HTTP ${res.status}`);
  const j: any = await res.json();
  const price = Number(j?.price);
  if (!Number.isFinite(price)) throw new Error(`Binance ${coin}: geçersiz fiyat`);
  return price;
}

/** İstenen coinleri tek snapshot'ta (USD) birleştirir. Atomik. */
export async function fetchCryptoValue(coins: readonly string[], fetchFn: typeof fetch): Promise<CryptoValue> {
  const prices: Record<string, number> = {};
  await Promise.all(coins.map(async (c) => { prices[c] = await fetchBinancePrice(c, fetchFn); }));
  return { prices };
}

const cache = createTtlCache<CryptoValue>({
  ttlMs: TTL_MS,
  fallback: FALLBACK,
  fetcher: () => fetchCryptoValue(DEFAULT_COINS, fetch),
});

export const GET: RequestHandler = async ({ url }) => {
  const coinsParam = url.searchParams.get('coins');
  const headers = { 'cache-control': 'public, max-age=5' };

  if (coinsParam) {
    const coins = coinsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    try {
      const value = await fetchCryptoValue(coins, fetch);
      return json({ value, asOf: Date.now(), stale: false }, { headers });
    } catch {
      return json({ value: FALLBACK, asOf: 0, stale: true }, { headers });
    }
  }
  return json(await cache(), { headers });
};
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm run test -- api/crypto`
Expected: PASS (fetchBinancePrice 3 + fetchCryptoValue 1 + GET 1 = 5 test yeşil).

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/routes/api/crypto/+server.ts src/routes/api/crypto/server.test.ts
git commit -m "feat(api): /api/crypto proxy — Binance kripto USD snapshot, 5s cache (TDD)"
```

---

### Task 4: FX Client (`fx.ts`) — `/api/yahoo` poll client

**Files:**
- Create: `src/lib/api/fx.ts`
- Test: `src/lib/api/fx.test.ts`

- [ ] **Step 1: Başarısız test yaz**

`src/lib/api/fx.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchFxSnapshot } from './fx';
import type { Cached, FxValue } from './types';

const sample: Cached<FxValue> = {
  value: { usdTry: 40, prices: { THYAO: 300, XAUGRAM: 4000 } },
  asOf: 123,
  stale: false,
};
function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

describe('fetchFxSnapshot', () => {
  it('varsayılan sette /api/yahoo çağırır ve zarfı döner', async () => {
    const f = vi.fn(() => okJson(sample)) as unknown as typeof fetch;
    const r = await fetchFxSnapshot({ fetchFn: f });
    expect(f).toHaveBeenCalledWith('/api/yahoo');
    expect(r.value.prices.THYAO).toBe(300);
    expect(r.stale).toBe(false);
  });
  it('bist verilince query string ekler', async () => {
    const f = vi.fn(() => okJson(sample)) as unknown as typeof fetch;
    await fetchFxSnapshot({ bist: ['EREGL', 'ASELS'], fetchFn: f });
    expect(f).toHaveBeenLastCalledWith('/api/yahoo?bist=EREGL,ASELS');
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    await expect(fetchFxSnapshot({ fetchFn: f })).rejects.toThrow('500');
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm run test -- api/fx`
Expected: FAIL — `./fx` yok.

- [ ] **Step 3: `fx.ts`'i uygula**

`src/lib/api/fx.ts`:

```ts
import type { Cached, FxValue } from './types';

export interface FxSnapshotOptions {
  bist?: string[];          // özel BIST sembolleri (yoksa proxy varsayılan setini kullanır)
  fetchFn?: typeof fetch;   // enjekte edilebilir (test)
}

/** Yahoo proxy'sinden (sunucu 5s cache'li) güncel FX anlık görüntüsünü çeker.
 *  Zarfı (`value`/`asOf`/`stale`) aynen yüzeyler — store "veri eski" rozetini buradan türetir. */
export async function fetchFxSnapshot(opts: FxSnapshotOptions = {}): Promise<Cached<FxValue>> {
  const fetchFn = opts.fetchFn ?? fetch;
  const qs = opts.bist?.length ? `?bist=${opts.bist.join(',')}` : '';
  const res = await fetchFn(`/api/yahoo${qs}`);
  if (!res.ok) throw new Error(`/api/yahoo: HTTP ${res.status}`);
  return (await res.json()) as Cached<FxValue>;
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm run test -- api/fx`
Expected: PASS (3 test yeşil).

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/lib/api/fx.ts src/lib/api/fx.test.ts
git commit -m "feat(api): fetchFxSnapshot — /api/yahoo poll client (staleness yüzeyler, TDD)"
```

---

### Task 5: Binance Client (`binance.ts`) — WS canlı push + poll fallback

**Files:**
- Create: `src/lib/api/binance.ts`
- Test: `src/lib/api/binance.test.ts`

> **Tasarım:** `binance.ts` iki primitif sunar — (1) `createBinanceFeed`: Binance combined WS'ten canlı trade push (reconnect'li, durum bildirimli), (2) `fetchCryptoSnapshot`: `/api/crypto` poll client (WS düşünce fallback). **WS↔poll arası geçiş orkestrasyonu Plan 3 store'undadır**; bu plan iki primitifi izole + test edilebilir bırakır. `WebSocket` enjekte edilebilir (test'te FakeWebSocket).

- [ ] **Step 1: Başarısız test yaz**

`src/lib/api/binance.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBinanceFeed, fetchCryptoSnapshot } from './binance';
import type { Cached, CryptoValue } from './types';

/** Test çift'i: gerçek WebSocket arayüzünün minimal taklidi. */
class FakeWS {
  static instances: FakeWS[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  constructor(url: string) { this.url = url; FakeWS.instances.push(this); }
  close() { this.closed = true; this.onclose?.(); }
  emitOpen() { this.onopen?.(); }
  emitTrade(coin: string, price: number) {
    this.onmessage?.({
      data: JSON.stringify({ stream: `${coin.toLowerCase()}usdt@trade`, data: { s: `${coin}USDT`, p: String(price) } }),
    });
  }
}

beforeEach(() => { FakeWS.instances = []; });

describe('createBinanceFeed', () => {
  it('combined stream URL kurar (semboller @trade)', () => {
    createBinanceFeed({ symbols: ['BTC', 'ETH'], onPrice() {}, WebSocketImpl: FakeWS as any });
    expect(FakeWS.instances[0].url).toContain('btcusdt@trade');
    expect(FakeWS.instances[0].url).toContain('ethusdt@trade');
  });
  it('WS açılınca onStatus("live")', () => {
    const st: string[] = [];
    createBinanceFeed({ symbols: ['BTC'], onPrice() {}, onStatus: (s) => st.push(s), WebSocketImpl: FakeWS as any });
    FakeWS.instances[0].emitOpen();
    expect(st).toEqual(['live']);
  });
  it('trade mesajında onPrice(coin, usd) — USDT eki soyulur', () => {
    const got: Array<[string, number]> = [];
    createBinanceFeed({ symbols: ['BTC'], onPrice: (c, p) => got.push([c, p]), WebSocketImpl: FakeWS as any });
    FakeWS.instances[0].emitTrade('BTC', 95000.5);
    expect(got).toEqual([['BTC', 95000.5]]);
  });
  it('kapanışta onStatus("stale") + reconnect zamanlar', () => {
    vi.useFakeTimers();
    const st: string[] = [];
    createBinanceFeed({ symbols: ['BTC'], onPrice() {}, onStatus: (s) => st.push(s), WebSocketImpl: FakeWS as any, reconnectMs: 3000 });
    const before = FakeWS.instances.length;
    FakeWS.instances[before - 1].close();
    expect(st).toContain('stale');
    vi.advanceTimersByTime(3000);
    expect(FakeWS.instances.length).toBe(before + 1); // yeni socket
    vi.useRealTimers();
  });
  it('stop() reconnect etmez', () => {
    vi.useFakeTimers();
    const feed = createBinanceFeed({ symbols: ['BTC'], onPrice() {}, WebSocketImpl: FakeWS as any });
    const before = FakeWS.instances.length;
    feed.stop();
    vi.advanceTimersByTime(10000);
    expect(FakeWS.instances.length).toBe(before); // yeni socket YOK
    vi.useRealTimers();
  });
});

describe('fetchCryptoSnapshot', () => {
  const sample: Cached<CryptoValue> = { value: { prices: { BTC: 95000 } }, asOf: 1, stale: false };
  it('varsayılan sette /api/crypto çağırır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: true, json: async () => sample } as Response)) as unknown as typeof fetch;
    const r = await fetchCryptoSnapshot({ fetchFn: f });
    expect(f).toHaveBeenCalledWith('/api/crypto');
    expect(r.value.prices.BTC).toBe(95000);
  });
  it('coins verilince query string ekler', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: true, json: async () => sample } as Response)) as unknown as typeof fetch;
    await fetchCryptoSnapshot({ coins: ['BTC', 'SOL'], fetchFn: f });
    expect(f).toHaveBeenLastCalledWith('/api/crypto?coins=BTC,SOL');
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    await expect(fetchCryptoSnapshot({ fetchFn: f })).rejects.toThrow('500');
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm run test -- api/binance`
Expected: FAIL — `./binance` yok.

- [ ] **Step 3: `binance.ts`'i uygula**

`src/lib/api/binance.ts`:

```ts
import type { Cached, CryptoValue } from './types';

/** Minimal WebSocket sözleşmesi (enjekte edilebilir — test'te FakeWebSocket). */
interface WsLike {
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  close(): void;
}
interface WsCtor { new (url: string): WsLike; }

export interface BinanceFeedOptions {
  symbols: string[];                               // ['BTC','ETH'] — coin sembolleri (USDT eki eklenir)
  onPrice: (coin: string, usd: number) => void;    // her trade push'ta
  onStatus?: (status: 'live' | 'stale') => void;   // bağlantı durumu (UI "canlı/eski" rozeti)
  WebSocketImpl?: WsCtor;                           // enjekte (test); yoksa global WebSocket
  url?: string;                                     // base WS URL (test/override)
  reconnectMs?: number;                             // kapanınca yeniden bağlanma gecikmesi (default 3000)
}

export interface BinanceFeed {
  stop(): void;
}

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream';

/** Binance combined trade stream'inden canlı kripto fiyatı (USD) push'lar.
 *  Kapanışta `onStatus('stale')` + otomatik reconnect. `stop()` reconnect'i iptal eder. */
export function createBinanceFeed(opts: BinanceFeedOptions): BinanceFeed {
  const WS: WsCtor = opts.WebSocketImpl ?? ((globalThis as any).WebSocket as WsCtor);
  const base = opts.url ?? BINANCE_WS_BASE;
  const reconnectMs = opts.reconnectMs ?? 3000;
  const streams = opts.symbols.map((s) => `${s.toLowerCase()}usdt@trade`).join('/');

  let ws: WsLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function connect(): void {
    ws = new WS(`${base}?streams=${streams}`);
    ws.onopen = () => opts.onStatus?.('live');
    ws.onmessage = (e) => {
      try {
        const msg: any = JSON.parse(e.data);
        const d = msg?.data;
        if (d?.s && d?.p !== undefined) {
          opts.onPrice(String(d.s).replace(/USDT$/, ''), Number(d.p));
        }
      } catch {
        /* bozuk frame yutulur */
      }
    };
    ws.onclose = () => {
      opts.onStatus?.('stale');
      if (!stopped) timer = setTimeout(connect, reconnectMs);
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* yut */ } };
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      try { ws?.close(); } catch { /* yut */ }
    },
  };
}

export interface CryptoSnapshotOptions {
  coins?: string[];
  fetchFn?: typeof fetch;
}

/** `/api/crypto`'dan kripto USD anlık görüntüsü (WS fallback / ilk yükleme). */
export async function fetchCryptoSnapshot(opts: CryptoSnapshotOptions = {}): Promise<Cached<CryptoValue>> {
  const fetchFn = opts.fetchFn ?? fetch;
  const qs = opts.coins?.length ? `?coins=${opts.coins.join(',')}` : '';
  const res = await fetchFn(`/api/crypto${qs}`);
  if (!res.ok) throw new Error(`/api/crypto: HTTP ${res.status}`);
  return (await res.json()) as Cached<CryptoValue>;
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm run test -- api/binance`
Expected: PASS (createBinanceFeed 5 + fetchCryptoSnapshot 3 = 8 test yeşil).

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/lib/api/binance.ts src/lib/api/binance.test.ts
git commit -m "feat(api): createBinanceFeed (WS canlı push+reconnect) + fetchCryptoSnapshot poll (TDD)"
```

---

### Task 6: Tam Doğrulama (regresyon + sınır teyidi)

**Files:** (kod değişikliği yok — kapanış kapısı)

- [ ] **Step 1: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: PASS. Mevcut **153 test aynen yeşil** (domain dokunulmadı) + yeni: cachedFetch (5) + yahoo (7) + crypto (5) + fx (3) + binance (8) = **toplam ~181 test**.

- [ ] **Step 2: Tip + lint kontrolü**

Run: `npm run check`
Expected: 0 hata, 0 uyarı. (`svelte-kit sync` route `$types`'larını üretir; `+server.ts`'lerin `RequestHandler` importu çözülür.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Başarılı. Yeni route endpoint'leri (`/api/yahoo`, `/api/crypto`) derlenir.

- [ ] **Step 4: Domain değişmedi teyidi (manuel)**

Run: `git diff ecbd2a3 --stat -- src/lib/stores/gameState.ts src/lib/domain/`
Expected: **boş çıktı** (gameState + tüm domain dokunulmadı; bu plan yalnızca `src/lib/api/` + `src/routes/api/` ekledi).

- [ ] **Step 5: Vizyon sınırı teyidi (manuel)**

Run: `git ls-files src/routes/api`
Expected: Yalnızca `yahoo/` ve `crypto/` (+ test) — **`news/` YOK** (vizyon kararı: haber endpoint'i girmez). Legacy `/api/news` bilinçli port EDİLMEDİ.

- [ ] **Step 6: (opsiyonel) Doğrulama özetini raporla** — kod değişmediyse commit gerekmez.

---

## Self-Review (spec ↔ plan kapsamı)

- **Canlı-çekirdek spec §4 (açık evren):** `?bist=`/`?coins=` query'leriyle aranıp seçilen herhangi sembol proxy'den çekilir (ön-kayıt yok). ✅
- **Spec §7 (fiyat akışı):** Kripto Binance **WS push** (`createBinanceFeed`, Task 5) + döviz/altın/BIST **poll + 5s cache** (`/api/yahoo` + `fetchFxSnapshot`). ✅
- **Spec §11.2 (API mock'lu unit):** 5s cache davranışı (Task 1) + hata fallback (her endpoint + cache testi) + fetch mock'lu parse. ✅
- **liveFx sözleşmesi (Plan 1):** Yahoo TRY döner (gram altın `ons×usdTry/31.1034768`), kripto USD döner (TRY çevrimi Plan 3 store'unda) — `assetTry hep TRY` ilkesi store katmanında karşılanır. Bu sınır plan içinde + Plan 3 yol haritasında açık. ✅
- **Vizyon spec (2026-06-01):** Haber/RSS endpoint'i YOK; `/api/news` port edilmedi (Task 6 Step 5 teyit). API = saf fiyat-proxy. ✅
- **"Veri eski" UX (memory şartı):** `Cached<T>={value,asOf,stale}` zarfı her yanıtta staleness'i taşır; client aynen yüzeyler → Plan 3 store rozeti `asOf`/`stale`'den türetir. ✅
- **CLAUDE.md:** Dış çağrılar `routes/api`+`lib/api` altında; Yahoo 5s cache; `Money` bu katmanda yok (ham number). ✅
- **DRY:** Tek `createTtlCache` iki proxy'yi de besler; `fetch*Snapshot` client'ları aynı desende. ✅
- **Placeholder taraması:** Tüm step'lerde tam kod; "TODO/TBD/uygun hata ekle" yok. ✅
- **Tip tutarlılığı:** `Cached<T>`, `FxValue`, `CryptoValue` (types.ts) tüm tasklarda birebir; `fetchYahooPrice`/`fetchUsdRates`/`fetchFxValue`/`fetchBinancePrice`/`fetchCryptoValue`/`fetchFxSnapshot`/`createBinanceFeed`/`fetchCryptoSnapshot` imzaları test↔impl uyumlu. ✅
- **Bilinçli sadeleştirme (v1):** Proxy snapshot'ları **atomik** (bir sembol patlarsa snapshot fallback'e düşer) — per-sembol dayanıklılık v1.1. Özel `?bist=`/`?coins=` cache'lenmez (yalnız varsayılan set). Notlandı. ✅
- **Kapsam dışı (bu plan):** `liveGameStore.svelte.ts` (WS↔poll orkestrasyonu, `LivePriceSource` impl, `createLiveFxEngine` enjeksiyonu), UI, periyot seçimi, E2E → **Plan 3**. ✅

---

## Plan 3 — yol haritası (bu planın dışında, ayrıca yazılacak)

- **`src/lib/stores/liveGameStore.svelte.ts`** (runes): gerçek-zaman saat + canlı fiyat cache → **`LivePriceSource` impl** (`assetTry(id)`: BIST/altın/EUR doğrudan TRY; kripto `usdPrice × usdTry`) → `createLiveFxEngine(source)` enjeksiyonu → `$derived` skor. WS↔poll orkestrasyonu (`createBinanceFeed` + periyodik `fetchFxSnapshot`/`fetchCryptoSnapshot`), kapat-aç reconcile, periyot **60/180/365** clock override.
- **"Veri eski" rozeti:** `asOf`/`stale`'den türetilen UI göstergesi (HudBar).
- **Zengin ayna bağlam kartı:** statik `holidays2026.ts` verisinden (Plan 1) beslenen tek bağlam kartı bileşeni — API'siz (vizyon kararı).
- **7 bileşen** (HudBar/WalletPanel/MarketPanel/TradePanel/FxDeskPanel/DepositPanel/BalanceMirror — legacy görsel port) + minimal giriş (mod + periyot) + yerleşim A + Playwright E2E (canlı route mock'lu).
