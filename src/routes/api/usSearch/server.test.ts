import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './+server';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

/** Gerçekçi Yahoo arama yanıtı — VRT sorgusu. */
function vrtSearchBody() {
  return {
    count: 3,
    quotes: [
      { symbol: 'VRT',     shortname: 'Vertiv Holdings, LLC', longname: 'Vertiv Holdings Co', quoteType: 'EQUITY', exchDisp: 'NYSE' },
      { symbol: '1VRT',    shortname: 'Vertiv Milan',         longname: null,                  quoteType: 'EQUITY', exchDisp: 'Milan' },
      { symbol: 'VRTTOF',  shortname: 'VRT Toronto ETF',      longname: null,                  quoteType: 'ETF',    exchDisp: 'Toronto' },
      { symbol: 'VRT.TO',  shortname: 'VRT Toronto',          longname: null,                  quoteType: 'EQUITY', exchDisp: 'Toronto' },
    ],
  };
}

/** Boş yanıt (anlamsız sorgu). */
function emptySearchBody() {
  return { count: 0, quotes: [] };
}

describe('GET /api/usSearch', () => {
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('boş q → upstream çağrısı olmadan { results: [] } döner', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=') } as any);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('whitespace-only q → upstream çağrısı olmadan { results: [] } döner', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=   ') } as any);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('q eksikse → { results: [] } döner', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch') } as any);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('NYSE/NASDAQ EQUITY filtresini uygular — Milan, Toronto, ETF elenir', async () => {
    globalThis.fetch = vi.fn(() => okJson(vrtSearchBody())) as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=VRT') } as any);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].symbol).toBe('VRT');
    expect(body.results[0].name).toBe('Vertiv Holdings Co'); // longname önce
  });

  it('longname → shortname → symbol önceliği ile name çözülür', async () => {
    globalThis.fetch = vi.fn(() =>
      okJson({
        count: 1,
        quotes: [{ symbol: 'XYZ', shortname: 'XYZ Short', longname: null, quoteType: 'EQUITY', exchDisp: 'NYSE' }],
      }),
    ) as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=XYZ') } as any);
    const body = await res.json();
    expect(body.results[0].name).toBe('XYZ Short');
  });

  it('noktalı/tireli semboller (VRT.TO) düz alfanümerik filtresiyle elenir', async () => {
    globalThis.fetch = vi.fn(() =>
      okJson({
        count: 2,
        quotes: [
          { symbol: 'AAPL', shortname: 'Apple', longname: 'Apple Inc.', quoteType: 'EQUITY', exchDisp: 'NASDAQ' },
          { symbol: 'BRK.B', shortname: 'Berkshire', longname: null, quoteType: 'EQUITY', exchDisp: 'NYSE' },
        ],
      }),
    ) as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=AAPL') } as any);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].symbol).toBe('AAPL');
  });

  it('boş quotes dizisi → { results: [] }', async () => {
    globalThis.fetch = vi.fn(() => okJson(emptySearchBody())) as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=ZZZZZ') } as any);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
  });

  it('upstream HTTP hatası → sessizce { results: [] } döner', async () => {
    // Önceki testlerde cache'lenmiş olmayan benzersiz sorgu kullan.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 429 } as Response),
    ) as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=UPSTREAM_HTTP_ERR') } as any);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('upstream network hatası (throw) → sessizce { results: [] } döner', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=UPSTREAM_NET_ERR') } as any);
    const body = await res.json();
    expect(body).toEqual({ results: [] });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('cache-control: public, max-age=5 header bulunur', async () => {
    globalThis.fetch = vi.fn(() => okJson(emptySearchBody())) as unknown as typeof fetch;
    const res = await GET({ url: new URL('http://localhost/api/usSearch?q=AAPL') } as any);
    expect(res.headers.get('cache-control')).toBe('public, max-age=5');
  });
});
