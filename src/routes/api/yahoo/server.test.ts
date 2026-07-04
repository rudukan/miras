import { describe, it, expect, vi } from 'vitest';
import { GET } from './+server';
import { fetchYahooPrice, fetchYahooQuote, fetchFxValue } from '$lib/api/yahooSource';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
function yahooBody(price: number, previousClose?: number) {
  return { chart: { result: [{ meta: { regularMarketPrice: price, previousClose } }] } };
}
/** URL'ye göre yönlendiren sahte fetch (Yahoo sembolleri: USDTRY=X/EURTRY=X + BIST + metaller). */
function routedFetch() {
  return vi.fn((url: string) => {
    if (url.includes('USDTRY=X')) return okJson(yahooBody(40));            // usdTry 40
    if (url.includes('EURTRY=X')) return okJson(yahooBody(80, 76));        // EUR/TRY 80, +5.26%
    if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000)); // ons altın USD -> /31.1034768 = 100 USD/gram
    if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));       // ons gümüş USD -> 1 USD/gram (prevClose yok)
    if (url.includes('THYAO.IS')) return okJson(yahooBody(300, 240));     // +25%
    if (url.includes('AAPL')) return okJson(yahooBody(190, 180));         // ABD hissesi, soneksiz, +5.56%
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

describe('fetchYahooQuote', () => {
  it('previousClose verilince changePct hesaplar', async () => {
    const f = vi.fn(() => okJson(yahooBody(110, 100))) as unknown as typeof fetch;
    const q = await fetchYahooQuote('THYAO.IS', f);
    expect(q.price).toBe(110);
    expect(q.changePct).toBe(10); // (110-100)/100*100
  });
  it('previousClose yoksa changePct undefined', async () => {
    const f = vi.fn(() => okJson(yahooBody(110))) as unknown as typeof fetch;
    const q = await fetchYahooQuote('THYAO.IS', f);
    expect(q.price).toBe(110);
    expect(q.changePct).toBeUndefined();
  });
});

describe('fetchFxValue (birleşik TRY snapshot)', () => {
  it('BIST(TRY) + gram altın/gümüş(TRY) + EUR(TRY) + usdTry üretir', async () => {
    const v = await fetchFxValue(['THYAO'], [], routedFetch());
    expect(v.usdTry).toBe(40);
    expect(v.prices.THYAO).toBe(300);
    expect(v.prices.XAUGRAM).toBe(4000); // 100 USD/gram × 40
    expect(v.prices.XAGGRAM).toBe(40);   // 1 USD/gram × 40
    expect(v.prices.EUR).toBe(80);       // EURTRY=X doğrudan
  });

  it('change haritası: previousClose olan semboller için günlük % döner', async () => {
    const v = await fetchFxValue(['THYAO'], [], routedFetch());
    expect(v.change?.THYAO).toBe(25);                // (300-240)/240*100
    expect(v.change?.XAUGRAM).toBeCloseTo(3.69, 1);  // (3110.35-3000)/3000*100
    expect(v.change?.XAGGRAM).toBeUndefined();        // prevClose yok → atlanır
    expect(v.change?.EUR).toBeCloseTo(5.26, 1);      // (80-76)/76*100 → EUR rozeti (yeni)
  });

  it('geçersiz BIST sembolü tüm snapshot\'ı düşürmez — atlanır, diğerleri gelir', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('USDTRY=X')) return okJson(yahooBody(40));
      if (url.includes('EURTRY=X')) return okJson(yahooBody(80));
      if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000));
      if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));
      if (url.includes('THYAO.IS')) return okJson(yahooBody(300, 240));
      if (url.includes('ZZZZ.IS')) return Promise.resolve({ ok: false, status: 404 } as Response);
      return okJson(yahooBody(1));
    }) as unknown as typeof fetch;

    const v = await fetchFxValue(['THYAO', 'ZZZZ'], [], f);
    expect(v.prices.THYAO).toBe(300);   // sağlam sembol geldi
    expect(v.prices.ZZZZ).toBeUndefined(); // hatalı sembol atlandı
    expect(v.usdTry).toBe(40);          // çekirdek korundu
    expect(v.prices.XAUGRAM).toBe(4000); // metaller korundu
  });

  it('usdTry (USDTRY=X) hatası snapshot\'ı patlatır (atomik çekirdek)', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('USDTRY=X')) return Promise.resolve({ ok: false, status: 503 } as Response);
      return okJson(yahooBody(1));
    }) as unknown as typeof fetch;
    await expect(fetchFxValue(['THYAO'], [], f)).rejects.toThrow();
  });

  it('EUR (EURTRY=X) hatası snapshot\'ı patlatmaz — EUR atlanır, gerisi gelir', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('USDTRY=X')) return okJson(yahooBody(40));
      if (url.includes('EURTRY=X')) return Promise.resolve({ ok: false, status: 503 } as Response);
      if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000));
      if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));
      if (url.includes('THYAO.IS')) return okJson(yahooBody(300, 240));
      return okJson(yahooBody(1));
    }) as unknown as typeof fetch;
    const v = await fetchFxValue(['THYAO'], [], f);
    expect(v.prices.EUR).toBeUndefined();  // EUR atlandı
    expect(v.usdTry).toBe(40);             // çekirdek ayakta
    expect(v.prices.THYAO).toBe(300);
  });

  it('ABD hissesi (soneksiz) USD fiyatını usdTry ile TRY\'ye çevirir', async () => {
    const v = await fetchFxValue([], ['AAPL'], routedFetch());
    expect(v.prices.AAPL).toBe(7600); // 190 USD × 40 usdTry
    expect(v.change?.AAPL).toBeCloseTo(5.56, 1); // (190-180)/180*100
  });

  it('geçersiz US sembolü tüm snapshot\'ı düşürmez — atlanır, diğerleri gelir', async () => {
    const f = vi.fn((url: string) => {
      if (url.includes('USDTRY=X')) return okJson(yahooBody(40));
      if (url.includes('EURTRY=X')) return okJson(yahooBody(80));
      if (url.includes('GC=F')) return okJson(yahooBody(3110.34768, 3000));
      if (url.includes('SI=F')) return okJson(yahooBody(31.1034768));
      if (url.includes('AAPL')) return okJson(yahooBody(190, 180));
      if (url.includes('ZZZZ')) return Promise.resolve({ ok: false, status: 404 } as Response);
      return okJson(yahooBody(1));
    }) as unknown as typeof fetch;

    const v = await fetchFxValue([], ['AAPL', 'ZZZZ'], f);
    expect(v.prices.AAPL).toBe(7600);   // sağlam sembol geldi
    expect(v.prices.ZZZZ).toBeUndefined(); // hatalı sembol atlandı
    expect(v.usdTry).toBe(40);          // çekirdek korundu
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

  it('?us= verildiğinde Cached<FxValue> zarfı döner', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = routedFetch();
    try {
      const res = await GET({ url: new URL('http://localhost/api/yahoo?us=AAPL') } as any);
      const body = await res.json();
      expect(body.stale).toBe(false);
      expect(body.value.prices.AAPL).toBe(7600);
    } finally {
      globalThis.fetch = real;
    }
  });

  it('upstream hata verdiğinde stale:true + FALLBACK döner', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response)) as unknown as typeof fetch;
    try {
      const res = await GET({ url: new URL('http://localhost/api/yahoo?bist=THYAO') } as any);
      const body = await res.json();
      expect(body.stale).toBe(true);
      expect(body.asOf).toBe(0);
      expect(body.value.usdTry).toBe(40); // FALLBACK
    } finally {
      globalThis.fetch = real;
    }
  });
});
