import { describe, it, expect } from 'vitest';
import { istanbulParts, isHoliday, isMarketOpen, nextMarketOpen, newYorkParts } from './calendar';

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

describe('newYorkParts', () => {
  it('America/New_York yerel tarih anahtarı üretir', () => {
    // 2026-01-06 10:00 NY (EST donemi, UTC-5)
    const p = newYorkParts(new Date('2026-01-06T10:00:00-05:00'));
    expect(p.key).toBe('2026-01-06');
    expect(p.hour).toBe(10);
    expect(p.minute).toBe(0);
  });
});

describe('isMarketOpen — us (NYSE)', () => {
  it('hafta içi 9:30–16:00 NY arası açık', () => {
    expect(isMarketOpen('us', new Date('2026-01-06T10:00:00-05:00'))).toBe(true); // Salı 10:00 EST
  });
  it('açılış öncesi (9:29) kapalı', () => {
    expect(isMarketOpen('us', new Date('2026-01-06T09:29:00-05:00'))).toBe(false);
  });
  it('açılış anı (9:30) dahil açık', () => {
    expect(isMarketOpen('us', new Date('2026-01-06T09:30:00-05:00'))).toBe(true);
  });
  it('kapanış (16:00) ve sonrası kapalı', () => {
    expect(isMarketOpen('us', new Date('2026-01-06T16:00:00-05:00'))).toBe(false);
  });
  it('hafta sonu kapalı', () => {
    expect(isMarketOpen('us', new Date('2026-01-10T10:00:00-05:00'))).toBe(false); // Cumartesi
  });
  it('NYSE resmî tatilinde kapalı (Şükran Günü)', () => {
    expect(isMarketOpen('us', new Date('2026-11-26T10:00:00-05:00'))).toBe(false);
  });
  it('TR tatili ama NYSE tatili DEĞİL -> açık (takvimler bağımsız)', () => {
    expect(isMarketOpen('us', new Date('2026-04-23T10:00:00-04:00'))).toBe(true); // EDT dönemi
  });
  it('DST kanıtı: aynı NY-yerel 10:00 FARKLI UTC saatlerinde gerçekleşir, newYorkParts ikisini de 10 okur', () => {
    const jan = new Date('2026-01-06T10:00:00-05:00'); // EST dönemi
    const jul = new Date('2026-07-07T10:00:00-04:00'); // EDT dönemi
    expect(jan.getUTCHours()).toBe(15); // 10:00 EST = 15:00 UTC
    expect(jul.getUTCHours()).toBe(14); // 10:00 EDT = 14:00 UTC — farklı UTC anı, aynı NY yerel saat
    expect(newYorkParts(jan).hour).toBe(10);
    expect(newYorkParts(jul).hour).toBe(10);
    expect(isMarketOpen('us', jan)).toBe(true);
    expect(isMarketOpen('us', jul)).toBe(true);
  });
});

describe('nextMarketOpen', () => {
  it('BIST dışı kategoride argümanı aynen döndürür (hep açık)', () => {
    const at = new Date('2026-01-03T22:00:00+03:00');
    expect(nextMarketOpen('crypto', at).getTime()).toBe(at.getTime());
  });
  it('BIST açıkken o anı döndürür', () => {
    const at = new Date('2026-01-05T11:00:00+03:00'); // Pzt seans içi
    expect(nextMarketOpen('bist', at).getTime()).toBe(at.getTime());
  });
  it('açılış öncesi -> aynı günün 10:00 açılışı', () => {
    const at = new Date('2026-01-05T08:00:00+03:00'); // Pzt 08:00
    const expected = new Date('2026-01-05T10:00:00+03:00');
    expect(nextMarketOpen('bist', at).getTime()).toBe(expected.getTime());
  });
  it('kapanış sonrası -> ertesi iş gününün 10:00 açılışı', () => {
    const at = new Date('2026-01-02T19:00:00+03:00'); // Cuma 19:00 (kapalı)
    const expected = new Date('2026-01-05T10:00:00+03:00'); // sonraki Pzt
    expect(nextMarketOpen('bist', at).getTime()).toBe(expected.getTime());
  });
  it('hafta sonu -> Pazartesi 10:00 açılışı', () => {
    const at = new Date('2026-01-03T12:00:00+03:00'); // Cmt
    const expected = new Date('2026-01-05T10:00:00+03:00');
    expect(nextMarketOpen('bist', at).getTime()).toBe(expected.getTime());
  });
  it('tatil gününü atlar (1 Ocak Per -> 2 Ocak Cum 10:00)', () => {
    const at = new Date('2026-01-01T12:00:00+03:00'); // Yılbaşı (Perşembe, tatil)
    const expected = new Date('2026-01-02T10:00:00+03:00'); // Cuma normal
    expect(nextMarketOpen('bist', at).getTime()).toBe(expected.getTime());
  });
});
