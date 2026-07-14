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

/** /api/series fixture — 30 nokta, 5 dk aralıklı, hafif yükselen testere.
 *  Taban: 2026-07-14 09:00 UTC (TSİ 12:00) — eksen etiketleri deterministik.
 *  Min fiyat TAM 62000 (i=0) → grafik min etiketi '$62,000.00' (chart-overlay.spec bunu asserts eder). */
export const SERIES_FIXTURE = Array.from({ length: 30 }, (_, i) => ({
  t: Date.UTC(2026, 6, 14, 9, 0) + i * 300_000,
  price: 62_000 + i * 25 + (i % 3) * 40,
}));
