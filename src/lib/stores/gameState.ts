import type { Money } from '../domain/money';
import { usd, tryM } from '../domain/money';
import type { GameMode } from '../domain/types';
import type { GameClock } from '../domain/time/clock';
import { createClock } from '../domain/time/clock';
import type { Deposit } from '../domain/deposit/deposit';

export const STARTING_USD = 1_000_000;
export const INFLATION_TARGET_USD = 1_037_172;

export interface AssetHolding {
  assetId: string;
  units: number;     // pozitif, kesirli olabilir
  avgCost: Money;    // TRY, birim başı ortalama alış
}

export interface GameState {
  playerId: string;
  scenarioId: GameMode;
  seed: number;
  clock: GameClock;
  usdBalance: Money;
  tryBalance: Money;
  deposits: Deposit[];
  holdings: AssetHolding[];
  depositSeq: number;
  createdAt: number;
  updatedAt: number;
}

export function createGameState(
  scenarioId: GameMode,
  seed: number,
  playerId: string,
  now: number,
): GameState {
  return {
    playerId,
    scenarioId,
    seed,
    clock: createClock(scenarioId),
    usdBalance: usd(STARTING_USD),
    tryBalance: tryM(0),
    deposits: [],
    holdings: [],
    depositSeq: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// NOT: reducer'lar saf kalsın diye updatedAt'i DEĞİŞTİRMEZ (Date.now() determinizmi
// bozar). updatedAt'i kaydederken store/persistence (Task 6/7) damgalar.
