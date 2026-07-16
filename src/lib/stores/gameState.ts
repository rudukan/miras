import type { Money } from '../domain/money';
import { usd, tryM, add, subtract, multiply, gte } from '../domain/money';
import type { GameMode } from '../domain/types';
import type { GameClock } from '../domain/time/clock';
import { createClock, advanceDay, isFinished } from '../domain/time/clock';
import type { UsdPriceOracle } from '../domain/fx/usdOracle';
import type { ActiveDeposit } from '../domain/deposit/deposit';
import { DEPOSIT_ANNUAL_RATE, isMatured, maturityNetValueTry } from '../domain/deposit/deposit';
import type { OwnedProperty } from '../domain/property/property';
import { propertyDef, collectRent, accruedRentTry } from '../domain/property/property';

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
  deposit: ActiveDeposit | null;
  properties: OwnedProperty[];
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
    deposit: null,
    properties: [],
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

export interface NetWorthParts {
  /** Nakit + fiyatlanabilen her holding'in toplamı (USD, ham sayı — ara toplam). */
  totalUsd: number;
  /** true ise TÜM holding'ler fiyatlanabildi (totalUsd == netWorthUsd ile birebir). */
  complete: boolean;
}

/**
 * netWorthUsd'nin "çökmeyen" hâli: bir holding'in fiyatı yoksa (oracle throw) o holding
 * ATLANIR, döngü durmaz — nakit + fiyatlanan diğer pozisyonlar toplanmaya devam eder.
 * `complete=false` eksik veri olduğunu işaretler; çağıran taraf (store) buna göre
 * kâr/vs-USD göstergelerini gizleyebilir. Her holding kendi try/catch'inde değerlendirilir
 * — döngünün etrafına tek bir try/catch koymak ilk eksik fiyatta tüm toplamı durdurur ki
 * bu da bu fonksiyonun düzeltmek için var olduğu bug'ın kendisidir.
 */
export function netWorthPartsUsd(state: GameState, oracle: UsdPriceOracle): NetWorthParts {
  let total = state.usdBalance.amount;
  let complete = true;
  for (const h of state.holdings) {
    try {
      total += multiply(oracle.assetUsd(h.assetId), h.units).amount;
    } catch {
      complete = false;
    }
  }
  return { totalUsd: total, complete };
}

export function profitRate(state: GameState, oracle: UsdPriceOracle): number {
  return netWorthUsd(state, oracle).amount / STARTING_USD;
}

/** Kazanma çizgisi: doları büyüt — net servet $1M'ı geçti mi? */
export function grewDollars(state: GameState, oracle: UsdPriceOracle): boolean {
  return netWorthUsd(state, oracle).amount > STARTING_USD;
}

/** USD nakitten TL vadeli mevduat aç (canlı kurla oto-takas, atomik). */
export function openDeposit(
  state: GameState,
  usdTry: number,
  usdAmount: number,
  nowMs: number,
): GameState {
  if (state.deposit !== null) throw new Error('Deposit already active');
  if (usdAmount <= 0) throw new Error('Amount must be positive');
  if (usdTry <= 0) throw new Error('Invalid FX rate');
  if (usdAmount > state.usdBalance.amount) throw new Error('Insufficient USD');
  const deposit: ActiveDeposit = {
    principalTry: tryM(usdAmount * usdTry),
    usdAtOpen: usd(usdAmount),
    usdTryAtOpen: usdTry,
    openedAtMs: nowMs,
    annualRate: DEPOSIT_ANNUAL_RATE,
  };
  return { ...state, usdBalance: subtract(state.usdBalance, usd(usdAmount)), deposit };
}

/** Mevduatı boz: vade dolduysa anapara+net faiz, erken ise yalnız anapara (faiz 0); TL→USD. */
export function breakDeposit(state: GameState, usdTry: number, nowMs: number): GameState {
  if (state.deposit === null) throw new Error('No active deposit');
  if (usdTry <= 0) throw new Error('Invalid FX rate');
  const payoutTry = isMatured(state.deposit, nowMs)
    ? maturityNetValueTry(state.deposit)
    : state.deposit.principalTry;
  const payoutUsd = usd(payoutTry.amount / usdTry);
  return { ...state, usdBalance: add(state.usdBalance, payoutUsd), deposit: null };
}

/** Emlak satın al: bedel USD nakitten kurla düşer, tapu anında geçer (süper sade dilim). */
export function buyProperty(
  state: GameState,
  usdTry: number,
  propertyId: string,
  nowMs: number,
): GameState {
  if (usdTry <= 0) throw new Error('Invalid FX rate');
  if (state.properties.some((p) => p.propertyId === propertyId))
    throw new Error('Property already owned');
  const def = propertyDef(propertyId); // bilinmeyen id -> throw
  const usdCost = usd(def.priceTry.amount / usdTry);
  if (!gte(state.usdBalance, usdCost)) throw new Error('Insufficient USD');
  const owned: OwnedProperty = {
    propertyId,
    priceTryAtBuy: def.priceTry,
    usdPaid: usdCost,
    boughtAtMs: nowMs,
    lastCollectedAtMs: nowMs,
  };
  return {
    ...state,
    usdBalance: subtract(state.usdBalance, usdCost),
    properties: [...state.properties, owned],
  };
}

/** Kira kasasını tahsil et: birikmiş TL kira kurla USD nakite geçer, kasa sıfırlanır. */
export function collectPropertyRent(
  state: GameState,
  usdTry: number,
  propertyId: string,
  nowMs: number,
): GameState {
  if (usdTry <= 0) throw new Error('Invalid FX rate');
  const owned = state.properties.find((p) => p.propertyId === propertyId);
  if (!owned) throw new Error('Property not owned');
  const { property, rentTry } = collectRent(owned, nowMs);
  const rentUsd = usd(rentTry.amount / usdTry);
  return {
    ...state,
    usdBalance: add(state.usdBalance, rentUsd),
    properties: state.properties.map((p) => (p.propertyId === propertyId ? property : p)),
  };
}

/** Emlak sat: alım bedeli (TL sabit) + kasadaki kira birlikte USD'ye döner. */
export function sellProperty(
  state: GameState,
  usdTry: number,
  propertyId: string,
  nowMs: number,
): GameState {
  if (usdTry <= 0) throw new Error('Invalid FX rate');
  const owned = state.properties.find((p) => p.propertyId === propertyId);
  if (!owned) throw new Error('Property not owned');
  const payoutTry = add(owned.priceTryAtBuy, accruedRentTry(owned, nowMs));
  const payoutUsd = usd(payoutTry.amount / usdTry);
  return {
    ...state,
    usdBalance: add(state.usdBalance, payoutUsd),
    properties: state.properties.filter((p) => p.propertyId !== propertyId),
  };
}
