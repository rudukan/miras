import type { Scenario, AssetSeed } from '../domain/scenario/types';

// 2025 USD/TRY aylık çapa noktaları (≈30 günlük adım). quant doğrulayacak.
const USD_TRY_ANCHORS_2025 = [
  { day: 0, rate: 35.30 },
  { day: 30, rate: 36.00 },
  { day: 60, rate: 36.60 },
  { day: 90, rate: 38.00 },
  { day: 120, rate: 38.40 },
  { day: 150, rate: 38.90 },
  { day: 180, rate: 39.40 },
  { day: 210, rate: 40.00 },
  { day: 240, rate: 40.80 },
  { day: 270, rate: 41.30 },
  { day: 300, rate: 41.80 },
  { day: 330, rate: 42.30 },
  { day: 365, rate: 42.50 },
];

// Başlangıç fiyatları (TRY) ve yıllık yön — TÜMÜ knowledge-cutoff tahmini,
// quant-analyst gerçek 2025 verisiyle kalibre edecek (BIST100'e genişletme dahil).
const ASSETS_2025: AssetSeed[] = [
  // BIST (kategori 'bist') — quant BIST100'e genişletecek
  { id: 'THYAO', category: 'bist', startPrice: 300, annualDrift: 0.25, volatility: 0.020 },
  { id: 'EREGL', category: 'bist', startPrice: 28, annualDrift: 0.10, volatility: 0.020 },
  { id: 'ASELS', category: 'bist', startPrice: 65, annualDrift: 0.40, volatility: 0.025 },
  { id: 'GUBRF', category: 'bist', startPrice: 180, annualDrift: 0.15, volatility: 0.030 },
  { id: 'KCHOL', category: 'bist', startPrice: 180, annualDrift: 0.20, volatility: 0.020 },
  { id: 'TUPRS', category: 'bist', startPrice: 150, annualDrift: 0.18, volatility: 0.020 },
  { id: 'SASA', category: 'bist', startPrice: 3.5, annualDrift: 0.05, volatility: 0.030 },
  { id: 'YKBNK', category: 'bist', startPrice: 30, annualDrift: 0.30, volatility: 0.025 },
  { id: 'BIMAS', category: 'bist', startPrice: 500, annualDrift: 0.22, volatility: 0.015 },
  // crypto (TRY fiyatlı)
  { id: 'BTC', category: 'crypto', startPrice: 3_350_000, annualDrift: 0.30, volatility: 0.045 },
  { id: 'ETH', category: 'crypto', startPrice: 120_000, annualDrift: 0.25, volatility: 0.050 },
  // commodity (gram, TRY)
  { id: 'XAUGRAM', category: 'commodity', startPrice: 3050, annualDrift: 0.30, volatility: 0.015 },
  { id: 'XAGGRAM', category: 'commodity', startPrice: 36, annualDrift: 0.28, volatility: 0.020 },
  // fx (EUR/TRY)
  { id: 'EUR', category: 'fx', startPrice: 37.0, annualDrift: 0.18, volatility: 0.004 },
];

export const VASIYET_2025: Scenario = {
  id: 'vasiyet',
  year: 2025,
  totalDays: 365,
  timeMode: 'turn',
  fxSource: 'seeded',
  difficulty: 'orta',
  data: {
    usdTryAnchors: USD_TRY_ANCHORS_2025,
    usdTryVolatility: 0.003,
    assets: ASSETS_2025,
    dailyInflation: 0.0001,
    depositAnnualRate: 0.42,
  },
};
