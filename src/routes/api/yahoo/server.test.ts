import { describe, it, expect, vi } from 'vitest';
import { fetchYahooPrice, fetchUsdRates, fetchFxValue, GET } from './+server';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
function yahooBody(price: number) {
  return { chart: { result: [{ meta: { regularMarketPrice: price } }] } };
}
/** URL'ye göre yönlendiren sahte fetch (er-api + Yahoo sembolleri). */
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('open.er-api.com')) return okJson({ rates: { TRY: 40, EUR: 0.5 } });
    if (url.includes('GC=F')) return okJson(yahooBody(3110.34768)); // ons altın USD -> /31.1034768 = 100 USD/gram
    if (url.includes('SI=F')) return okJson(yahooBody(31.1034768)); // ons gümüş USD -> 1 USD/gram
    if (url.includes('THYAO.IS')) return okJson(yahooBody(300));
    return okJson(yahooBody(1));
  }) as unknown as typeof fetch;
}

describe('fetchYahooPrice', () => {
  it('regularMarketPrice değerini çeker', async () => {
    const f = vi.fn(() => okJson(yahooBody(288.5))) as unknown as typeof fetch;
    expect(await fetchYahooPrice('THYAO.IS', f)).toBe(288.5);
  });
  it('geçersiz yapıda hata fırlatır', async () => {
    const f = vi.fn(() => okJson({ chart: { result: [] } })) as unknown as typeof fetch;
    await expect(fetchYahooPrice('X.IS', f)).rejects.toThrow();
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response)) as unknown as typeof fetch;
    await expect(fetchYahooPrice('X.IS', f)).rejects.toThrow('503');
  });
});

describe('fetchUsdRates', () => {
  it('USD bazlı kur tablosunu döner', async () => {
    const f = vi.fn(() => okJson({ rates: { TRY: 40.2, EUR: 0.92 } })) as unknown as typeof fetch;
    expect((await fetchUsdRates(f)).TRY).toBe(40.2);
  });
  it('TRY yoksa fırlatır', async () => {
    const f = vi.fn(() => okJson({ rates: { EUR: 0.92 } })) as unknown as typeof fetch;
    await expect(fetchUsdRates(f)).rejects.toThrow();
  });
});

describe('fetchFxValue (birleşik TRY snapshot)', () => {
  it('BIST(TRY) + gram altın/gümüş(TRY) + EUR(TRY) + usdTry üretir', async () => {
    const v = await fetchFxValue(['THYAO'], routedFetch());
    expect(v.usdTry).toBe(40);
    expect(v.prices.THYAO).toBe(300);
    expect(v.prices.XAUGRAM).toBe(4000); // 100 USD/gram × 40
    expect(v.prices.XAGGRAM).toBe(40);   // 1 USD/gram × 40
    expect(v.prices.EUR).toBe(80);       // usdTry / eurPerUsd = 40 / 0.5
  });
});

describe('GET /api/yahoo', () => {
  it('?bist= verildiğinde Cached<FxValue> zarfı döner', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = routedFetch();
    try {
      const res = await GET({ url: new URL('http://localhost/api/yahoo?bist=THYAO') } as any);
      const body = await res.json();
      expect(body.stale).toBe(false);
      expect(body.value.prices.THYAO).toBe(300);
      expect(typeof body.asOf).toBe('number');
    } finally {
      globalThis.fetch = real;
    }
  });
});
