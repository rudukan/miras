import type { Money } from '../money';
import { tryM } from '../money';
import type { FxEngine } from './fx';

/** Canlı fiyat kaynağı — Plan 3'te reaktif store (canlı fiyat cache) tarafından doldurulur.
 *  Tüm fiyatlar TRY'dir; kripto USD→TRY çevrimi store/source katmanında (güncel kur) yapılır. */
export interface LivePriceSource {
  /** Güncel USD/TRY mid kuru. */
  usdTry(): number;
  /** Verilen varlığın güncel TRY fiyatı; canlı fiyat yoksa undefined. */
  assetTry(assetId: string): number | undefined;
}

/** Mevcut `FxEngine` arayüzünü canlı fiyatla doldurur.
 *  `day` argümanı YOK SAYILIR — fiyat zamana değil son canlı değere bağlıdır (spec §2).
 *  Makas yok → işlem fiyatı = değerleme fiyatı = mid; reducer'lar değişmeden çalışır (spec §3). */
export function createLiveFxEngine(source: LivePriceSource): FxEngine {
  return {
    usdTryForDay(_day: number): Money {
      return tryM(source.usdTry());
    },
    assetPriceForDay(assetId: string, _day: number): Money {
      const price = source.assetTry(assetId);
      if (price === undefined) throw new Error(`No live price: ${assetId}`);
      return tryM(price);
    },
  };
}
