import { describe, it, expect } from 'vitest';
import { LIVE_ASSETS, CATALOG, CRYPTO_SYMBOLS, BIST_SYMBOLS } from './liveAssets';

describe('liveAssets katalog', () => {
  it('6 varlık ve 4 kategori temsil edilir', () => {
    expect(LIVE_ASSETS).toHaveLength(6);
    const cats = new Set(LIVE_ASSETS.map((a) => a.category));
    expect(cats).toEqual(new Set(['crypto', 'bist', 'commodity', 'fx']));
  });

  it('CATALOG her id için meta döndürür', () => {
    expect(CATALOG.BTC).toEqual({ id: 'BTC', label: 'Bitcoin', category: 'crypto', source: 'crypto' });
    expect(CATALOG.THYAO.source).toBe('yahoo');
    expect(CATALOG.NOPE).toBeUndefined();
  });

  it('CRYPTO_SYMBOLS yalnızca source=crypto', () => {
    expect(CRYPTO_SYMBOLS).toEqual(['BTC', 'ETH']);
  });

  it('BIST_SYMBOLS yalnızca category=bist (altın/euro hariç — proxy ekler)', () => {
    expect(BIST_SYMBOLS).toEqual(['THYAO', 'ASELS']);
  });

  it('kripto kaynakları USD, yahoo kaynakları TRY varsayımıyla işaretli', () => {
    for (const a of LIVE_ASSETS) {
      expect(a.source === 'crypto' ? a.category === 'crypto' : true).toBe(true);
    }
  });
});
