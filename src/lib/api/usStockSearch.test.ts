import { describe, it, expect, vi } from 'vitest';
import { searchUsStocksLive } from './usStockSearch';

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

describe('searchUsStocksLive', () => {
  it('boş sorgu → fetch çağrısı olmadan [] döner', async () => {
    const spy = vi.fn();
    const result = await searchUsStocksLive('', spy as unknown as typeof fetch);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('whitespace sorgu → fetch çağrısı olmadan [] döner', async () => {
    const spy = vi.fn();
    const result = await searchUsStocksLive('   ', spy as unknown as typeof fetch);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('başarılı yanıt → UsStockEntry[] döner', async () => {
    const f = vi.fn(() =>
      okJson({
        results: [
          { symbol: 'VRT', name: 'Vertiv Holdings Co' },
          { symbol: 'NVDA', name: 'Nvidia Corporation' },
        ],
      }),
    ) as unknown as typeof fetch;
    const result = await searchUsStocksLive('VRT', f);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ symbol: 'VRT', name: 'Vertiv Holdings Co' });
    expect(result[1]).toEqual({ symbol: 'NVDA', name: 'Nvidia Corporation' });
  });

  it('doğru URL\'yi çağırır (encode + /api/usSearch prefix)', async () => {
    const f = vi.fn(() => okJson({ results: [] })) as unknown as typeof fetch;
    await searchUsStocksLive('hello world', f);
    expect(f).toHaveBeenCalledWith('/api/usSearch?q=hello%20world');
  });

  it('HTTP hatası → throw etmez, [] döner', async () => {
    const f = vi.fn(() =>
      Promise.resolve({ ok: false, status: 503 } as Response),
    ) as unknown as typeof fetch;
    const result = await searchUsStocksLive('AAPL', f);
    expect(result).toEqual([]);
  });

  it('network throw → throw etmez, [] döner', async () => {
    const f = vi.fn(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;
    const result = await searchUsStocksLive('AAPL', f);
    expect(result).toEqual([]);
  });

  it('eksik results alanı → [] döner', async () => {
    const f = vi.fn(() => okJson({})) as unknown as typeof fetch;
    const result = await searchUsStocksLive('AAPL', f);
    expect(result).toEqual([]);
  });

  it('UsStockEntry tipiyle uyumlu: sadece symbol + name alanları döner', async () => {
    const f = vi.fn(() =>
      okJson({ results: [{ symbol: 'VRT', name: 'Vertiv' }] }),
    ) as unknown as typeof fetch;
    const [entry] = await searchUsStocksLive('VRT', f);
    expect(Object.keys(entry).sort()).toEqual(['name', 'symbol']);
  });
});
