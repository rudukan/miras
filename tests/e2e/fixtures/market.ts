/** Deterministik piyasa fixture'ları — E2E assert'leri BU sayılara yazılır.
 *  Şekiller src/lib/api/types.ts'teki Cached<FxValue> / Cached<CryptoValue> ile birebir. */
export const FX_FIXTURE = {
  value: {
    usdTry: 40,
    prices: { THYAO: 300, ASELS: 150, XAUGRAM: 4000, XAGGRAM: 50, EUR: 44 },
    change: { THYAO: 1.2, ASELS: -0.5 },
  },
  asOf: 0, // route kurulurken Date.now() ile damgalanır
  stale: false,
};

export const CRYPTO_FIXTURE = {
  value: {
    prices: { BTC: 100_000, ETH: 4000, SOL: 200, XRP: 2, DOGE: 0.2, AVAX: 30 },
    change: { BTC: 2.5 },
  },
  asOf: 0,
  stale: false,
};
