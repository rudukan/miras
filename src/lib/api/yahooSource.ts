import type { FxValue } from './types';

// Upstream (Yahoo Finance + open.er-api) çekim mantığı. SvelteKit `+server.ts`
// yalnızca GET/POST/... veya `_` önekli export'a izin verdiğinden, test edilebilir
// saf fetcher'lar burada (src/lib/api) durur; route ince proxy kalır
// (CLAUDE.md: "API çağrıları sadece src/lib/api/ altında").

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TROY_OUNCE_GRAMS = 31.1034768;

/** Yahoo proxy için 5s server-cache TTL (CLAUDE.md zorunluluğu). */
export const YAHOO_TTL_MS = 5000;

/** 9 kanon BIST hissesi (varsayılan set; ?bist= ile özelleştirilir). */
export const DEFAULT_BIST = ['THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'SASA', 'YKBNK', 'BIMAS'];

/** Upstream çökerse dönen makul fallback (TRY). Quant rafine edecek (spec §12). */
export const YAHOO_FALLBACK: FxValue = {
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
  const j = (await res.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: unknown } }> } };
  const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== 'number') throw new Error(`Yahoo ${symbol}: geçersiz yapı`);
  return price;
}

/** open.er-api.com'dan USD bazlı kur tablosunu çeker. */
export async function fetchUsdRates(fetchFn: typeof fetch): Promise<Record<string, number>> {
  const res = await fetchFn('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error(`er-api: HTTP ${res.status}`);
  const j = (await res.json()) as { rates?: Record<string, number> };
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
