import { describe, it, expect } from 'vitest';
import { fetchYahooQuote, fetchFxValue } from './yahooSource';

describe('yahooSource', () => {
  describe('fetchYahooQuote', () => {
    it('should extract marketTimeMs from regularMarketTime (seconds → ms)', async () => {
      const mockFetchFn = async () => {
        return {
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 288,
                    previousClose: 280,
                    regularMarketTime: 1784200000, // epoch seconds
                  },
                },
              ],
            },
          }),
        };
      };

      const result = await fetchYahooQuote('THYAO.IS', mockFetchFn as unknown as typeof fetch);

      expect(result.price).toBe(288);
      expect(result.changePct).toBe(2.86);
      expect(result.marketTimeMs).toBe(1784200000000); // converted to ms
    });

    it('should return undefined marketTimeMs when regularMarketTime is missing', async () => {
      const mockFetchFn = async () => {
        return {
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 100,
                    previousClose: 95,
                    // regularMarketTime is missing
                  },
                },
              ],
            },
          }),
        };
      };

      const result = await fetchYahooQuote('NVDA', mockFetchFn as unknown as typeof fetch);

      expect(result.price).toBe(100);
      expect(result.changePct).toBe(5.26);
      expect(result.marketTimeMs).toBeUndefined();
    });

    it('should handle non-number regularMarketTime gracefully', async () => {
      const mockFetchFn = async () => {
        return {
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 100,
                    previousClose: 95,
                    regularMarketTime: 'not-a-number', // invalid type
                  },
                },
              ],
            },
          }),
        };
      };

      const result = await fetchYahooQuote('NVDA', mockFetchFn as unknown as typeof fetch);

      expect(result.marketTimeMs).toBeUndefined();
    });
  });

  describe('fetchFxValue', () => {
    it('should populate priceAt for BIST and US symbols only', async () => {
      const mockFetchFn = async (url: string) => {
        // Route based on URL to return different data
        let price: number;
        let marketTime: number | undefined;

        if (url.includes('USDTRY=X')) {
          price = 40;
          marketTime = 1784200000;
        } else if (url.includes('THYAO.IS')) {
          price = 288;
          marketTime = 1784200001;
        } else if (url.includes('NVDA')) {
          price = 150;
          marketTime = 1784200002;
        } else if (url.includes('GC=F')) {
          price = 2000;
          marketTime = 1784200003;
        } else if (url.includes('SI=F')) {
          price = 30;
          marketTime = 1784200004;
        } else if (url.includes('EURTRY=X')) {
          price = 45;
          marketTime = 1784200005;
        } else {
          price = 100;
          marketTime = 1784200000;
        }

        return {
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: price,
                    previousClose: price - 1,
                    regularMarketTime: marketTime,
                  },
                },
              ],
            },
          }),
        };
      };

      const result = await fetchFxValue(['THYAO'], ['NVDA'], mockFetchFn as unknown as typeof fetch);

      // priceAt should contain BIST and US symbols
      expect(result.priceAt).toBeDefined();
      expect(result.priceAt?.THYAO).toBe(1784200001000); // ms
      expect(result.priceAt?.NVDA).toBe(1784200002000); // ms

      // priceAt should NOT contain metals or EUR
      expect(result.priceAt?.XAUGRAM).toBeUndefined();
      expect(result.priceAt?.XAGGRAM).toBeUndefined();
      expect(result.priceAt?.EUR).toBeUndefined();

      // prices should still be populated for all
      expect(result.prices.THYAO).toBeDefined();
      expect(result.prices.NVDA).toBeDefined();
      expect(result.prices.XAUGRAM).toBeDefined();
      expect(result.prices.XAGGRAM).toBeDefined();
      expect(result.prices.EUR).toBeDefined();
    });

    it('should not include symbol in priceAt if marketTimeMs is undefined', async () => {
      const mockFetchFn = async (url: string) => {
        let price: number;
        let marketTime: number | undefined;

        if (url.includes('USDTRY=X')) {
          price = 40;
          marketTime = 1784200000;
        } else if (url.includes('THYAO.IS')) {
          price = 288;
          marketTime = undefined; // no timestamp for this symbol
        } else if (url.includes('NVDA')) {
          price = 150;
          marketTime = 1784200002;
        } else {
          price = 100;
          marketTime = 1784200000;
        }

        return {
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: price,
                    previousClose: price - 1,
                    regularMarketTime: marketTime,
                  },
                },
              ],
            },
          }),
        };
      };

      const result = await fetchFxValue(['THYAO'], ['NVDA'], mockFetchFn as unknown as typeof fetch);

      // THYAO should not be in priceAt since marketTimeMs is undefined
      expect(result.priceAt?.THYAO).toBeUndefined();
      // NVDA should be in priceAt
      expect(result.priceAt?.NVDA).toBe(1784200002000);
    });
  });
});
