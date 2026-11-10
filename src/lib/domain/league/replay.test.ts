import { describe, it, expect } from 'vitest';
import { replayTrades, valuate, type StampedTrade } from './replay';
import { STARTING_USD } from '../../stores/gameState';

const t = (over: Partial<StampedTrade> = {}): StampedTrade => ({
  assetId: 'THYAO',
  side: 'buy',
  units: 100,
  priceUsd: 10,
  ts: 1,
  ...over,
});

describe('replayTrades', () => {
  it('küçük alışlar replay sırasında da ücretsiz stok üretmez', () => {
    const buys = Array.from({ length: 100 }, (_, i) => t({ units: 0.0001, priceUsd: 40, ts: i }));
    const { state, rejected } = replayTrades(buys, { userId: 'u1', startedAt: 0 });
    expect(rejected).toEqual([]);
    expect(state.usdBalance.amount).toBe(STARTING_USD - 1);
  });
  it('boş listede $1M nakit ve pozisyonsuz başlar', () => {
    const { state, rejected } = replayTrades([], { userId: 'u1', startedAt: 0 });
    expect(state.usdBalance.amount).toBe(STARTING_USD);
    expect(state.holdings).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('alım nakiti düşürür, pozisyon açar', () => {
    const { state } = replayTrades([t()], { userId: 'u1', startedAt: 0 });
    expect(state.usdBalance.amount).toBe(STARTING_USD - 1000);
    expect(state.holdings).toEqual([{ assetId: 'THYAO', units: 100, avgCost: { amount: 10, currency: 'USD' } }]);
  });

  it('satım pozisyonu kapatır, nakiti damgalı fiyattan artırır', () => {
    const { state } = replayTrades(
      [t(), t({ side: 'sell', units: 100, priceUsd: 12, ts: 2 })],
      { userId: 'u1', startedAt: 0 },
    );
    expect(state.usdBalance.amount).toBe(STARTING_USD + 200);
    expect(state.holdings).toEqual([]);
  });

  it('ts sırasına göre uygular — girdi sırası bozuksa bile', () => {
    const { state } = replayTrades(
      [t({ side: 'sell', units: 100, priceUsd: 12, ts: 2 }), t({ ts: 1 })],
      { userId: 'u1', startedAt: 0 },
    );
    expect(state.usdBalance.amount).toBe(STARTING_USD + 200);
  });

  it('bakiyeyi aşan işlemi REDDEDER ve state bozulmadan devam eder (kapanış nihai otorite)', () => {
    const { state, rejected } = replayTrades(
      [t({ units: 1_000_000, priceUsd: 10, ts: 1 }), t({ units: 10, priceUsd: 10, ts: 2 })],
      { userId: 'u1', startedAt: 0 },
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain('Insufficient USD');
    expect(state.usdBalance.amount).toBe(STARTING_USD - 100); // yalnız ikinci işlem geçti
  });

  it('elde olmayanı satmayı REDDEDER', () => {
    const { rejected } = replayTrades([t({ side: 'sell', units: 5 })], { userId: 'u1', startedAt: 0 });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain('Insufficient units');
  });
});

describe('valuate', () => {
  it('nakit + pozisyonları kapanış fiyatlarıyla toplar', () => {
    const { state } = replayTrades([t()], { userId: 'u1', startedAt: 0 });
    expect(valuate(state, { THYAO: 11 })).toEqual({ scoreUsd: STARTING_USD + 100, complete: true });
  });

  it('kapanış fiyatı eksik pozisyonu atlar ve complete=false işaretler', () => {
    const { state } = replayTrades([t()], { userId: 'u1', startedAt: 0 });
    expect(valuate(state, {})).toEqual({ scoreUsd: STARTING_USD - 1000, complete: false });
  });
});
