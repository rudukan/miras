import type { AssetCategory } from '../domain/scenario/types';

/** Canlı dilim evreninin tek bir varlığının meta'sı.
 *  `category` → market-açık kararı (calendar.isMarketOpen).
 *  `source`  → fiyatın hangi proxy'den geldiği + USD→TRY çevrimi gerekip gerekmediği. */
export interface LiveAssetMeta {
  readonly id: string;
  readonly label: string;
  readonly category: AssetCategory;
  readonly source: 'crypto' | 'yahoo';
}

/** İnce dilim evreni — açık evren DEĞİL: 4 kategoriyi temsil eden küçük, hızlı-test edilebilir liste.
 *  Kripto USD gelir (store TRY'ye çevirir); yahoo kaynakları zaten TRY (proxy çevirir). */
export const LIVE_ASSETS: ReadonlyArray<LiveAssetMeta> = [
  { id: 'BTC', label: 'Bitcoin', category: 'crypto', source: 'crypto' },
  { id: 'ETH', label: 'Ethereum', category: 'crypto', source: 'crypto' },
  { id: 'THYAO', label: 'Türk Hava Yolları', category: 'bist', source: 'yahoo' },
  { id: 'ASELS', label: 'Aselsan', category: 'bist', source: 'yahoo' },
  { id: 'XAUGRAM', label: 'Gram Altın', category: 'commodity', source: 'yahoo' },
  { id: 'EUR', label: 'Euro', category: 'fx', source: 'yahoo' },
];

/** id → meta hızlı erişim tablosu (store source closure'ı bunu kullanır). */
export const CATALOG: Readonly<Record<string, LiveAssetMeta>> = Object.fromEntries(
  LIVE_ASSETS.map((a) => [a.id, a]),
);

/** Binance feed/snapshot'a istenecek coin sembolleri (source==='crypto'). */
export const CRYPTO_SYMBOLS: ReadonlyArray<string> = LIVE_ASSETS.filter(
  (a) => a.source === 'crypto',
).map((a) => a.id);

/** Yahoo proxy'sine ?bist= ile istenecek BIST sembolleri.
 *  (XAUGRAM/XAGGRAM/EUR proxy tarafından her durumda eklenir — burada istenmez.) */
export const BIST_SYMBOLS: ReadonlyArray<string> = LIVE_ASSETS.filter(
  (a) => a.category === 'bist',
).map((a) => a.id);

/** Hızlı kripto üyelik kontrolü (store source closure'ı: kripto → USD×usdTry, diğer → TRY proxy). */
export const CRYPTO_SET: ReadonlySet<string> = new Set(CRYPTO_SYMBOLS);

/** BIST olmayan çekirdek varlıklar — fiyat listesinde HER ZAMAN görünür (kripto + emtia + döviz). */
export const CORE_ASSETS: ReadonlyArray<LiveAssetMeta> = LIVE_ASSETS.filter(
  (a) => a.category !== 'bist',
);
