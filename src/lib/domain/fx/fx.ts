import type { Money } from '../money';
import { tryM } from '../money';
import type { Scenario, UsdTryAnchor, StockSeed } from '../scenario/types';
import { signedNoise, stringSeed } from './noise';

/** Çapa noktaları arası lineer interpolasyon; aralık dışında uç değere sabitlenir. */
export function interpolateAnchors(
  anchors: ReadonlyArray<UsdTryAnchor>,
  day: number,
): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (day <= first.day) return first.rate;
  if (day >= last.day) return last.rate;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (day >= a.day && day <= b.day) {
      const t = (day - a.day) / (b.day - a.day);
      return a.rate + (b.rate - a.rate) * t;
    }
  }
  return last.rate;
}

export interface FxEngine {
  usdTryForDay(day: number): Money;
  stockPriceForDay(ticker: string, day: number): Money;
}

export function createFxEngine(scenario: Scenario, seed: number): FxEngine {
  const { usdTryAnchors, usdTryVolatility, stocks } = scenario.data;
  const stockMap = new Map<string, StockSeed>(stocks.map((s) => [s.ticker, s]));

  function usdTryForDay(day: number): Money {
    const base = interpolateAnchors(usdTryAnchors, day);
    const rate = base * (1 + usdTryVolatility * signedNoise(seed, day));
    return tryM(rate);
  }

  function stockPriceForDay(ticker: string, day: number): Money {
    const stock = stockMap.get(ticker);
    if (!stock) throw new Error(`Unknown ticker: ${ticker}`);
    const trend = stock.startPrice * (1 + stock.annualDrift * (day / scenario.totalDays));
    const price = trend * (1 + stock.volatility * signedNoise(seed, day, stringSeed(ticker)));
    return tryM(price);
  }

  return { usdTryForDay, stockPriceForDay };
}
