import type { Money } from '../domain/money';
import { usd, add, subtract, multiply, gte } from '../domain/money';
import type { GameMode } from '../domain/types';
import type { GameClock } from '../domain/time/clock';
import { createClock, advanceDay, isFinished } from '../domain/time/clock';
import type { UsdPriceOracle } from '../domain/fx/usdOracle';

export const STARTING_USD = 1_000_000;

export interface AssetHolding {
  assetId: string;
  units: number;     // pozitif, kesirli olabilir
  avgCost: Money;    // USD, birim başı ortalama alış
}

export interface GameState {
  playerId: string;
  scenarioId: GameMode;
  seed: number;
  clock: GameClock;
  usdBalance: Money;
  holdings: AssetHolding[];
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
    holdings: [],
    createdAt: now,
    updatedAt: now,
  };
}

// NOT: reducer'lar saf kalsın diye updatedAt'i DEĞİŞTİRMEZ; store/persistence damgalar.

export function buyAsset(
  state: GameState,
  oracle: UsdPriceOracle,
  assetId: string,
  units: number,
): GameState {
  if (units <= 0) throw new Error('Units must be positive');
  const price = oracle.assetUsd(assetId); // fiyatsız/bilinmeyen -> throw
  const cost = multiply(price, units);
  if (!gte(state.usdBalance, cost)) throw new Error('Insufficient USD');

  const existing = state.holdings.find((h) => h.assetId === assetId);
  let holdings: AssetHolding[];
  if (existing) {
    const totalUnits = existing.units + units;
    const avg = (existing.avgCost.amount * existing.units + price.amount * units) / totalUnits;
    holdings = state.holdings.map((h) =>
      h.assetId === assetId ? { assetId, units: totalUnits, avgCost: usd(avg) } : h,
    );
  } else {
    holdings = [...state.holdings, { assetId, units, avgCost: price }];
  }
  return { ...state, usdBalance: subtract(state.usdBalance, cost), holdings };
}

export function sellAsset(
  state: GameState,
  oracle: UsdPriceOracle,
  assetId: string,
  units: number,
): GameState {
  if (units <= 0) throw new Error('Units must be positive');
  const existing = state.holdings.find((h) => h.assetId === assetId);
  if (!existing || existing.units < units) throw new Error('Insufficient units');
  const price = oracle.assetUsd(assetId);
  const proceeds = multiply(price, units);
  const remaining = existing.units - units;
  const holdings =
    remaining > 0
      ? state.holdings.map((h) => (h.assetId === assetId ? { ...h, units: remaining } : h))
      : state.holdings.filter((h) => h.assetId !== assetId);
  return { ...state, usdBalance: add(state.usdBalance, proceeds), holdings };
}

export function advanceTime(state: GameState, step: number): GameState {
  let s = state;
  for (let i = 0; i < step; i++) {
    if (isFinished(s.clock)) break;
    s = { ...s, clock: advanceDay(s.clock) };
  }
  return s;
}

export function nextEventDay(state: GameState): number | null {
  const today = state.clock.day;
  return state.clock.totalDays > today ? state.clock.totalDays : null;
}

export function netWorthUsd(state: GameState, oracle: UsdPriceOracle): Money {
  let total = state.usdBalance.amount;
  for (const h of state.holdings) {
    total += multiply(oracle.assetUsd(h.assetId), h.units).amount;
  }
  return usd(total);
}

export function profitRate(state: GameState, oracle: UsdPriceOracle): number {
  return netWorthUsd(state, oracle).amount / STARTING_USD;
}

/** Kazanma çizgisi: doları büyüt — net servet $1M'ı geçti mi? */
export function grewDollars(state: GameState, oracle: UsdPriceOracle): boolean {
  return netWorthUsd(state, oracle).amount > STARTING_USD;
}
