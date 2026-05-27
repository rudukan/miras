import { describe, it, expect } from 'vitest';
import { createGameState, STARTING_USD } from './gameState';

describe('createGameState', () => {
  const s = createGameState('vasiyet', 12345, 'player-1', 1000);

  it('başlangıçta $1,000,000 USD', () => {
    expect(s.usdBalance).toEqual({ amount: STARTING_USD, currency: 'USD' });
  });
  it('başlangıçta ₺0 TRY', () => {
    expect(s.tryBalance).toEqual({ amount: 0, currency: 'TRY' });
  });
  it('gün 1, vasiyet 365g', () => {
    expect(s.clock.day).toBe(1);
    expect(s.clock.totalDays).toBe(365);
  });
  it('boş portföy ve mevduat', () => {
    expect(s.deposits).toEqual([]);
    expect(s.holdings).toEqual([]);
  });
  it('kimlik ve zaman alanları', () => {
    expect(s.playerId).toBe('player-1');
    expect(s.scenarioId).toBe('vasiyet');
    expect(s.seed).toBe(12345);
    expect(s.createdAt).toBe(1000);
    expect(s.updatedAt).toBe(1000);
    expect(s.depositSeq).toBe(0);
  });
});

import { convertUsdToTry, convertTryToUsd } from './gameState';
import { usd, tryM } from '../domain/money';
import { createFxEngine } from '../domain/fx/fx';
import { VASIYET_2025 } from '../data/macro2025';

describe('döviz çevrimi', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('USD->TRY: USD düşer, TRY artar, kur gün 1', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const s1 = convertUsdToTry(s0, fx, usd(1000));
    const rate = fx.usdTryForDay(s0.clock.day).amount;
    expect(s1.usdBalance.amount).toBeCloseTo(STARTING_USD - 1000, 2);
    expect(s1.tryBalance.amount).toBeCloseTo(1000 * rate, 2);
  });

  it('TRY->USD: TRY düşer, USD artar', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const withTry = convertUsdToTry(s0, fx, usd(1000));
    const s2 = convertTryToUsd(withTry, fx, tryM(3530));
    expect(s2.tryBalance.amount).toBeCloseTo(withTry.tryBalance.amount - 3530, 2);
    expect(s2.usdBalance.amount).toBeGreaterThan(withTry.usdBalance.amount);
  });

  it('yetersiz USD -> hata', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => convertUsdToTry(s0, fx, usd(2_000_000))).toThrow('Insufficient USD');
  });
  it('yetersiz TRY -> hata', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => convertTryToUsd(s0, fx, tryM(100))).toThrow('Insufficient TRY');
  });
  it('pozitif olmayan miktar -> hata', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => convertUsdToTry(s0, fx, usd(0))).toThrow('positive');
  });
});
