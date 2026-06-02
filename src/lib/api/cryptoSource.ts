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
export const CRYPTO_FALLBACK: CryptoValue = { prices: { BTC: 95000, ETH: 3300, SOL: 200 }, change: {} };

/** Binance ticker/price'tan tek coin'in USDT fiyatını number olarak çeker. */
export async function fetchBinancePrice(coin: string, fetchFn: typeof fetch): Promise<number> {
  const res = await fetchFn(`https://api.binance.com/api/v3/ticker/price?symbol=${coin}USDT`);
  if (!res.ok) throw new Error(`Binance ${coin}: HTTP ${res.status}`);
  const j = (await res.json()) as { price?: unknown };
  const price = Number(j?.price);
  if (!Number.isFinite(price)) throw new Error(`Binance ${coin}: geçersiz fiyat`);
  return price;
}

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
