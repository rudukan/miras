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

import { _settleDecision as settleDecision } from './+server';
import { replayTrades } from '$lib/domain/league/replay';

const emptyState = () => replayTrades([], { userId: 'u1', startedAt: 0 }).state;

describe('settleDecision', () => {
  it('fiyat yoksa bekletir', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, undefined, emptyState())).toEqual({ action: 'wait' });
  });

  it('fiyat bayat/kapalıysa bekletir', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 10, fresh: false }, emptyState())).toEqual({ action: 'wait' });
  });

  it('taze fiyatta units emrini doldurur', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 10, fresh: true }, emptyState())).toEqual({
      action: 'fill',
      units: 10,
      priceUsd: 10,
    });
  });

  it('amountUsd emrini dolum anındaki fiyattan adede çevirir', () => {
    const o = { asset_id: 'BTC', side: 'buy' as const, units: null, amount_usd: 1000 };
    expect(settleDecision(o, { priceUsd: 400, fresh: true }, emptyState())).toEqual({
      action: 'fill',
      units: 2.5,
      priceUsd: 400,
    });
  });

  it('bakiye yetmiyorsa iptal eder', () => {
    const o = { asset_id: 'BTC', side: 'buy' as const, units: 1000, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 95000, fresh: true }, emptyState())).toEqual({
      action: 'cancel',
      reason: 'Yetersiz bakiye',
    });
  });

  it('elde olmayanı satma emrini iptal eder', () => {
    const o = { asset_id: 'BTC', side: 'sell' as const, units: 1, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 95000, fresh: true }, emptyState())).toEqual({
      action: 'cancel',
      reason: 'Yetersiz pozisyon',
    });
  });

  it('taze fiyatta tutar 1 adede bile yetmiyorsa iptal eder', () => {
    const o = { asset_id: 'BTC', side: 'buy' as const, units: null, amount_usd: 0.01 };
    expect(settleDecision(o, { priceUsd: 95000, fresh: true }, emptyState())).toEqual({
      action: 'cancel',
      reason: 'Tutar bu fiyatta işleme yetmiyor',
    });
  });
});
