/**
 * Lig fiyat damgası: istemcinin beyan ettiği fiyata ASLA güvenilmez — fiyat burada,
 * sunucunun kendi upstream çağrısından üretilir. `/api/trade` ve `/api/league/tick`
 * tek kaynak olarak bunu kullanır.
 */
import { fetchFxValue } from '$lib/api/yahooSource';
import { fetchCryptoValue } from '$lib/api/cryptoSource';
import type { CryptoValue, FxValue } from '$lib/api/types';
import { CATALOG, CRYPTO_SET } from '$lib/catalog/liveAssets';
import { US_STOCKS } from '$lib/catalog/usStocks';
import { isMarketOpen, sessionOpenMs } from '$lib/domain/calendar/calendar';
import type { AssetCategory } from '$lib/domain/scenario/types';

const US_SYMBOLS: ReadonlySet<string> = new Set(US_STOCKS.map((s) => s.symbol));

export interface StampedPrice {
  /** Sunucunun gördüğü USD fiyat. */
  readonly priceUsd: number;
  /** Anlık işleme uygun mu — kapalı piyasa/bayat damga false yapar (emir kuyruğa girer). */
  readonly fresh: boolean;
}

/** İstemcideki `isAssetFresh` kategori çözümünün sunucu ikizi: katalog → ABD kataloğu → bist. */
export function assetCategoryOf(assetId: string): AssetCategory {
  const known = CATALOG[assetId]?.category;
  if (known !== undefined) return known;
  return US_SYMBOLS.has(assetId) ? 'us' : 'bist';
}

/** Test edilebilirlik için upstream çağrıları enjekte edilebilir (varsayılan gerçek kaynaklar). */
export interface PriceDeps {
  fetchCrypto?: (coins: readonly string[], fetchFn: typeof fetch) => Promise<CryptoValue>;
  fetchYahoo?: (
    bist: readonly string[],
    us: readonly string[],
    fetchFn: typeof fetch,
  ) => Promise<FxValue>;
}

/** İstenen sembolleri tek turda damgalar. Fiyatı bulunamayan sembol sonuçta HİÇ yer almaz
 *  (çağıran `undefined` kontrolüyle "fiyat yok" durumunu ayırt eder). */
export async function stampPrices(
  assetIds: readonly string[],
  fetchFn: typeof fetch,
  at: Date,
  deps: PriceDeps = {},
): Promise<Record<string, StampedPrice>> {
  const fetchCrypto = deps.fetchCrypto ?? ((c, f) => fetchCryptoValue(c, f));
  const fetchYahoo = deps.fetchYahoo ?? ((b, u, f) => fetchFxValue(b, u, f));

  const wanted = Array.from(new Set(assetIds));
  const crypto = wanted.filter((id) => CRYPTO_SET.has(id));
  const bist = wanted.filter((id) => assetCategoryOf(id) === 'bist');
  const us = wanted.filter((id) => assetCategoryOf(id) === 'us');
  // Emtia/döviz (XAUGRAM/XAGGRAM/EUR) yahoo snapshot'ında her durumda gelir — istenmez.
  const needsYahoo = wanted.some((id) => !CRYPTO_SET.has(id));

  const [cryptoValue, fxValue] = await Promise.all([
    crypto.length > 0 ? fetchCrypto(crypto, fetchFn) : Promise.resolve<CryptoValue>({ prices: {} }),
    needsYahoo
      ? fetchYahoo(bist, us, fetchFn)
      : Promise.resolve<FxValue>({ usdTry: 0, prices: {} }),
  ]);

  const out: Record<string, StampedPrice> = {};
  for (const id of wanted) {
    if (CRYPTO_SET.has(id)) {
      const p = cryptoValue.prices[id];
      // Kripto 7/24 açık: fiyat geldiyse tazedir.
      if (p !== undefined && p > 0) out[id] = { priceUsd: p, fresh: true };
      continue;
    }
    const tryPrice = fxValue.prices[id];
    if (tryPrice === undefined || !(fxValue.usdTry > 0)) continue;
    const priceUsd = tryPrice / fxValue.usdTry;
    const category = assetCategoryOf(id);
    let fresh: boolean;
    if (category !== 'bist' && category !== 'us') {
      fresh = true; // altın/gümüş/EUR: seans kavramı yok
    } else {
      // İstemcideki isAssetFresh ile AYNI kural: seans açık + damga BUGÜNKÜ açılıştan sonra.
      const stampedAt = fxValue.priceAt?.[id];
      fresh =
        isMarketOpen(category, at) &&
        stampedAt !== undefined &&
        stampedAt >= sessionOpenMs(category, at);
    }
    out[id] = { priceUsd, fresh };
  }
  return out;
}
