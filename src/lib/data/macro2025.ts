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

// Başlangıç fiyatları (TRY) ve yıllık yön — TÜMÜ knowledge-cutoff tahmini.
// QUANT KALİBRASYON NOTU (2025-07-05):
//   Denge testi (1000 seed × 365 gün) sonuçlarına göre aşağıdaki değişiklikler yapıldı:
//
//   BIST volatility (0.020-0.030 → 0.045-0.075):
//     Gerekçe: Orijinal değerler gerçek BIST tek-hisse günlük volatilitesini (~±%4-8)
//     yansıtmıyordu. 2025'te ASELS, SASA, GUBRF gibi hisselerde günlük ±%5-7 normal.
//     FxEngine noise modeli akümülatif değil (her gün bağımsız) → düşük volatility ile
//     dengeli strateji her seed'de kazanıyordu. Yükseltilen değerler seed varyansını
//     %30-70 denge hedefine taşıyor.
//
//   BIST annualDrift — bazıları aşağı çekildi:
//     Gerekçe: THYAO, ASELS, YKBNK 2025'te yüksek performanslı seçim bias'ı taşıyordu.
//     SASA ve EREGL 2024 sonrası baskı altında → düşük/negatif drift daha gerçekçi.
//
//   Kripto volatility (0.045-0.050 → 0.065-0.075):
//     Gerekçe: BTC/ETH günlük ±%5-8 normal. Düşük değerler kripto'yu tahmin edilebilir
//     yapıyordu; yüksek volatility agresif strateji riskini gerçekçi kılıyor.
//
//   USD/TRY volatility (0.003 → 0.012, yukarıda):
//     Gerekçe: 2025 kur volatilitesi günlük ±%0.3 değil ±%1.2 civarında gerçekçi.
//
const ASSETS_2025: AssetSeed[] = [
  // BIST (kategori 'bist')
  // volatility gerçek 2025 tek-hisse günlük gürültüsünü yansıtır (±%4.5-7.5)
  { id: 'THYAO', category: 'bist', startPrice: 300,   annualDrift:  0.18, volatility: 0.050 },
  { id: 'EREGL', category: 'bist', startPrice: 28,    annualDrift:  0.05, volatility: 0.055 },
  { id: 'ASELS', category: 'bist', startPrice: 65,    annualDrift:  0.30, volatility: 0.060 },
  { id: 'GUBRF', category: 'bist', startPrice: 180,   annualDrift:  0.10, volatility: 0.065 },
  { id: 'KCHOL', category: 'bist', startPrice: 180,   annualDrift:  0.15, volatility: 0.050 },
  { id: 'TUPRS', category: 'bist', startPrice: 150,   annualDrift:  0.12, volatility: 0.055 },
  { id: 'SASA',  category: 'bist', startPrice: 3.5,   annualDrift: -0.10, volatility: 0.075 },
  { id: 'YKBNK', category: 'bist', startPrice: 30,    annualDrift:  0.22, volatility: 0.055 },
  { id: 'BIMAS', category: 'bist', startPrice: 500,   annualDrift:  0.15, volatility: 0.045 },
  // crypto (TRY fiyatlı) — yüksek volatility gerçek BTC/ETH davranışını yansıtır
  { id: 'BTC',     category: 'crypto',    startPrice: 3_350_000, annualDrift: 0.25, volatility: 0.065 },
  { id: 'ETH',     category: 'crypto',    startPrice: 120_000,   annualDrift: 0.20, volatility: 0.075 },
  // commodity (gram, TRY) — altın 2025'te USD bazında güçlü, TRY'de kur etkisiyle destekleniyor
  { id: 'XAUGRAM', category: 'commodity', startPrice: 3050, annualDrift: 0.28, volatility: 0.018 },
  { id: 'XAGGRAM', category: 'commodity', startPrice: 36,   annualDrift: 0.22, volatility: 0.025 },
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
    // usdTryVolatility: 0.003 → 0.012: gerçek 2025 kur gürültüsü günlük ±%1.2 civarında
    usdTryVolatility: 0.012,
    assets: ASSETS_2025,
    dailyInflation: 0.0001,
    // SENARYO oranı (yalnız VASİYET); canlı mod domain DEPOSIT_ANNUAL_RATE (%50) kullanır. Kalibrasyonda runner'a enjekte edilecek (winnability backlog).
    depositAnnualRate: 0.42,
  },
};
