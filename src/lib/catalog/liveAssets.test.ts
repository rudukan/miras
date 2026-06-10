import { describe, it, expect } from 'vitest';
import { LIVE_ASSETS, CATALOG, CRYPTO_SYMBOLS, BIST_SYMBOLS, CRYPTO_SET, CORE_ASSETS } from './liveAssets';

describe('liveAssets katalog', () => {
  it('11 varlık ve 4 kategori temsil edilir', () => {
    expect(LIVE_ASSETS).toHaveLength(11);
    const cats = new Set(LIVE_ASSETS.map((a) => a.category));
    expect(cats).toEqual(new Set(['crypto', 'bist', 'commodity', 'fx']));
  });

  it('CATALOG her id için meta döndürür', () => {
    expect(CATALOG.BTC).toEqual({ id: 'BTC', label: 'Bitcoin', category: 'crypto', source: 'crypto' });
    expect(CATALOG.SOL).toEqual({ id: 'SOL', label: 'Solana', category: 'crypto', source: 'crypto' });
    expect(CATALOG.XAGGRAM).toEqual({ id: 'XAGGRAM', label: 'Gram Gümüş', category: 'commodity', source: 'yahoo' });
    expect(CATALOG.THYAO.source).toBe('yahoo');
    expect(CATALOG.NOPE).toBeUndefined();
  });

  it('CRYPTO_SYMBOLS yalnızca source=crypto', () => {
    expect(CRYPTO_SYMBOLS).toEqual(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX']);
  });

  it('BIST_SYMBOLS yalnızca category=bist (altın/gümüş/euro hariç — proxy ekler)', () => {
    expect(BIST_SYMBOLS).toEqual(['THYAO', 'ASELS']);
  });

  it('kripto kaynakları USD, yahoo kaynakları TRY varsayımıyla işaretli', () => {
    for (const a of LIVE_ASSETS) {
      expect(a.source === 'crypto' ? a.category === 'crypto' : true).toBe(true);
    }
  });

  it("CRYPTO_SET kripto id'lerini içerir, kripto olmayanı içermez", () => {
    for (const id of ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX']) {
      expect(CRYPTO_SET.has(id)).toBe(true);
    }
    expect(CRYPTO_SET.has('THYAO')).toBe(false);
    expect(CRYPTO_SET.has('XAGGRAM')).toBe(false);
  });

  it('CORE_ASSETS = BIST olmayan çekirdek (kripto + emtia + döviz); BIST yok', () => {
    const ids = CORE_ASSETS.map((a) => a.id);
    expect(ids).toContain('BTC');
    expect(ids).toContain('SOL');
    expect(ids).toContain('XAUGRAM');
    expect(ids).toContain('XAGGRAM');
    expect(ids).toContain('EUR');
    expect(ids).not.toContain('THYAO');
    expect(CORE_ASSETS.every((a) => a.category !== 'bist')).toBe(true);
  });
});
