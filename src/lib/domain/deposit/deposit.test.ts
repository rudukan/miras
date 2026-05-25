import { describe, it, expect } from 'vitest';
import { tryM, usd } from '../money';
import {
  openDeposit, closeDeposit, isMatured,
  calculateGrossInterest, calculateNetInterest,
  WITHHOLDING_TAX
} from './deposit';

describe('openDeposit', () => {
  it('creates with given parameters', () => {
    const d = openDeposit('d1', tryM(100_000), 30, 1, 0.42);
    expect(d.id).toBe('d1');
    expect(d.principal.amount).toBe(100_000);
    expect(d.principal.currency).toBe('TRY');
    expect(d.termDays).toBe(30);
    expect(d.openedDay).toBe(1);
    expect(d.annualRate).toBe(0.42);
  });
  it('rejects non-TRY principal', () => {
    expect(() => openDeposit('d1', usd(1000), 30, 1, 0.42))
      .toThrow('Deposit must be in TRY');
  });
  it('rejects zero principal', () => {
    expect(() => openDeposit('d1', tryM(0), 30, 1, 0.42))
      .toThrow('Principal must be positive');
  });
  it('rejects negative principal', () => {
    expect(() => openDeposit('d1', tryM(-100), 30, 1, 0.42))
      .toThrow('Principal must be positive');
  });
});

describe('isMatured', () => {
  // opened day 10, 30-day term -> matures at day 40
  const d = openDeposit('d1', tryM(100_000), 30, 10, 0.42);
  it('false before term ends', () => {
    expect(isMatured(d, 30)).toBe(false);
    expect(isMatured(d, 39)).toBe(false);
  });
  it('true on exact maturity day', () => {
    expect(isMatured(d, 40)).toBe(true);
  });
  it('true after maturity', () => {
    expect(isMatured(d, 50)).toBe(true);
  });
});

describe('calculateGrossInterest', () => {
  // 100,000 TRY at 42% annual for 30 days
  const d = openDeposit('d1', tryM(100_000), 30, 1, 0.42);
  it('zero before maturity', () => {
    expect(calculateGrossInterest(d, 15).amount).toBe(0);
  });
  it('correct 30-day calculation', () => {
    // 100,000 * 0.42 * (30/365) = 3,452.05
    const gross = calculateGrossInterest(d, 31);
    expect(gross.amount).toBeCloseTo(3452.05, 0);
    expect(gross.currency).toBe('TRY');
  });
});

describe('calculateNetInterest', () => {
  const d = openDeposit('d1', tryM(100_000), 30, 1, 0.42);
  it('applies 7.5% withholding tax (stopaj)', () => {
    // Gross 3,452.05 * (1 - 0.075) = 3,193.15
    const net = calculateNetInterest(d, 31);
    expect(net.amount).toBeCloseTo(3193.15, 0);
    expect(net.currency).toBe('TRY');
  });
  it('WITHHOLDING_TAX constant is 0.075', () => {
    expect(WITHHOLDING_TAX).toBe(0.075);
  });
});

describe('closeDeposit', () => {
  const d = openDeposit('d1', tryM(100_000), 30, 1, 0.42);
  it('early withdrawal = principal only, no interest', () => {
    const result = closeDeposit(d, 15);
    expect(result.amount).toBe(100_000);
    expect(result.currency).toBe('TRY');
  });
  it('matured = principal + net interest', () => {
    // 100,000 + 3,193.15 = 103,193.15
    const result = closeDeposit(d, 31);
    expect(result.amount).toBeCloseTo(103_193.15, 0);
    expect(result.currency).toBe('TRY');
  });
});

describe('90-day deposit', () => {
  const d = openDeposit('d2', tryM(500_000), 90, 1, 0.42);
  it('correct gross for 90 days', () => {
    // 500,000 * 0.42 * (90/365) = 51,780.82
    const gross = calculateGrossInterest(d, 91);
    expect(gross.amount).toBeCloseTo(51_780.82, 0);
  });
  it('correct close amount for 90 days', () => {
    // Net: 51,780.82 * 0.925 = 47,897.26
    // Close: 500,000 + 47,897.26 = 547,897.26
    const result = closeDeposit(d, 91);
    expect(result.amount).toBeCloseTo(547_897.26, 0);
  });
});
