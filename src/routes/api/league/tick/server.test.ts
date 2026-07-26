import { describe, it, expect } from 'vitest';
import { _authorizeTick as authorizeTick, _weekRowFor as weekRowFor } from './+server';

describe('authorizeTick', () => {
  it('doğru sırrı kabul, yanlışı/eksiği reddeder', () => {
    expect(authorizeTick('s3cret', 's3cret')).toBe(true);
    expect(authorizeTick('wrong', 's3cret')).toBe(false);
    expect(authorizeTick(null, 's3cret')).toBe(false);
    expect(authorizeTick('s3cret', '')).toBe(false); // sır yapılandırılmamış → daima ret
  });

  it('uzunluk farkında da sabit sonuç verir (kısa/uzun girdi çökmez)', () => {
    expect(authorizeTick('a', 's3cret')).toBe(false);
    expect(authorizeTick('s3cretlonger', 's3cret')).toBe(false);
  });
});

describe('weekRowFor', () => {
  it('verilen an için hafta satırını üretir', () => {
    expect(weekRowFor(new Date('2026-07-22T12:00:00Z'))).toEqual({
      week_key: '2026-07-20',
      opens_at: '2026-07-19T21:00:00.000Z',
      locks_at: '2026-07-24T20:00:00.000Z',
    });
  });
});
