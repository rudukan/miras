import { describe, it, expect } from 'vitest';
import { istanbulParts, isHoliday, isMarketOpen } from './calendar';

describe('istanbulParts', () => {
  it('Europe/Istanbul yerel tarih anahtarı üretir (YYYY-MM-DD)', () => {
    // 2026-01-05 10:30 Istanbul (UTC+3) -> 07:30 UTC
    const p = istanbulParts(new Date('2026-01-05T10:30:00+03:00'));
    expect(p.key).toBe('2026-01-05');
    expect(p.hour).toBe(10);
    expect(p.minute).toBe(30);
  });
  it('hafta gününü 1=Pzt..7=Paz olarak verir', () => {
    expect(istanbulParts(new Date('2026-01-05T10:00:00+03:00')).weekday).toBe(1); // Pazartesi
    expect(istanbulParts(new Date('2026-01-03T10:00:00+03:00')).weekday).toBe(6); // Cumartesi
    expect(istanbulParts(new Date('2026-01-04T10:00:00+03:00')).weekday).toBe(7); // Pazar
  });
  it('UTC ifadesini Istanbul yerel gününe çevirir', () => {
    // 2026-01-05 23:30 UTC = 2026-01-06 02:30 Istanbul -> gün ilerler
    const p = istanbulParts(new Date('2026-01-05T23:30:00Z'));
    expect(p.key).toBe('2026-01-06');
    expect(p.hour).toBe(2);
  });
});

describe('isHoliday', () => {
  it('millî tatili tanır', () => {
    expect(isHoliday(new Date('2026-04-23T12:00:00+03:00'))).toBe(true);
  });
  it('dinî bayramı tanır (tahmini)', () => {
    expect(isHoliday(new Date('2026-05-28T12:00:00+03:00'))).toBe(true);
  });
  it('normal iş gününü tatil saymaz', () => {
    expect(isHoliday(new Date('2026-01-05T12:00:00+03:00'))).toBe(false);
  });
});

describe('isMarketOpen', () => {
  it('kripto her zaman açık (7/24)', () => {
    expect(isMarketOpen('crypto', new Date('2026-01-03T03:00:00+03:00'))).toBe(true); // Cmt gece
    expect(isMarketOpen('crypto', new Date('2026-01-01T12:00:00+03:00'))).toBe(true); // tatil
  });
  it('döviz ve emtia her zaman açık (v1)', () => {
    expect(isMarketOpen('fx', new Date('2026-01-03T22:00:00+03:00'))).toBe(true);
    expect(isMarketOpen('commodity', new Date('2026-01-01T22:00:00+03:00'))).toBe(true);
  });
  it('BIST hafta içi 10:00–18:00 arası açık', () => {
    expect(isMarketOpen('bist', new Date('2026-01-05T10:30:00+03:00'))).toBe(true);  // Pzt 10:30
    expect(isMarketOpen('bist', new Date('2026-01-05T17:59:00+03:00'))).toBe(true);  // kapanışa yakın
  });
  it('BIST açılış öncesi kapalı (10:00 sınırı)', () => {
    expect(isMarketOpen('bist', new Date('2026-01-05T09:59:00+03:00'))).toBe(false);
    expect(isMarketOpen('bist', new Date('2026-01-05T10:00:00+03:00'))).toBe(true); // 10:00 dahil
  });
  it('BIST kapanışta ve sonrasında kapalı (18:00 sınırı)', () => {
    expect(isMarketOpen('bist', new Date('2026-01-05T18:00:00+03:00'))).toBe(false); // 18:00 hariç
    expect(isMarketOpen('bist', new Date('2026-01-05T18:30:00+03:00'))).toBe(false);
  });
  it('BIST hafta sonu kapalı', () => {
    expect(isMarketOpen('bist', new Date('2026-01-03T12:00:00+03:00'))).toBe(false); // Cmt
    expect(isMarketOpen('bist', new Date('2026-01-04T12:00:00+03:00'))).toBe(false); // Paz
  });
  it('BIST resmî tatilde kapalı (saat uygun olsa bile)', () => {
    expect(isMarketOpen('bist', new Date('2026-04-23T12:00:00+03:00'))).toBe(false);
  });
});
