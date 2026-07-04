import { describe, it, expect } from 'vitest';
import { US_STOCKS, usStockName, searchUsStocks } from './usStocks';

describe('US_STOCKS statik katalog', () => {
  it('sembol+ad yapısı; fiyat ALANI YOK (yalnız arama beslemesi)', () => {
    expect(US_STOCKS.length).toBeGreaterThanOrEqual(30);
    for (const e of US_STOCKS) {
      expect(typeof e.symbol).toBe('string');
      expect(e.symbol).toBe(e.symbol.toUpperCase());
      expect(typeof e.name).toBe('string');
      expect((e as unknown as Record<string, unknown>).price).toBeUndefined();
    }
  });

  it('semboller tekil', () => {
    const set = new Set(US_STOCKS.map((e) => e.symbol));
    expect(set.size).toBe(US_STOCKS.length);
  });

  it('semboller düz alfanümerik — nokta/tire içeren sembol yok (query string güvenliği)', () => {
    for (const e of US_STOCKS) {
      expect(e.symbol).toMatch(/^[A-Z]+$/);
    }
  });

  it('usStockName: bilinen sembolün adını döner, bilinmeyende sembolün kendisini', () => {
    expect(usStockName('AAPL')).toBe('Apple');
    expect(usStockName('ZZZZ')).toBe('ZZZZ');
  });

  it('searchUsStocks: sembol VEYA ada göre büyük/küçük harf duyarsız eşleşir, sonuç sınırlı', () => {
    expect(searchUsStocks('aapl').some((e) => e.symbol === 'AAPL')).toBe(true);
    expect(searchUsStocks('apple').some((e) => e.symbol === 'AAPL')).toBe(true);
    expect(searchUsStocks('').length).toBe(0); // boş sorgu → sonuç yok
    expect(searchUsStocks('a').length).toBeLessThanOrEqual(12); // sınır
  });
});
