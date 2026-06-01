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
