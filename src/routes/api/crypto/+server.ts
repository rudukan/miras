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
  const j = (await res.json()) as { price?: unknown };
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
    } catch (err) {
      console.error('[api/crypto] ?coins= fetch başarısız, fallback dönülüyor', err);
      return json({ value: FALLBACK, asOf: 0, stale: true }, { headers });
    }
  }
  return json(await cache(), { headers });
};
