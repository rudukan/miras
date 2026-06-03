import { describe, it, expect } from 'vitest';
import { BIST100, bistName, searchBist100 } from './bist100';

describe('BIST100 statik katalog', () => {
  it('sembol+ad yapısı; fiyat ALANI YOK (yalnız arama beslemesi)', () => {
    expect(BIST100.length).toBeGreaterThanOrEqual(30);
    for (const e of BIST100) {
      expect(typeof e.symbol).toBe('string');
      expect(e.symbol).toBe(e.symbol.toUpperCase());
      expect(typeof e.name).toBe('string');
      expect((e as unknown as Record<string, unknown>).price).toBeUndefined();
    }
  });

  it('semboller tekil', () => {
    const set = new Set(BIST100.map((e) => e.symbol));
    expect(set.size).toBe(BIST100.length);
  });

  it('bistName: bilinen sembolün adını döner, bilinmeyende sembolün kendisini', () => {
    expect(bistName('THYAO')).toBe('Türk Hava Yolları');
    expect(bistName('ZZZZ')).toBe('ZZZZ');
  });

  it('searchBist100: sembol VEYA ada göre büyük/küçük harf duyarsız eşleşir, sonuç sınırlı', () => {
    expect(searchBist100('thy').some((e) => e.symbol === 'THYAO')).toBe(true);
    expect(searchBist100('hava').some((e) => e.symbol === 'THYAO')).toBe(true);
    expect(searchBist100('').length).toBe(0); // boş sorgu → sonuç yok
    expect(searchBist100('a').length).toBeLessThanOrEqual(12); // sınır
  });
});
