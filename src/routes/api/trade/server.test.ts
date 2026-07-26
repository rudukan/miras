import { describe, it, expect, vi } from 'vitest';
import {
  _parseTradeRequest as parseTradeRequest,
  _validateAgainstReplay as validateAgainstReplay,
  _withinRateLimit as withinRateLimit,
  _RATE_LIMIT_MAX as RATE_LIMIT_MAX,
} from './+server';
import type { StampedTrade } from '$lib/domain/league/replay';

describe('parseTradeRequest', () => {
  it('geçerli units emrini kabul eder', () => {
    expect(
      parseTradeRequest({ assetId: 'THYAO', side: 'buy', units: 10, clientOrderId: 'abc-order1' }),
    ).toEqual({ ok: true, value: { assetId: 'THYAO', side: 'buy', units: 10, amountUsd: null, clientOrderId: 'abc-order1' } });
  });

  it('geçerli amountUsd emrini kabul eder', () => {
    expect(
      parseTradeRequest({ assetId: 'BTC', side: 'buy', amountUsd: 500, clientOrderId: 'abc-order2' }),
    ).toEqual({ ok: true, value: { assetId: 'BTC', side: 'buy', units: null, amountUsd: 500, clientOrderId: 'abc-order2' } });
  });

  it('katalog dışı sembol biçimini reddeder', () => {
    expect(parseTradeRequest({ assetId: 'thyao; drop', side: 'buy', units: 1, clientOrderId: 'a' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'TOOLONGSYMBOL1', side: 'buy', units: 1, clientOrderId: 'a' }).ok).toBe(false);
  });

  it('negatif/sıfır/absürt adedi reddeder', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 0, clientOrderId: 'abc-order1' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: -5, clientOrderId: 'abc-order1' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1e15, clientOrderId: 'abc-order1' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: Number.NaN, clientOrderId: 'abc-order1' }).ok).toBe(false);
  });

  it('satışta amountUsd kabul etmez (yalnız alışta anlamlı)', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'sell', amountUsd: 100, clientOrderId: 'abc-order1' }).ok).toBe(false);
  });

  it('units ve amountUsd birlikte gelirse reddeder', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1, amountUsd: 100, clientOrderId: 'abc-order1' }).ok).toBe(false);
  });

  it('clientOrderId yoksa/biçimsizse reddeder', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1 }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1, clientOrderId: 'x'.repeat(80) }).ok).toBe(false);
  });
});

describe('validateAgainstReplay', () => {
  const prior: StampedTrade[] = [
    { assetId: 'THYAO', side: 'buy', units: 100, priceUsd: 10, ts: 1 },
  ];

  it('bakiyeye sığan alımı kabul eder', () => {
    const r = validateAgainstReplay(prior, { assetId: 'BTC', side: 'buy', units: 1, priceUsd: 95000, ts: 2 }, 0, 'u1');
    expect(r.ok).toBe(true);
  });

  it('bakiyeyi aşan alımı reddeder', () => {
    const r = validateAgainstReplay(prior, { assetId: 'BTC', side: 'buy', units: 100, priceUsd: 95000, ts: 2 }, 0, 'u1');
    expect(r).toEqual({ ok: false, reason: 'Yetersiz bakiye' });
  });

  it('elde olmayanı satmayı reddeder', () => {
    const r = validateAgainstReplay(prior, { assetId: 'BTC', side: 'sell', units: 1, priceUsd: 95000, ts: 2 }, 0, 'u1');
    expect(r).toEqual({ ok: false, reason: 'Yetersiz pozisyon' });
  });

  it('elde olanı satmayı kabul eder', () => {
    const r = validateAgainstReplay(prior, { assetId: 'THYAO', side: 'sell', units: 50, priceUsd: 11, ts: 2 }, 0, 'u1');
    expect(r.ok).toBe(true);
  });
});

describe('withinRateLimit', () => {
  it('sınırın altında geçirir, sınırda/üstünde reddeder', () => {
    expect(withinRateLimit(0)).toBe(true);
    expect(withinRateLimit(RATE_LIMIT_MAX - 1)).toBe(true);
    expect(withinRateLimit(RATE_LIMIT_MAX)).toBe(false);
  });
});
