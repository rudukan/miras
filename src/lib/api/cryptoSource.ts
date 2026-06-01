import type { CryptoValue } from './types';

// Upstream (Binance REST) çekim mantığı. SvelteKit `+server.ts` yalnızca GET/POST/...
// veya `_` önekli export'a izin verdiğinden, test edilebilir saf fetcher'lar burada
// (src/lib/api) durur; route ince proxy kalır
// (CLAUDE.md: "API çağrıları sadece src/lib/api/ altında").

/** Binance proxy için 5s server-cache TTL. */
export const CRYPTO_TTL_MS = 5000;

/** Varsayılan coin seti (?coins= ile özelleştirilir). */
export const DEFAULT_COINS = ['BTC', 'ETH', 'SOL'];

/** Upstream çökerse dönen fallback (USD). Quant rafine edecek (spec §12). */
export const CRYPTO_FALLBACK: CryptoValue = { prices: { BTC: 95000, ETH: 3300, SOL: 200 } };

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
