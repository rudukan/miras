import { describe, it, expect, vi } from 'vitest';
import { createTtlCache } from './cachedFetch';

describe('createTtlCache', () => {
  it('ilk çağrıda fetcher değerini taze döner (stale:false)', async () => {
    const get = createTtlCache({ ttlMs: 5000, fallback: 0, fetcher: async () => 42, now: () => 1000 });
    expect(await get()).toEqual({ value: 42, asOf: 1000, stale: false });
  });

  it('TTL içinde fetcher\'ı tekrar çağırmaz (cache hit)', async () => {
    let t = 1000;
    const fetcher = vi.fn(async () => 42);
    const get = createTtlCache({ ttlMs: 5000, fallback: 0, fetcher, now: () => t });
    await get();        // t=1000 -> çekim
    t = 3000;           // +2s, TTL içinde
    const r = await get();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ value: 42, asOf: 1000, stale: false });
  });

  it('TTL dolunca fetcher\'ı yeniden çağırır', async () => {
    let t = 1000;
    let val = 42;
    const fetcher = vi.fn(async () => val);
    const get = createTtlCache({ ttlMs: 5000, fallback: 0, fetcher, now: () => t });
    await get();
    t = 7000; val = 99; // +6s, TTL doldu
    const r = await get();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ value: 99, asOf: 7000, stale: false });
  });

  it('hata + önceki başarı -> son değeri stale:true ile döner', async () => {
    let t = 1000;
    let fail = false;
    const fetcher = vi.fn(async () => { if (fail) throw new Error('down'); return 42; });
    const get = createTtlCache({ ttlMs: 5000, fallback: -1, fetcher, now: () => t });
    await get();          // başarı: value=42, asOf=1000
    t = 7000; fail = true; // TTL doldu + upstream çöktü
    expect(await get()).toEqual({ value: 42, asOf: 1000, stale: true });
  });

  it('hata + hiç başarı yok -> fallback\'i stale:true, asOf:0 ile döner', async () => {
    const get = createTtlCache({
      ttlMs: 5000, fallback: -1,
      fetcher: async () => { throw new Error('down'); },
      now: () => 1000,
    });
    expect(await get()).toEqual({ value: -1, asOf: 0, stale: true });
  });
});
