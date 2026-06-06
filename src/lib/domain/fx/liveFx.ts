/** Canlı TRY fiyat kaynağı — store (canlı fiyat cache) tarafından doldurulur.
 *  Tüm fiyatlar TRY'dir; PriceList gösterimi için kullanılır. USD çevrimi
 *  `UsdPriceOracle` (store) tarafından yapılır. */
export interface LivePriceSource {
  /** Güncel USD/TRY mid kuru. */
  usdTry(): number;
  /** Verilen varlığın güncel TRY fiyatı; canlı fiyat yoksa undefined. */
  assetTry(assetId: string): number | undefined;
}
