import type { Money } from '../money';

/** Piyasa kapalıyken/veri bayatken verilen, açılışı izleyen ilk taze fiyatta gerçekleşecek emir.
 *  `units`-kind: adet emir anında sabitlenir (al/sat). `amountUsd`-kind: yalnız alışta, tutar
 *  gerçekleşme anındaki (açılış) fiyattan adede çevrilir — bayat fiyatla boyutlanmaz. */
export type PendingOrder =
  | { id: string; assetId: string; side: 'buy' | 'sell'; kind: 'units'; units: number; placedAt: number }
  | { id: string; assetId: string; side: 'buy'; kind: 'amountUsd'; amountUsd: Money; placedAt: number };

/** Bekleyen emrin verilen fiyattaki (gerçekleşme anı fiyatı) adet karşılığı.
 *  units-kind: adet emir anında sabittir, fiyattan bağımsız aynen döner.
 *  amountUsd-kind: tutar/fiyat oranı adede çevrilir (TradeForm ile aynı floor/1e4 kuralı). */
export function resolveUnits(order: PendingOrder, priceUsd: number): number {
  if (priceUsd <= 0) throw new Error(`resolveUnits: invalid priceUsd (${priceUsd})`);
  if (order.kind === 'units') return order.units;
  return Math.floor((order.amountUsd.amount / priceUsd) * 1e4) / 1e4;
}
