import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createKeyedTtlCache } from '$lib/api/keyedTtlCache';

/** Yahoo Finance v1 arama uç noktası. */
const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Kabul edilen borsa gösterimleri — diğerleri elenir (Milan, Toronto, vb.). */
const ALLOWED_EXCHANGES = new Set(['NYSE', 'NASDAQ']);

/** Düz alfanümerik sembol — nokta/tire içerenleri eler (usStocks.ts kuralı: query string'te virgülle
 *  ayrılan listeye karışmasın diye BRK.B kasıtlı dışarıda, yabancı ikincil listeler de). */
const PLAIN_TICKER_RE = /^[A-Z0-9]+$/;

/** Arama yanıt tipi (Yahoo Finance v1). */
interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
}
interface YahooSearchResponse {
  count?: number;
  quotes?: YahooSearchQuote[];
}

export interface UsSearchResult {
  symbol: string;
  name: string;
}

/** Modül-seviyesi keyed TTL cache: sorgu başına ayrı slot, 5s TTL, max 50 giriş. */
const searchCache = createKeyedTtlCache<UsSearchResult[]>({
  ttlMs: 5_000,
  maxSize: 50,
});

export const GET: RequestHandler = async ({ url }) => {
  const headers = { 'cache-control': 'public, max-age=5' };
  const q = (url.searchParams.get('q') ?? '').trim();

  // Boş/whitespace sorgu → upstream'e gitme.
  if (q === '') {
    return json({ results: [] }, { headers });
  }

  // Cache hit
  const cached = searchCache.get(q);
  if (cached !== undefined) {
    return json({ results: cached }, { headers });
  }

  // Upstream çağrı
  try {
    const res = await fetch(
      `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
      { headers: { 'User-Agent': UA } },
    );
    if (!res.ok) {
      console.error(`[api/usSearch] Yahoo upstream HTTP ${res.status} — q="${q}"`);
      return json({ results: [] }, { headers });
    }

    const body = (await res.json()) as YahooSearchResponse;
    const quotes: YahooSearchQuote[] = body.quotes ?? [];

    const results: UsSearchResult[] = quotes
      .filter(
        (q) =>
          q.quoteType === 'EQUITY' &&
          q.exchDisp !== undefined &&
          ALLOWED_EXCHANGES.has(q.exchDisp) &&
          typeof q.symbol === 'string' &&
          PLAIN_TICKER_RE.test(q.symbol),
      )
      .map((qt) => ({
        symbol: qt.symbol as string,
        name: (qt.longname ?? qt.shortname ?? qt.symbol) as string,
      }));

    searchCache.set(q, results);
    return json({ results }, { headers });
  } catch (err) {
    console.error(`[api/usSearch] fetch hatası — q="${q}"`, err);
    return json({ results: [] }, { headers });
  }
};
