import type { Money } from '../domain/money';
import { usd, tryM, add, subtract, multiply, toTRY, toUSD, gte } from '../domain/money';
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

export function buyAsset(state: GameState, fx: FxEngine, assetId: string, units: number): GameState {
  if (units <= 0) throw new Error('Units must be positive');
  const price = fx.assetPriceForDay(assetId, state.clock.day); // bilinmeyen -> throw
  const cost = multiply(price, units);
  if (!gte(state.tryBalance, cost)) throw new Error('Insufficient TRY');

  const existing = state.holdings.find((h) => h.assetId === assetId);
  let holdings: AssetHolding[];
  if (existing) {
    const totalUnits = existing.units + units;
    const avg = (existing.avgCost.amount * existing.units + price.amount * units) / totalUnits;
    holdings = state.holdings.map((h) =>
      h.assetId === assetId ? { assetId, units: totalUnits, avgCost: tryM(avg) } : h,
    );
  } else {
    holdings = [...state.holdings, { assetId, units, avgCost: price }];
  }
  return { ...state, tryBalance: subtract(state.tryBalance, cost), holdings };
}

export function sellAsset(state: GameState, fx: FxEngine, assetId: string, units: number): GameState {
  if (units <= 0) throw new Error('Units must be positive');
  const existing = state.holdings.find((h) => h.assetId === assetId);
  if (!existing || existing.units < units) throw new Error('Insufficient units');
  const price = fx.assetPriceForDay(assetId, state.clock.day);
  const proceeds = multiply(price, units);
  const remaining = existing.units - units;
  const holdings =
    remaining > 0
      ? state.holdings.map((h) => (h.assetId === assetId ? { ...h, units: remaining } : h))
      : state.holdings.filter((h) => h.assetId !== assetId);
  return { ...state, tryBalance: add(state.tryBalance, proceeds), holdings };
}
