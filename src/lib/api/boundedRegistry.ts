/** Sınırlı boyutlu key→değer kayıt defteri (güvenlik denetimi P1-3).
 *  `/api/series` kullanıcı-kontrollü `symbol` anahtarıyla cache closure'ları biriktiriyordu ve
 *  eviction yoktu → sınırsız Map büyümesi (bellek-DoS). Bu registry en fazla `maxSize` giriş tutar;
 *  aşılınca en eski (FIFO) atılır. Map ekleme sırasını koruduğu için `keys().next()` en eskidir. */
export interface BoundedRegistry<T> {
  getOrCreate(key: string, factory: () => T): T;
  size(): number;
}

export function createBoundedRegistry<T>(maxSize: number): BoundedRegistry<T> {
  const map = new Map<string, T>();
  return {
    getOrCreate(key, factory) {
      const existing = map.get(key);
      if (existing !== undefined) return existing;
      if (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      const created = factory();
      map.set(key, created);
      return created;
    },
    size: () => map.size,
  };
}
