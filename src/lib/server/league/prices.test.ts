import { describe, it, expect, vi } from 'vitest';
import { assetCategoryOf, stampPrices } from './prices';

describe('assetCategoryOf', () => {
  it('katalog üyelerini kendi kategorisine, ABD sembollerini us, kalanı bist sayar', () => {
    expect(assetCategoryOf('BTC')).toBe('crypto');
    expect(assetCategoryOf('XAUGRAM')).toBe('commodity');
    expect(assetCategoryOf('AAPL')).toBe('us');
    expect(assetCategoryOf('EREGL')).toBe('bist');
  });
});

describe('stampPrices', () => {
  const at = new Date('2026-07-24T14:00:00Z'); // 10:00 New York — NYSE açık, BIST 17:00 açık

  it('kripto fiyatını doğrudan USD damgalar ve taze sayar', async () => {
    const fetchFn = vi.fn();
    const out = await stampPrices(['BTC'], fetchFn, at, {
      fetchCrypto: async () => ({ prices: { BTC: 95000 }, change: {} }),
      fetchYahoo: async () => ({ usdTry: 40, prices: {}, priceAt: {} }),
    });
    expect(out.BTC).toEqual({ priceUsd: 95000, fresh: true });
  });

  it('BIST fiyatını TRY→USD çevirir, seans içi damgalıysa taze sayar', async () => {
    const out = await stampPrices(['THYAO'], vi.fn(), at, {
      fetchCrypto: async () => ({ prices: {}, change: {} }),
      fetchYahoo: async () => ({
        usdTry: 40,
        prices: { THYAO: 400 },
        priceAt: { THYAO: at.getTime() },
      }),
    });
    expect(out.THYAO).toEqual({ priceUsd: 10, fresh: true });
  });

  it('fiyat damgası BUGÜNKÜ seans açılışından eskiyse taze SAYMAZ (15dk tuzağı)', async () => {
    const out = await stampPrices(['THYAO'], vi.fn(), at, {
      fetchCrypto: async () => ({ prices: {}, change: {} }),
      fetchYahoo: async () => ({
        usdTry: 40,
        prices: { THYAO: 400 },
        priceAt: { THYAO: at.getTime() - 86_400_000 }, // dünkü fiyat
      }),
    });
    expect(out.THYAO).toEqual({ priceUsd: 10, fresh: false });
  });

  it('piyasa kapalıyken fiyat gelse de taze saymaz', async () => {
    const closed = new Date('2026-07-25T14:00:00Z'); // cumartesi
    const out = await stampPrices(['THYAO'], vi.fn(), closed, {
      fetchCrypto: async () => ({ prices: {}, change: {} }),
      fetchYahoo: async () => ({ usdTry: 40, prices: { THYAO: 400 }, priceAt: { THYAO: closed.getTime() } }),
    });
    expect(out.THYAO.fresh).toBe(false);
  });

  it('bilinmeyen sembol için kayıt üretmez', async () => {
    const out = await stampPrices(['ZZZZ'], vi.fn(), at, {
      fetchCrypto: async () => ({ prices: {}, change: {} }),
      fetchYahoo: async () => ({ usdTry: 40, prices: {}, priceAt: {} }),
    });
    expect(out.ZZZZ).toBeUndefined();
  });
});
