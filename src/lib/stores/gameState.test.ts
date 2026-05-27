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

import { buyAsset, sellAsset } from './gameState';

describe('varlık al/sat', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  function funded() {
    // 100k USD -> TRY ki hisse alabilelim
    return convertUsdToTry(createGameState('vasiyet', 12345, 'p', 0), fx, usd(100_000));
  }

  it('buyAsset: TRY düşer, holding eklenir, avgCost = alış fiyatı', () => {
    const s = funded();
    const price = fx.assetPriceForDay('THYAO', s.clock.day).amount;
    const s2 = buyAsset(s, fx, 'THYAO', 100);
    const h = s2.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(100);
    expect(h.avgCost.amount).toBeCloseTo(price, 2);
    expect(s2.tryBalance.amount).toBeCloseTo(s.tryBalance.amount - price * 100, 2);
  });

  it('buyAsset kesirli units (0.05 BTC)', () => {
    const s = funded();
    const s2 = buyAsset(s, fx, 'BTC', 0.05);
    expect(s2.holdings.find((x) => x.assetId === 'BTC')!.units).toBeCloseTo(0.05, 8);
  });

  it('buyAsset ikinci alış: units toplanır, avgCost ağırlıklı ortalama', () => {
    let s = funded();
    s = buyAsset(s, fx, 'THYAO', 100); // gün 1
    s = buyAsset(s, fx, 'THYAO', 100); // aynı gün, aynı fiyat
    const h = s.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(200);
    const price = fx.assetPriceForDay('THYAO', 1).amount;
    expect(h.avgCost.amount).toBeCloseTo(price, 2);
  });

  it('buyAsset yetersiz TRY -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0); // TRY=0
    expect(() => buyAsset(s, fx, 'THYAO', 1)).toThrow('Insufficient TRY');
  });
  it('buyAsset bilinmeyen varlık -> hata', () => {
    const s = funded();
    expect(() => buyAsset(s, fx, 'YOKBU', 1)).toThrow('Unknown asset');
  });
  it('buyAsset pozitif olmayan units -> hata', () => {
    const s = funded();
    expect(() => buyAsset(s, fx, 'THYAO', 0)).toThrow('positive');
  });

  it('sellAsset: TRY artar, units azalır', () => {
    let s = funded();
    s = buyAsset(s, fx, 'THYAO', 100);
    const before = s.tryBalance.amount;
    const price = fx.assetPriceForDay('THYAO', s.clock.day).amount;
    s = sellAsset(s, fx, 'THYAO', 40);
    expect(s.holdings.find((x) => x.assetId === 'THYAO')!.units).toBe(60);
    expect(s.tryBalance.amount).toBeCloseTo(before + price * 40, 2);
  });
  it('sellAsset tamamı satılınca holding silinir', () => {
    let s = funded();
    s = buyAsset(s, fx, 'THYAO', 100);
    s = sellAsset(s, fx, 'THYAO', 100);
    expect(s.holdings.find((x) => x.assetId === 'THYAO')).toBeUndefined();
  });
  it('sellAsset sahip olunandan fazla -> hata', () => {
    let s = funded();
    s = buyAsset(s, fx, 'THYAO', 10);
    expect(() => sellAsset(s, fx, 'THYAO', 11)).toThrow('Insufficient units');
  });
  it('sellAsset hiç sahip olunmayan -> hata', () => {
    const s = funded();
    expect(() => sellAsset(s, fx, 'THYAO', 1)).toThrow('Insufficient units');
  });
});

import { openDeposit, closeDeposit } from './gameState';

describe('mevduat', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);
  const RATE = VASIYET_2025.data.depositAnnualRate; // 0.42

  function funded() {
    return convertUsdToTry(createGameState('vasiyet', 12345, 'p', 0), fx, usd(100_000));
  }

  it('openDeposit: TRY düşer, mevduat id ile eklenir, seq artar', () => {
    const s = funded();
    const before = s.tryBalance.amount;
    const s2 = openDeposit(s, tryM(100_000), 90, RATE);
    expect(s2.deposits).toHaveLength(1);
    expect(s2.deposits[0].id).toBe('dep-0');
    expect(s2.deposits[0].annualRate).toBe(RATE);
    expect(s2.depositSeq).toBe(1);
    expect(s2.tryBalance.amount).toBeCloseTo(before - 100_000, 2);
  });

  it('closeDeposit erken (vade dolmadan) -> sadece principal', () => {
    let s = funded();
    s = openDeposit(s, tryM(100_000), 90, RATE); // gün 1 açıldı
    const beforeClose = s.tryBalance.amount;
    s = closeDeposit(s, 'dep-0'); // hâlâ gün 1, vade dolmadı
    expect(s.tryBalance.amount).toBeCloseTo(beforeClose + 100_000, 2);
    expect(s.deposits).toHaveLength(0);
  });

  it('openDeposit yetersiz TRY -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => openDeposit(s, tryM(1000), 30, RATE)).toThrow('Insufficient TRY');
  });
  it('closeDeposit bilinmeyen id -> hata', () => {
    const s = funded();
    expect(() => closeDeposit(s, 'yok')).toThrow('Unknown deposit');
  });
});
