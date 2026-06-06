import type { Money } from '../money';

/**
 * Varlık fiyatını USD cinsinden veren seam. Motor (gameState reducer'ları) bunu
 * tüketir; parite çevrimi store/fx katmanında yapılır → motor SAF-USD kalır.
 * Kripto/EUR doğrudan USD; BIST/altın/gümüş için store `assetTry/usdTry` hesaplar.
 */
export interface UsdPriceOracle {
  /** Varlığın güncel USD fiyatı; canlı fiyat yoksa throw. */
  assetUsd(assetId: string): Money;
}
