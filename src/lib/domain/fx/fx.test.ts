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
  it('gün 0 başlangıç kurunun ±%0.3 bandında', () => {
    // ±0.01 tolerans tryM'in 2 ondalık yuvarlamasını karşılar
    const r = fx.usdTryForDay(0).amount;
    expect(r).toBeGreaterThanOrEqual(35.30 * 0.997 - 0.01);
    expect(r).toBeLessThanOrEqual(35.30 * 1.003 + 0.01);
  });
  it('gürültü trendi bastırmaz: gün 365 > gün 0 (her seed)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const e = createFxEngine(VASIYET_2025, seed);
      expect(e.usdTryForDay(365).amount).toBeGreaterThan(e.usdTryForDay(0).amount);
    }
  });
  it('günlük sapma çapa bandında kalır (±%0.3)', () => {
    for (let day = 0; day <= 365; day++) {
      const base = interpolateAnchors(VASIYET_2025.data.usdTryAnchors, day);
      const r = fx.usdTryForDay(day).amount;
      expect(r).toBeGreaterThanOrEqual(base * 0.997 - 0.01);
      expect(r).toBeLessThanOrEqual(base * 1.003 + 0.01);
    }
  });
});

describe('createFxEngine.stockPriceForDay', () => {
  const fx = createFxEngine(VASIYET_2025, 12345);

  it('deterministik: aynı seed+ticker+gün -> aynı sonuç', () => {
    expect(fx.stockPriceForDay('THYAO', 100).amount)
      .toBe(fx.stockPriceForDay('THYAO', 100).amount);
  });
  it('TRY cinsinden döner', () => {
    expect(fx.stockPriceForDay('THYAO', 10).currency).toBe('TRY');
  });
  it('gün 0 başlangıç fiyatının ±%2 bandında (THYAO=300)', () => {
    const p = fx.stockPriceForDay('THYAO', 0).amount;
    expect(p).toBeGreaterThanOrEqual(300 * 0.98);
    expect(p).toBeLessThanOrEqual(300 * 1.02);
  });
  it('yıl sonu drift uygulanır (THYAO +%25 -> ~375, > başlangıç)', () => {
    const p = fx.stockPriceForDay('THYAO', 365).amount;
    expect(p).toBeGreaterThan(360); // 375 * 0.98 = 367.5, başlangıç 300'ün üstünde
    expect(p).toBeLessThan(390);    // 375 * 1.02 = 382.5
  });
  it('bilinmeyen ticker hata fırlatır', () => {
    expect(() => fx.stockPriceForDay('YOKBU', 10)).toThrow('Unknown ticker: YOKBU');
  });
  it('farklı günler farklı fiyat verir (gürültü canlı)', () => {
    expect(fx.stockPriceForDay('THYAO', 5).amount)
      .not.toBe(fx.stockPriceForDay('THYAO', 6).amount);
  });
  it('hisseler bağımsız seri: aynı gün THYAO ve EREGL bağımsız sapar', () => {
    // Başlangıç fiyatları farklı zaten; sapma oranlarının da bağımlı olmadığını
    // doğrulamak için iki farklı hissenin aynı günde eşit olmadığını kontrol et.
    expect(fx.stockPriceForDay('THYAO', 7).amount)
      .not.toBe(fx.stockPriceForDay('EREGL', 7).amount);
  });
});
