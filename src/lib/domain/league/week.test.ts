import { describe, it, expect } from 'vitest';
import { leagueWeekKey, leagueWeekStart, leagueLockMoment, isLeagueOpen } from './week';

describe('leagueWeekKey', () => {
  it('haftanın herhangi bir anını o haftanın pazartesisine indirger', () => {
    // 2026-07-25 cumartesi → haftanın pazartesisi 2026-07-20
    expect(leagueWeekKey(new Date('2026-07-25T12:00:00+03:00'))).toBe('2026-07-20');
    expect(leagueWeekKey(new Date('2026-07-20T00:00:00+03:00'))).toBe('2026-07-20');
    expect(leagueWeekKey(new Date('2026-07-26T23:59:00+03:00'))).toBe('2026-07-20'); // pazar
  });

  it('pazartesi 00:00 TSİ yeni haftadır (İstanbul günü, UTC değil)', () => {
    // 2026-07-19T22:00Z = 2026-07-20T01:00 TSİ → artık yeni hafta
    expect(leagueWeekKey(new Date('2026-07-19T22:00:00Z'))).toBe('2026-07-20');
    // 2026-07-19T20:00Z = 2026-07-19T23:00 TSİ → hâlâ eski hafta (pazar)
    expect(leagueWeekKey(new Date('2026-07-19T20:00:00Z'))).toBe('2026-07-13');
  });
});

describe('leagueWeekStart', () => {
  it('pazartesi 00:00 Europe/Istanbul anını döndürür', () => {
    expect(leagueWeekStart(new Date('2026-07-25T12:00:00+03:00')).toISOString()).toBe(
      '2026-07-19T21:00:00.000Z', // 2026-07-20T00:00+03:00
    );
  });
});

describe('leagueLockMoment', () => {
  it('yaz (EDT): cuma 16:00 New York = 23:00 TSİ', () => {
    expect(leagueLockMoment('2026-07-20').toISOString()).toBe('2026-07-24T20:00:00.000Z');
  });

  it('kış (EST): cuma 16:00 New York = 00:00 TSİ (ertesi gün)', () => {
    expect(leagueLockMoment('2026-01-05').toISOString()).toBe('2026-01-09T21:00:00.000Z');
  });

  it('cuma NYSE tatiliyse BIST ölçeğine düşer: 18:15 TSİ', () => {
    // 2026-04-03 Good Friday — NYSE kapalı
    expect(leagueLockMoment('2026-03-30').toISOString()).toBe('2026-04-03T15:15:00.000Z');
  });
});

describe('isLeagueOpen', () => {
  it('kilit anından önce açık, sonra kapalı', () => {
    expect(isLeagueOpen(new Date('2026-07-24T19:59:00Z'))).toBe(true);
    expect(isLeagueOpen(new Date('2026-07-24T20:00:00Z'))).toBe(false);
    expect(isLeagueOpen(new Date('2026-07-25T12:00:00Z'))).toBe(false); // cumartesi antrenman
  });

  it('yeni hafta pazartesi tekrar açılır', () => {
    expect(isLeagueOpen(new Date('2026-07-26T21:30:00Z'))).toBe(true); // 2026-07-27 00:30 TSİ
  });
});
