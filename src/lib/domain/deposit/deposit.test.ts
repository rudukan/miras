import { describe, it, expect } from 'vitest';
import { tryM, usd } from '../money';
import {
  type ActiveDeposit,
  TERM_DAYS,
  DEPOSIT_ANNUAL_RATE,
  WITHHOLDING_TAX,
  elapsedDays,
  isMatured,
  accruedNetInterest,
  currentValueTry,
  maturityNetValueTry,
} from './deposit';

const DAY_MS = 86_400_000;

function make(principal: number, rate = DEPOSIT_ANNUAL_RATE): ActiveDeposit {
  return {
    principalTry: tryM(principal),
    usdAtOpen: usd(principal / 40),
    usdTryAtOpen: 40,
    openedAtMs: 0,
    annualRate: rate,
  };
}

describe('deposit domain (zaman-damgası tabanlı)', () => {
  it('elapsedDays: geçen süreyi gün cinsinden verir, negatif girişi 0 yapar', () => {
    const d = make(1_000_000);
    expect(elapsedDays(d, 16 * DAY_MS)).toBe(16);
    expect(elapsedDays(d, -5 * DAY_MS)).toBe(0);
  });

  it('isMatured: TERM_DAYS dolunca true', () => {
    const d = make(1_000_000);
    expect(isMatured(d, (TERM_DAYS - 1) * DAY_MS)).toBe(false);
    expect(isMatured(d, TERM_DAYS * DAY_MS)).toBe(true);
  });

  it('accruedNetInterest: 0 anında 0', () => {
    expect(accruedNetInterest(make(1_000_000), 0).amount).toBe(0);
  });

  it('accruedNetInterest: yarı yolda lineer + stopaj (16 gün)', () => {
    const gross = 1_000_000 * 0.5 * (16 / 365);
    const expected = Math.round(gross * (1 - WITHHOLDING_TAX) * 100) / 100;
    expect(accruedNetInterest(make(1_000_000), 16 * DAY_MS).amount).toBe(expected);
  });

  it('accruedNetInterest: TERM_DAYS sonrasında tavanlanır (büyümez)', () => {
    const d = make(1_000_000);
    const atTerm = accruedNetInterest(d, TERM_DAYS * DAY_MS).amount;
    const after = accruedNetInterest(d, 100 * DAY_MS).amount;
    expect(after).toBe(atTerm);
  });

  it('currentValueTry: anapara + birikmiş net faiz', () => {
    const d = make(1_000_000);
    const acc = accruedNetInterest(d, 16 * DAY_MS).amount;
    expect(currentValueTry(d, 16 * DAY_MS).amount).toBe(Math.round((1_000_000 + acc) * 100) / 100);
  });

  it('maturityNetValueTry: anapara + tam dönem net faiz = currentValueTry(vade)', () => {
    const d = make(1_000_000);
    expect(maturityNetValueTry(d).amount).toBe(currentValueTry(d, TERM_DAYS * DAY_MS).amount);
  });
});
