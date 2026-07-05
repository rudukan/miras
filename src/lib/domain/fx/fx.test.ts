import { describe, it, expect } from 'vitest';
import { createFxEngine, interpolateAnchors } from './fx';
import { VASIYET_2025 } from '../../data/macro2025';

const ANCHORS = [
  { day: 0, rate: 35.30 },
  { day: 30, rate: 36.00 },
  { day: 365, rate: 42.50 },
];

describe('interpolateAnchors', () => {
  it('ilk çapada başlangıç kuru', () => {
    expect(interpolateAnchors(ANCHORS, 0)).toBe(35.30);
  });
  it('son çapada bitiş kuru', () => {
    expect(interpolateAnchors(ANCHORS, 365)).toBe(42.50);
  });
  it('ara çapada tam değer', () => {
    expect(interpolateAnchors(ANCHORS, 30)).toBe(36.00);
  });
  it('çapalar arası lineer interpolasyon', () => {
    // gün 15: 35.30 + (36.00-35.30)*0.5 = 35.65
    expect(interpolateAnchors(ANCHORS, 15)).toBeCloseTo(35.65, 5);
  });
  it('aralık öncesi -> ilk kura sabitlenir', () => {
    expect(interpolateAnchors(ANCHORS, -10)).toBe(35.30);
  });
  it('aralık sonrası -> son kura sabitlenir', () => {
    expect(interpolateAnchors(ANCHORS, 999)).toBe(42.50);
  });
});

describe('createFxEngine.usdTryForDay', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('deterministik: aynı seed+gün -> aynı sonuç', () => {
    expect(fx.usdTryForDay(100).amount).toBe(fx.usdTryForDay(100).amount);
  });
  it('farklı seed -> (genelde) farklı sonuç', () => {
    const a = createFxEngine(VASIYET_2025, 1).usdTryForDay(100).amount;
    const b = createFxEngine(VASIYET_2025, 2).usdTryForDay(100).amount;
    expect(a).not.toBe(b);
  });
  it('TRY cinsinden döner', () => {
    expect(fx.usdTryForDay(50).currency).toBe('TRY');
  });
  it('gün 0 başlangıç kurunun ±%1.2 bandında (usdTryVolatility=0.012)', () => {
    // usdTryVolatility 0.012 → günlük sapma maksimum %1.2; ±0.01 tryM yuvarlaması için tolerans
    const r = fx.usdTryForDay(0).amount;
    expect(r).toBeGreaterThanOrEqual(35.30 * 0.988 - 0.01);
    expect(r).toBeLessThanOrEqual(35.30 * 1.012 + 0.01);
  });
  it('gürültü trendi bastırmaz: gün 365 > gün 0 (her seed)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const e = createFxEngine(VASIYET_2025, seed);
      expect(e.usdTryForDay(365).amount).toBeGreaterThan(e.usdTryForDay(0).amount);
    }
  });
  it('günlük sapma çapa bandında kalır (±%1.2)', () => {
    // usdTryVolatility=0.012 → her gün baz × (1 ± 0.012) bandında
    for (let day = 0; day <= 365; day++) {
      const base = interpolateAnchors(VASIYET_2025.data.usdTryAnchors, day);
      const r = fx.usdTryForDay(day).amount;
      expect(r).toBeGreaterThanOrEqual(base * 0.988 - 0.01);
      expect(r).toBeLessThanOrEqual(base * 1.012 + 0.01);
    }
  });
});

describe('createFxEngine.assetPriceForDay', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('deterministik: aynı seed+id+gün -> aynı sonuç', () => {
    expect(fx.assetPriceForDay('THYAO', 100).amount)
      .toBe(fx.assetPriceForDay('THYAO', 100).amount);
  });
  it('TRY cinsinden döner', () => {
    expect(fx.assetPriceForDay('THYAO', 10).currency).toBe('TRY');
  });
  it('gün 0 başlangıç fiyatının ±%5 bandında (THYAO=300, volatility=0.050)', () => {
    // THYAO volatility 0.050 → gün 0 maksimum sapma ±%5
    const p = fx.assetPriceForDay('THYAO', 0).amount;
    expect(p).toBeGreaterThanOrEqual(300 * 0.95);
    expect(p).toBeLessThanOrEqual(300 * 1.05);
  });
  it('yıl sonu drift uygulanır (THYAO annualDrift=0.18 -> ~354, > başlangıç)', () => {
    // THYAO annualDrift=0.18: trend = 300*(1+0.18) = 354; gürültü ±%5 → [336, 372]
    const p = fx.assetPriceForDay('THYAO', 365).amount;
    expect(p).toBeGreaterThan(300); // en azından başlangıcı aşmali (drift pozitif)
    expect(p).toBeLessThan(420);    // gürültü dahil üst sınır
  });
  it('bilinmeyen varlık hata fırlatır', () => {
    expect(() => fx.assetPriceForDay('YOKBU', 10)).toThrow('Unknown asset: YOKBU');
  });
  it('farklı günler farklı fiyat verir (gürültü canlı)', () => {
    expect(fx.assetPriceForDay('THYAO', 5).amount)
      .not.toBe(fx.assetPriceForDay('THYAO', 6).amount);
  });
  it('varlıklar bağımsız seri: aynı gün THYAO ve EREGL bağımsız sapar', () => {
    expect(fx.assetPriceForDay('THYAO', 7).amount)
      .not.toBe(fx.assetPriceForDay('EREGL', 7).amount);
  });
  it('non-BIST varlık da fiyatlanır (BTC, crypto)', () => {
    const p = fx.assetPriceForDay('BTC', 0);
    expect(p.currency).toBe('TRY');
    expect(p.amount).toBeGreaterThan(0);
  });
});
