import type { Money } from '../domain/money';
import { usd, tryM, add, subtract, toTRY, toUSD, gte } from '../domain/money';
import type { GameMode } from '../domain/types';
import type { GameClock } from '../domain/time/clock';
import { createClock } from '../domain/time/clock';
import type { Deposit } from '../domain/deposit/deposit';
import type { FxEngine } from '../domain/fx/fx';

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

export function convertUsdToTry(state: GameState, fx: FxEngine, usdAmount: Money): GameState {
  if (usdAmount.currency !== 'USD') throw new Error('Amount must be USD');
  if (usdAmount.amount <= 0) throw new Error('Amount must be positive');
  if (!gte(state.usdBalance, usdAmount)) throw new Error('Insufficient USD');
  const rate = fx.usdTryForDay(state.clock.day).amount;
  return {
    ...state,
    usdBalance: subtract(state.usdBalance, usdAmount),
    tryBalance: add(state.tryBalance, toTRY(usdAmount, rate)),
  };
}

export function convertTryToUsd(state: GameState, fx: FxEngine, tryAmount: Money): GameState {
  if (tryAmount.currency !== 'TRY') throw new Error('Amount must be TRY');
  if (tryAmount.amount <= 0) throw new Error('Amount must be positive');
  if (!gte(state.tryBalance, tryAmount)) throw new Error('Insufficient TRY');
  const rate = fx.usdTryForDay(state.clock.day).amount;
  return {
    ...state,
    tryBalance: subtract(state.tryBalance, tryAmount),
    usdBalance: add(state.usdBalance, toUSD(tryAmount, rate)),
  };
}
