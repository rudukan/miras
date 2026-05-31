import { describe, it, expect } from 'vitest';
import { istanbulParts, isHoliday } from './calendar';

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
