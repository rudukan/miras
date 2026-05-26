import type { GameMode } from '../types';

export interface StockSeed {
  readonly ticker: string;
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
  readonly usdTryVolatility: number; // günlük gürültü genliği (2025: 0.003 = ±%0.3)
  readonly stocks: ReadonlyArray<StockSeed>;
  readonly dailyInflation: number;   // USD %0.01/gün hedefiyle uyumlu
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
