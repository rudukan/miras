import type { Money } from '../money';
import { tryM, add } from '../money';

/** Aktif tek mevduat (TL anapara, zaman-damgası tabanlı). */
export interface ActiveDeposit {
  readonly principalTry: Money;   // TL anapara (açılışta USD→TL)
  readonly usdAtOpen: Money;      // açılışta ödenen USD (dürüst-ayna kıyası)
  readonly usdTryAtOpen: number;  // açılış kuru
  readonly openedAtMs: number;    // gerçek zaman damgası
  readonly annualRate: number;
}

export const TERM_DAYS = 32;
export const DEPOSIT_ANNUAL_RATE = 0.5; // quant kalibre edecek
export const WITHHOLDING_TAX = 0.075;

const DAY_MS = 86_400_000;

/** Açılıştan bu yana geçen gün (kesirli); negatif → 0. */
export function elapsedDays(d: ActiveDeposit, nowMs: number): number {
  return Math.max(0, (nowMs - d.openedAtMs) / DAY_MS);
}

export function isMatured(d: ActiveDeposit, nowMs: number): boolean {
  return elapsedDays(d, nowMs) >= TERM_DAYS;
}

/** Lineer birikmiş NET faiz (stopaj sonrası); TERM_DAYS'te tavanlanır. */
export function accruedNetInterest(d: ActiveDeposit, nowMs: number): Money {
  const days = Math.min(elapsedDays(d, nowMs), TERM_DAYS);
  const gross = d.principalTry.amount * d.annualRate * (days / 365);
  return tryM(gross * (1 - WITHHOLDING_TAX));
}

/** Anapara + o ana kadar birikmiş net faiz (vitrin + mark-to-market tabanı). */
export function currentValueTry(d: ActiveDeposit, nowMs: number): Money {
  return add(d.principalTry, accruedNetInterest(d, nowMs));
}

/** Vade dolunca alınacak net değer (anapara + tam dönem net faiz). */
export function maturityNetValueTry(d: ActiveDeposit): Money {
  const gross = d.principalTry.amount * d.annualRate * (TERM_DAYS / 365);
  return add(d.principalTry, tryM(gross * (1 - WITHHOLDING_TAX)));
}
