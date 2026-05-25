import type { Money } from '../money';
import { tryM, multiply, add } from '../money';

export interface Deposit {
  readonly id: string;
  readonly principal: Money;
  readonly termDays: 30 | 90 | 180;
  readonly openedDay: number;
  readonly annualRate: number;
}

export const WITHHOLDING_TAX = 0.075;

export function openDeposit(
  id: string,
  principal: Money,
  termDays: 30 | 90 | 180,
  currentDay: number,
  rate: number,
): Deposit {
  if (principal.currency !== 'TRY') throw new Error('Deposit must be in TRY');
  if (principal.amount <= 0) throw new Error('Principal must be positive');
  return { id, principal, termDays, openedDay: currentDay, annualRate: rate };
}

export function isMatured(deposit: Deposit, currentDay: number): boolean {
  return currentDay >= deposit.openedDay + deposit.termDays;
}

export function calculateGrossInterest(deposit: Deposit, currentDay: number): Money {
  if (!isMatured(deposit, currentDay)) return tryM(0);
  const dayFraction = deposit.termDays / 365;
  return multiply(deposit.principal, deposit.annualRate * dayFraction);
}

export function calculateNetInterest(deposit: Deposit, currentDay: number): Money {
  const gross = calculateGrossInterest(deposit, currentDay);
  return multiply(gross, 1 - WITHHOLDING_TAX);
}

export function closeDeposit(deposit: Deposit, currentDay: number): Money {
  if (!isMatured(deposit, currentDay)) return deposit.principal;
  return add(deposit.principal, calculateNetInterest(deposit, currentDay));
}
