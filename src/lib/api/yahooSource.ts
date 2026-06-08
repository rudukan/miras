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
  change: {},
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

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
