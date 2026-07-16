import { describe, it, expect, vi } from 'vitest';
import { GET } from './+server';
import { fetchBinancePrice, fetchBinanceTicker, fetchCryptoValue } from '$lib/api/cryptoSource';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('BTCUSDT'))
      return okJson({ symbol: 'BTCUSDT', price: '95000.50', lastPrice: '95000.50', priceChangePercent: '2.5' });
    if (url.includes('ETHUSDT'))
      return okJson({ symbol: 'ETHUSDT', price: '3300.10', lastPrice: '3300.10', priceChangePercent: '-1.2' });
    return okJson({ symbol: '?', price: '1', lastPrice: '1', priceChangePercent: '0' });
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

describe('fetchBinanceTicker', () => {
  it('24s ticker: lastPrice + priceChangePercent döner', async () => {
    const t = await fetchBinanceTicker('BTC', routedFetch());
    expect(t.price).toBe(95000.5);
    expect(t.changePct).toBe(2.5);
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 429 } as Response)) as unknown as typeof fetch;
    await expect(fetchBinanceTicker('BTC', f)).rejects.toThrow('429');
  });
});

describe('fetchCryptoValue', () => {
  it('istenen coinleri USD fiyat + 24s değişimle döner', async () => {
    const v = await fetchCryptoValue(['BTC', 'ETH'], routedFetch());
    expect(v.prices).toEqual({ BTC: 95000.5, ETH: 3300.1 });
    expect(v.change).toEqual({ BTC: 2.5, ETH: -1.2 });
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

/** Global fetch'i sarıp toplam çağrı sayısını izleyen yardımcı — TTL cache hit/miss'i
 *  gerçek fetch adediyle doğrulamak için (call-count assertion'ları). */
function countingFetch(inner: typeof fetch): { fetch: typeof fetch; count: () => number } {
  let calls = 0;
  const wrapped = ((...args: Parameters<typeof fetch>) => {
    calls++;
    return inner(...args);
  }) as typeof fetch;
  return { fetch: wrapped, count: () => calls };
}

describe('GET /api/crypto — keyed cache (audit P1, Task 8: parametreli istekler artık bypass etmiyor)', () => {
  it('?coins=ETH,SOL TTL içinde tekrar istenirse VE sırası değişirse (SOL,ETH) upstream fetch tetiklemez', async () => {
    const real = globalThis.fetch;
    const { fetch: f, count } = countingFetch(routedFetch());
    globalThis.fetch = f;
    try {
      await GET({ url: new URL('http://localhost/api/crypto?coins=ETH,SOL') } as any); // ısıt
      const afterFirst = count();
      expect(afterFirst).toBeGreaterThan(0); // gerçek upstream fetch tetiklendi

      await GET({ url: new URL('http://localhost/api/crypto?coins=ETH,SOL') } as any); // aynı sıra
      expect(count()).toBe(afterFirst); // TTL içinde -> upstream tekrar çağrılmadı

      const res = await GET({ url: new URL('http://localhost/api/crypto?coins=SOL,ETH') } as any); // ters sıra
      expect(count()).toBe(afterFirst); // dedupe+sort normalize -> AYNI cache key
      const body = await res.json();
      expect(body.stale).toBe(false);
      expect(body.value.prices.ETH).toBe(3300.1); // ısınmış cache'ten geldi
    } finally {
      globalThis.fetch = real;
    }
  });

  it('parametresiz istek default-set key\'ini kullanır; 2. çağrıda upstream tekrar çağrılmaz', async () => {
    const real = globalThis.fetch;
    const { fetch: f, count } = countingFetch(routedFetch());
    globalThis.fetch = f;
    try {
      const res1 = await GET({ url: new URL('http://localhost/api/crypto') } as any);
      const afterFirst = count();
      expect(afterFirst).toBeGreaterThan(0);
      const body1 = await res1.json();
      expect(body1.stale).toBe(false);
      expect(body1.value.prices.BTC).toBe(95000.5); // DEFAULT_COINS içeriyor

      await GET({ url: new URL('http://localhost/api/crypto') } as any);
      expect(count()).toBe(afterFirst); // TTL içinde -> upstream tekrar çağrılmadı
    } finally {
      globalThis.fetch = real;
    }
  });
});
