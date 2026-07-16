import { describe, it, expect, vi } from 'vitest';
import { createTtlCache, createKeyedTtlFetchCache } from './cachedFetch';

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

  it('eşzamanlı get() çağrıları fetcher\'ı yalnızca bir kez tetikler (inflight paylaşımı)', async () => {
    let resolve!: (v: number) => void;
    const fetcher = vi.fn(() => new Promise<number>((r) => { resolve = r; }));
    const get = createTtlCache({ ttlMs: 5000, fallback: 0, fetcher, now: () => 1000 });
    const p1 = get();
    const p2 = get(); // ilk çekim henüz çözülmedi -> aynı inflight'ı beklemeli
    resolve(42);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ value: 42, asOf: 1000, stale: false });
    expect(r2).toEqual({ value: 42, asOf: 1000, stale: false });
  });
});

describe('createKeyedTtlFetchCache', () => {
  it('aynı key TTL içinde ikinci çağrıda fetcher\'ı tekrar çağırmaz', async () => {
    let t = 1000;
    const fetcher = vi.fn(async (key: string) => `${key}:42`);
    const get = createKeyedTtlFetchCache({ ttlMs: 5000, fallback: '', fetcher, now: () => t });
    await get('a');
    t = 3000; // +2s, TTL içinde
    const r = await get('a');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ value: 'a:42', asOf: 1000, stale: false });
  });

  it('farklı key\'ler ayrı ayrı fetch edilir (bağımsız TTL slotları)', async () => {
    const fetcher = vi.fn(async (key: string) => `${key}:val`);
    const get = createKeyedTtlFetchCache({ ttlMs: 5000, fallback: '', fetcher, now: () => 1000 });
    const ra = await get('a');
    const rb = await get('b');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(ra).toEqual({ value: 'a:val', asOf: 1000, stale: false });
    expect(rb).toEqual({ value: 'b:val', asOf: 1000, stale: false });
  });

  it('eşzamanlı aynı-key çağrıları tek uçuşu paylaşır; farklı key kendi uçuşunu tetikler (paylaşmaz)', async () => {
    const resolvers = new Map<string, (v: string) => void>();
    const fetcher = vi.fn(
      (key: string) =>
        new Promise<string>((resolve) => {
          resolvers.set(key, resolve);
        }),
    );
    const get = createKeyedTtlFetchCache({ ttlMs: 5000, fallback: '', fetcher, now: () => 1000 });

    const pa1 = get('a');
    const pa2 = get('a'); // aynı key, henüz çözülmedi -> aynı inflight'ı paylaşmalı
    const pb1 = get('b'); // farklı key -> kendi uçuşunu tetiklemeli, 'a'nın inflight'ını PAYLAŞMAMALI

    expect(fetcher).toHaveBeenCalledTimes(2); // 'a' için 1, 'b' için 1 — key başına
    resolvers.get('a')!('a-value');
    resolvers.get('b')!('b-value');

    const [ra1, ra2, rb1] = await Promise.all([pa1, pa2, pb1]);
    expect(fetcher.mock.calls.filter(([k]) => k === 'a')).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([k]) => k === 'b')).toHaveLength(1);
    expect(ra1).toEqual({ value: 'a-value', asOf: 1000, stale: false });
    expect(ra2).toEqual({ value: 'a-value', asOf: 1000, stale: false });
    expect(rb1).toEqual({ value: 'b-value', asOf: 1000, stale: false });
  });

  it('maxKeys aşılınca gerçek LRU (en az yakın zamanda ERİŞİLEN) key düşer — insertion-order değil', async () => {
    const fetcher = vi.fn(async (key: string) => `${key}:val`);
    const get = createKeyedTtlFetchCache({ ttlMs: 5000, fallback: '', fetcher, maxKeys: 2, now: () => 1000 });

    await get('a'); // sıra: [a]
    await get('b'); // sıra: [a, b]
    await get('a'); // 'a' yeniden erişildi -> LRU tazelenir, sıra: [b, a]
    await get('c'); // kapasite dolu (2); en az yakın zamanda erişilen 'b' düşmeli, 'a' KALMALI

    fetcher.mockClear();
    await get('a'); // 'a' hâlâ TTL içinde ve cache'te olmalı -> fetcher çağrılmamalı
    expect(fetcher).not.toHaveBeenCalled();

    await get('b'); // 'b' önceden atıldı -> yeniden fetch gerekir
    expect(fetcher).toHaveBeenCalledWith('b');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fetcher hatasında (önceki başarı yokken) stale:true + fallback döner', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('down');
    });
    const get = createKeyedTtlFetchCache({ ttlMs: 5000, fallback: 'FALLBACK', fetcher, now: () => 1000 });
    expect(await get('a')).toEqual({ value: 'FALLBACK', asOf: 0, stale: true });
  });

  it('fetcher hatasında (önceki başarı varken) son-bilinen değeri stale:true ile döner', async () => {
    let t = 1000;
    let fail = false;
    const fetcher = vi.fn(async (key: string) => {
      if (fail) throw new Error('down');
      return `${key}:ok`;
    });
    const get = createKeyedTtlFetchCache({ ttlMs: 5000, fallback: 'FALLBACK', fetcher, now: () => t });
    await get('a'); // başarı: value='a:ok', asOf=1000
    t = 7000;
    fail = true; // TTL doldu + upstream çöktü
    expect(await get('a')).toEqual({ value: 'a:ok', asOf: 1000, stale: true });
  });
});
