import { describe, it, expect } from 'vitest';
import {
  createGameState,
  buyAsset,
  sellAsset,
  advanceTime,
  nextEventDay,
  netWorthUsd,
  profitRate,
  grewDollars,
  STARTING_USD,
} from './gameState';
import { usd } from '../domain/money';
import type { UsdPriceOracle } from '../domain/fx/usdOracle';

// Sahte USD fiyat oracle'ı: sabit USD fiyatları (deterministik test).
function stubOracle(prices: Record<string, number>): UsdPriceOracle {
  return {
    assetUsd(id) {
      const p = prices[id];
      if (p === undefined) throw new Error(`No live price: ${id}`);
      return usd(p);
    },
  };
}

const ORACLE = stubOracle({ THYAO: 7.5, ASELS: 5, BTC: 64000, EUR: 1.1 });

describe('createGameState', () => {
  const s = createGameState('vasiyet', 12345, 'player-1', 1000);

  it('başlangıçta $1,000,000 USD', () => {
    expect(s.usdBalance).toEqual({ amount: STARTING_USD, currency: 'USD' });
  });
  it('gün 1, vasiyet 365g', () => {
    expect(s.clock.day).toBe(1);
    expect(s.clock.totalDays).toBe(365);
  });
  it('boş portföy', () => {
    expect(s.holdings).toEqual([]);
  });
  it('kimlik ve zaman alanları', () => {
    expect(s.playerId).toBe('player-1');
    expect(s.scenarioId).toBe('vasiyet');
    expect(s.seed).toBe(12345);
    expect(s.createdAt).toBe(1000);
    expect(s.updatedAt).toBe(1000);
  });
});

describe('varlık al/sat (USD oto-takas)', () => {
  it('buyAsset: USD düşer, holding eklenir, avgCost = USD alış fiyatı', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const s2 = buyAsset(s0, ORACLE, 'THYAO', 100); // 100 × $7.5 = $750
    const h = s2.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(100);
    expect(h.avgCost).toEqual({ amount: 7.5, currency: 'USD' });
    expect(s2.usdBalance.amount).toBeCloseTo(STARTING_USD - 750, 2);
  });

  it('buyAsset kesirli units (0.05 BTC)', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const s2 = buyAsset(s0, ORACLE, 'BTC', 0.05); // 0.05 × $64000 = $3200
    expect(s2.holdings.find((x) => x.assetId === 'BTC')!.units).toBeCloseTo(0.05, 8);
    expect(s2.usdBalance.amount).toBeCloseTo(STARTING_USD - 3200, 2);
  });

  it('buyAsset ikinci alış: units toplanır, avgCost ağırlıklı ortalama (USD)', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100);
    s = buyAsset(s, ORACLE, 'THYAO', 100); // aynı fiyat
    const h = s.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(200);
    expect(h.avgCost.amount).toBeCloseTo(7.5, 2);
  });

  it('buyAsset yetersiz USD -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'THYAO', 1_000_000)).toThrow('Insufficient USD');
  });
  it('buyAsset fiyatsız varlık -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'YOKBU', 1)).toThrow('No live price');
  });
  it('buyAsset pozitif olmayan units -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'THYAO', 0)).toThrow('positive');
  });

  it('sellAsset: USD artar, units azalır', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100); // -$750
    const before = s.usdBalance.amount;
    s = sellAsset(s, ORACLE, 'THYAO', 40); // +40 × $7.5 = $300
    expect(s.holdings.find((x) => x.assetId === 'THYAO')!.units).toBe(60);
    expect(s.usdBalance.amount).toBeCloseTo(before + 300, 2);
  });
  it('sellAsset tamamı satılınca holding silinir', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100);
    s = sellAsset(s, ORACLE, 'THYAO', 100);
    expect(s.holdings.find((x) => x.assetId === 'THYAO')).toBeUndefined();
  });
  it('sellAsset sahip olunandan fazla -> hata', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 10);
    expect(() => sellAsset(s, ORACLE, 'THYAO', 11)).toThrow('Insufficient units');
  });
  it('sellAsset hiç sahip olunmayan -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => sellAsset(s, ORACLE, 'THYAO', 1)).toThrow('Insufficient units');
  });
});

describe('zaman ilerletme', () => {
  it('advanceTime günü ilerletir', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 10);
    expect(s.clock.day).toBe(11);
  });
  it('advanceTime totalDays üstüne çıkmaz', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 999);
    expect(s.clock.day).toBe(365);
  });
  it('nextEventDay son günü verir', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(nextEventDay(s)).toBe(365);
  });
  it('nextEventDay son günde null', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 999);
    expect(nextEventDay(s)).toBeNull();
  });
});

describe('skor (USD)', () => {
  it('gün 1, pozisyonsuz: net servet = $1,000,000', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(netWorthUsd(s, ORACLE).amount).toBeCloseTo(STARTING_USD, 2);
  });
  it('gün 1 pozisyonsuz: profitRate = 1.0', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(profitRate(s, ORACLE)).toBeCloseTo(1.0, 4);
  });
  it('pozisyonsuz nakit doları büyütmez (grewDollars=false)', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(grewDollars(s, ORACLE)).toBe(false);
  });
  it('alım sonrası net servet korunur (oto-takas, makas yok)', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'BTC', 1); // -$64000 nakit, +$64000 holding
    expect(netWorthUsd(s, ORACLE).amount).toBeCloseTo(STARTING_USD, 2);
  });
  it('grewDollars: holding değeri artınca true', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'BTC', 10); // -$640000, +10 BTC
    // fiyat $64000 → $80000 yükselen oracle ile değerle
    const up = stubOracle({ BTC: 80000 });
    expect(grewDollars(s, up)).toBe(true);
    expect(netWorthUsd(s, up).amount).toBeCloseTo(STARTING_USD + 10 * 16000, 2);
  });
  it('determinizm: aynı aksiyonlar -> aynı net servet', () => {
    function run() {
      let s = createGameState('vasiyet', 7, 'p', 0);
      s = buyAsset(s, ORACLE, 'BTC', 0.1);
      s = buyAsset(s, ORACLE, 'THYAO', 200);
      s = advanceTime(s, 100);
      return netWorthUsd(s, ORACLE).amount;
    }
    expect(run()).toBe(run());
  });
});
