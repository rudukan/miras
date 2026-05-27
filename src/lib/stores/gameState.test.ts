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
