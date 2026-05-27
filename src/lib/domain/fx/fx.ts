import type { Money } from '../money';
import { tryM } from '../money';
import type { Scenario, UsdTryAnchor, AssetSeed } from '../scenario/types';
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
  assetPriceForDay(assetId: string, day: number): Money;
}

export function createFxEngine(scenario: Scenario, seed: number): FxEngine {
  const { usdTryAnchors, usdTryVolatility, assets } = scenario.data;
  const assetMap = new Map<string, AssetSeed>(assets.map((a) => [a.id, a]));

  function usdTryForDay(day: number): Money {
    const base = interpolateAnchors(usdTryAnchors, day);
    const rate = base * (1 + usdTryVolatility * signedNoise(seed, day));
    return tryM(rate);
  }

  function assetPriceForDay(assetId: string, day: number): Money {
    const asset = assetMap.get(assetId);
    if (!asset) throw new Error(`Unknown asset: ${assetId}`);
    const trend = asset.startPrice * (1 + asset.annualDrift * (day / scenario.totalDays));
    const price = trend * (1 + asset.volatility * signedNoise(seed, day, stringSeed(assetId)));
    return tryM(price);
  }

  return { usdTryForDay, assetPriceForDay };
}
