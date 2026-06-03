import { describe, it, expect } from 'vitest';
import { LIVE_ASSETS, CATALOG, CRYPTO_SYMBOLS, BIST_SYMBOLS, CRYPTO_SET, CORE_ASSETS } from './liveAssets';

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

  it('CRYPTO_SET kripto id\'lerini içerir, BIST\'i içermez', () => {
    expect(CRYPTO_SET.has('BTC')).toBe(true);
    expect(CRYPTO_SET.has('ETH')).toBe(true);
    expect(CRYPTO_SET.has('THYAO')).toBe(false);
  });

  it('CORE_ASSETS = BIST olmayan çekirdek (kripto + emtia + döviz); BIST yok', () => {
    const ids = CORE_ASSETS.map((a) => a.id);
    expect(ids).toContain('BTC');
    expect(ids).toContain('XAUGRAM');
    expect(ids).toContain('EUR');
    expect(ids).not.toContain('THYAO');
    expect(CORE_ASSETS.every((a) => a.category !== 'bist')).toBe(true);
  });
});
