import { describe, it, expect, vi } from 'vitest';
import { fetchBinancePrice, fetchCryptoValue, GET } from './+server';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('BTCUSDT')) return okJson({ symbol: 'BTCUSDT', price: '95000.50' });
    if (url.includes('ETHUSDT')) return okJson({ symbol: 'ETHUSDT', price: '3300.10' });
    return okJson({ symbol: '?', price: '1' });
  }) as unknown as typeof fetch;
}

describe('fetchBinancePrice', () => {
  it('ticker fiyatını number olarak çeker (USDT eki)', async () => {
    expect(await fetchBinancePrice('BTC', routedFetch())).toBe(95000.5);
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 429 } as Response)) as unknown as typeof fetch;
    await expect(fetchBinancePrice('BTC', f)).rejects.toThrow('429');
  });
  it('geçersiz fiyatta fırlatır', async () => {
    const f = vi.fn(() => okJson({ symbol: 'BTCUSDT', price: 'NaN' })) as unknown as typeof fetch;
    await expect(fetchBinancePrice('BTC', f)).rejects.toThrow();
  });
});

describe('fetchCryptoValue', () => {
  it('istenen coinleri USD fiyatlarıyla döner', async () => {
    const v = await fetchCryptoValue(['BTC', 'ETH'], routedFetch());
    expect(v.prices).toEqual({ BTC: 95000.5, ETH: 3300.1 });
  });
});

describe('GET /api/crypto', () => {
  it('?coins= verildiğinde Cached<CryptoValue> zarfı döner', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = routedFetch();
    try {
      const res = await GET({ url: new URL('http://localhost/api/crypto?coins=BTC,ETH') } as any);
      const body = await res.json();
      expect(body.stale).toBe(false);
      expect(body.value.prices.BTC).toBe(95000.5);
      expect(typeof body.asOf).toBe('number');
    } finally {
      globalThis.fetch = real;
    }
  });
  it('upstream hata verdiğinde stale:true + FALLBACK döner', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response)) as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await GET({ url: new URL('http://localhost/api/crypto?coins=BTC') } as any);
      const body = await res.json();
      expect(body.stale).toBe(true);
      expect(body.asOf).toBe(0);
      expect(body.value.prices.BTC).toBe(95000); // FALLBACK
    } finally {
      globalThis.fetch = real;
      errSpy.mockRestore();
    }
  });
});
