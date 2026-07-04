import type { GameMode } from '../types';

export type AssetCategory = 'bist' | 'crypto' | 'commodity' | 'fx' | 'us';

export interface AssetSeed {
  readonly id: string;           // 'THYAO' | 'BTC' | 'XAUGRAM' | 'EUR'
  readonly category: AssetCategory;
  readonly startPrice: number;   // TRY, gün 0
  readonly annualDrift: number;  // yıllık yön (0.25 = +%25)
  readonly volatility: number;   // günlük gürültü genliği (0.02 = ±%2)
}

export interface UsdTryAnchor {
  readonly day: number;
  readonly rate: number;
}

export interface ScenarioData {
  readonly usdTryAnchors: ReadonlyArray<UsdTryAnchor>;
  readonly usdTryVolatility: number;
  readonly assets: ReadonlyArray<AssetSeed>;
  readonly dailyInflation: number;
  readonly depositAnnualRate: number; // VASIYET 0.42; 2001'de çok yüksek (sonra)
}

export type FxSource = 'seeded' | 'live';
export type Difficulty = 'orta' | 'zor' | 'cokZor';

export interface Scenario {
  readonly id: GameMode;
  readonly year: number;
  readonly totalDays: number;
  readonly timeMode: 'turn' | 'realtime';
  readonly fxSource: FxSource;
  readonly difficulty: Difficulty;
  readonly data: ScenarioData;
}
