import type { Scenario } from '../domain/scenario/types';

// 2025 USD/TRY aylık çapa noktaları (≈30 günlük adım).
// Başlangıç tahminleri — quant-analyst doğrulayıp ince ayar yapacak.
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

// Başlangıç fiyatları (TRY) ve yıllık yön — quant doğrulayacak.
const BIST_STOCKS_2025 = [
  { ticker: 'THYAO', startPrice: 300, annualDrift: 0.25, volatility: 0.020 },
  { ticker: 'EREGL', startPrice: 28, annualDrift: 0.10, volatility: 0.020 },
  { ticker: 'ASELS', startPrice: 65, annualDrift: 0.40, volatility: 0.025 },
  { ticker: 'GUBRF', startPrice: 180, annualDrift: 0.15, volatility: 0.030 },
  { ticker: 'KCHOL', startPrice: 180, annualDrift: 0.20, volatility: 0.020 },
  { ticker: 'TUPRS', startPrice: 150, annualDrift: 0.18, volatility: 0.020 },
  { ticker: 'SASA', startPrice: 3.5, annualDrift: 0.05, volatility: 0.030 },
  { ticker: 'YKBNK', startPrice: 30, annualDrift: 0.30, volatility: 0.025 },
  { ticker: 'BIMAS', startPrice: 500, annualDrift: 0.22, volatility: 0.015 },
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
    stocks: BIST_STOCKS_2025,
    dailyInflation: 0.0001,
  },
};
