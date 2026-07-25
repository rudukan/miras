import { describe, it, expect, vi } from 'vitest';
import { parseTradeRequest } from './+server';

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
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 0, clientOrderId: 'a' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: -5, clientOrderId: 'a' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1e15, clientOrderId: 'a' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: Number.NaN, clientOrderId: 'a' }).ok).toBe(false);
  });

  it('satışta amountUsd kabul etmez (yalnız alışta anlamlı)', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'sell', amountUsd: 100, clientOrderId: 'a' }).ok).toBe(false);
  });

  it('units ve amountUsd birlikte gelirse reddeder', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1, amountUsd: 100, clientOrderId: 'a' }).ok).toBe(false);
  });

  it('clientOrderId yoksa/biçimsizse reddeder', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1 }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1, clientOrderId: 'x'.repeat(80) }).ok).toBe(false);
  });
});
