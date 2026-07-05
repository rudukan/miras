import { describe, it, expect } from 'vitest';
import { createKeyedTtlCache } from './keyedTtlCache';

describe('createKeyedTtlCache', () => {
  it('set → get aynı key için değeri döner', () => {
    const c = createKeyedTtlCache<number>({ ttlMs: 1000 });
    c.set('a', 42);
    expect(c.get('a')).toBe(42);
  });

  it('bilinmeyen key → undefined döner', () => {
    const c = createKeyedTtlCache<number>({ ttlMs: 1000 });
    expect(c.get('x')).toBeUndefined();
  });

  it('TTL süresi dolunca undefined döner', () => {
    let t = 0;
    const c = createKeyedTtlCache<string>({ ttlMs: 100, now: () => t });
    c.set('k', 'hello');
    t = 99;
    expect(c.get('k')).toBe('hello');
    t = 100; // TTL tam sınırda — artık geçersiz (>= 100)
    expect(c.get('k')).toBeUndefined();
  });

  it('farklı key\'ler bağımsız slot\'larda yaşar', () => {
    const c = createKeyedTtlCache<number>({ ttlMs: 1000 });
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBe(2);
  });

  it('aynı key üzerine yazılınca yeni değer döner', () => {
    let t = 0;
    const c = createKeyedTtlCache<string>({ ttlMs: 1000, now: () => t });
    c.set('k', 'ilk');
    t = 500;
    c.set('k', 'güncellendi');
    expect(c.get('k')).toBe('güncellendi');
  });

  it('maxSize aşılınca en eski giriş atılır', () => {
    const c = createKeyedTtlCache<number>({ ttlMs: 10_000, maxSize: 3 });
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    // Kapasite doldu — yeni giriş 'a'yı atar.
    c.set('d', 4);
    expect(c.get('a')).toBeUndefined(); // en eski atıldı
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
    expect(c.get('d')).toBe(4);
  });

  it('mevcut key güncellenmek istenince kapasite artmaz', () => {
    const c = createKeyedTtlCache<number>({ ttlMs: 10_000, maxSize: 2 });
    c.set('a', 1);
    c.set('b', 2);
    // 'a' güncelleme — eleman sayısı 2 kalmalı, 'b' atılmamalı.
    c.set('a', 99);
    expect(c.get('a')).toBe(99);
    expect(c.get('b')).toBe(2);
  });
});
