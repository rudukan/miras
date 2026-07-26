import { describe, it, expect, vi } from 'vitest';
import { createTradeStamper } from './leagueClient';

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('createTradeStamper', () => {
  it('dolan işlemde sunucu fiyatını ve adedini döner', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({ status: 'filled', orderId: 'o1', units: 10, priceUsd: 12.5, serverTs: '2026-07-22T10:00:00.000Z' }),
    );
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await expect(stamp({ assetId: 'THYAO', side: 'buy', units: 10 })).resolves.toEqual({
      status: 'filled',
      orderId: 'o1',
      units: 10,
      priceUsd: 12.5,
    });
  });

  it('gövdeye clientOrderId ekler ve POST atar', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ status: 'queued', orderId: 'o2' }));
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await stamp({ assetId: 'BTC', side: 'buy', amountUsd: 500 });
    expect(fetchFn).toHaveBeenCalledWith('/api/trade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetId: 'BTC', side: 'buy', amountUsd: 500, clientOrderId: 'order-0001' }),
    });
  });

  it('kuyruğa giren emri queued olarak döner', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ status: 'queued', orderId: 'o3' }));
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await expect(stamp({ assetId: 'THYAO', side: 'sell', units: 3 })).resolves.toEqual({
      status: 'queued',
      orderId: 'o3',
    });
  });

  it('sunucu hatasını mesajıyla fırlatır', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: 'Yetersiz bakiye' }), { status: 422 }));
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await expect(stamp({ assetId: 'BTC', side: 'buy', units: 100 })).rejects.toThrow('Yetersiz bakiye');
  });

  it('ağ hatasında anlaşılır mesaj fırlatır', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await expect(stamp({ assetId: 'BTC', side: 'buy', units: 1 })).rejects.toThrow(
      'Lig işlemi gönderilemedi — bağlantı yok',
    );
  });
});
