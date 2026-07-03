import type { Money } from '../money';
import { tryM } from '../money';

export type PropertyKind = 'arsa' | 'konut' | 'isletme';

/** Katalogdaki emlak tanımı (satın alınabilir). */
export interface PropertyDef {
  readonly id: string;
  readonly name: string;
  readonly kind: PropertyKind;
  readonly priceTry: Money;
}

/** Süper sade dilim: 3 emlak, her birinden en fazla 1 adet. Ad/fiyatlar legacy kanonundan. */
export const PROPERTY_CATALOG: readonly PropertyDef[] = [
  { id: 'arsa-ic-anadolu', name: 'İç Anadolu Tarım Arazisi', kind: 'arsa', priceTry: tryM(1_200_000) },
  { id: 'konut-istanbul-1p1', name: 'İstanbul 1+1 Daire', kind: 'konut', priceTry: tryM(4_500_000) },
  { id: 'isletme-kadikoy-kafe', name: 'Kadıköy Butik Kafe', kind: 'isletme', priceTry: tryM(15_000_000) },
];

/** Sahip olunan emlak (zaman-damgası tabanlı kira kasası). */
export interface OwnedProperty {
  readonly propertyId: string;
  readonly priceTryAtBuy: Money;      // alım bedeli — bu dilimde değer sabit, satışta aynen döner
  readonly usdPaid: Money;            // maliyet kaydı (K/Z gösterimi)
  readonly boughtAtMs: number;
  readonly lastCollectedAtMs: number; // kasa birikiminin başlangıç anı
}

/** Yıllık kira / alım bedeli — denge supabı, oynanınca ayarlanır. */
export const RENT_ANNUAL_RATE = 0.6;
/** Kasa tavanı: bu kadar saatlik kira birikince birikim DURUR (tahsil için geri gel). */
export const VAULT_CAP_HOURS = 48;

const HOUR_MS = 3_600_000;
const YEAR_HOURS = 24 * 365;

export function propertyDef(propertyId: string): PropertyDef {
  const def = PROPERTY_CATALOG.find((d) => d.id === propertyId);
  if (!def) throw new Error(`Unknown property: ${propertyId}`);
  return def;
}

/** Verilen saat kadar lineer kira (tek formül — tavan ve birikim aynı yoldan geçer). */
function rentForHours(p: OwnedProperty, hours: number): Money {
  return tryM(p.priceTryAtBuy.amount * RENT_ANNUAL_RATE * (hours / YEAR_HOURS));
}

/** Kasa tavanı: VAULT_CAP_HOURS saatlik kira tutarı. */
export function vaultCapTry(p: OwnedProperty): Money {
  return rentForHours(p, VAULT_CAP_HOURS);
}

/** Kasadaki birikmiş kira: lineer, tavanlı; negatif süre → 0. */
export function accruedRentTry(p: OwnedProperty, nowMs: number): Money {
  const hours = Math.max(0, (nowMs - p.lastCollectedAtMs) / HOUR_MS);
  return rentForHours(p, Math.min(hours, VAULT_CAP_HOURS));
}

/** Kasa doldu mu (birikim durdu mu)? Zaman kıyası — yuvarlama oynaklığından bağımsız. */
export function isVaultFull(p: OwnedProperty, nowMs: number): boolean {
  return (nowMs - p.lastCollectedAtMs) / HOUR_MS >= VAULT_CAP_HOURS;
}

/** Kasayı boşalt: tahsil edilen kira + birikim anchor'ı nowMs'e alınmış yeni property. */
export function collectRent(
  p: OwnedProperty,
  nowMs: number,
): { property: OwnedProperty; rentTry: Money } {
  return {
    property: { ...p, lastCollectedAtMs: nowMs },
    rentTry: accruedRentTry(p, nowMs),
  };
}
