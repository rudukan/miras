import type { Money } from '../money';
import { usd } from '../money';
import type { AssetCategory } from '../scenario/types';
import { istanbulParts } from '../calendar/calendar';

export type AllocationKey = AssetCategory | 'usd';

export interface DailySnapshot {
  readonly dateKey: string; // 'YYYY-MM-DD' (Europe/Istanbul) — istanbulParts(...).key
  readonly netWorthUsd: Money;
  readonly vsUsdHoldUsd: Money;
  readonly allocation: Partial<Record<AllocationKey, number>>; // yüzde, toplam ≈100
  readonly recordedAt: number;
}

export interface SnapshotChange {
  readonly netWorthDeltaUsd: Money;
  readonly vsUsdHoldDeltaUsd: Money;
}

const MAX_HISTORY = 60;
const DAY_MS = 86_400_000;

/** Portföy dağılımı (yüzde, toplam ≈100). categoryOf: assetId → kategori (çağıran CATALOG'dan sağlar). */
export function computeAllocation(
  usdBalance: number,
  holdings: ReadonlyArray<{ assetId: string; valueUsd: number }>,
  netWorthUsd: number,
  categoryOf: (assetId: string) => AssetCategory,
): Partial<Record<AllocationKey, number>> {
  if (netWorthUsd <= 0) return {};
  const result: Partial<Record<AllocationKey, number>> = {};
  const add = (key: AllocationKey, valueUsd: number) => {
    result[key] = (result[key] ?? 0) + (valueUsd / netWorthUsd) * 100;
  };
  if (usdBalance > 0) add('usd', usdBalance);
  for (const h of holdings) {
    if (h.valueUsd <= 0) continue;
    add(categoryOf(h.assetId), h.valueUsd);
  }
  return result;
}

/** Aynı gün replace = günün son değeri; yeni gün append; cap 60 (en eskiler düşer). */
export function upsertSnapshot(
  history: ReadonlyArray<DailySnapshot>,
  snapshot: DailySnapshot,
): DailySnapshot[] {
  const idx = history.findIndex((s) => s.dateKey === snapshot.dateKey);
  const next = idx >= 0 ? history.with(idx, snapshot) : [...history, snapshot];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

/** Bugünden (todayKey) önceki en yakın snapshot — "son görüşmenden beri" semantiği. Yoksa null. */
export function previousSnapshot(
  history: ReadonlyArray<DailySnapshot>,
  todayKey: string,
): DailySnapshot | null {
  let best: DailySnapshot | null = null;
  for (const s of history) {
    if (s.dateKey < todayKey && (best === null || s.dateKey > best.dateKey)) best = s;
  }
  return best;
}

/** previous yoksa null. */
export function changeSince(current: DailySnapshot, previous: DailySnapshot | null): SnapshotChange | null {
  if (previous === null) return null;
  return {
    netWorthDeltaUsd: usd(current.netWorthUsd.amount - previous.netWorthUsd.amount),
    vsUsdHoldDeltaUsd: usd(current.vsUsdHoldUsd.amount - previous.vsUsdHoldUsd.amount),
  };
}

const STRATEGY_BADGES: Record<AllocationKey, string> = {
  crypto: "Kripto'cu",
  bist: 'Borsacı',
  commodity: 'Altıncı',
  fx: 'Dövizci',
  usd: 'Mevduatçı',
};

/** Eşitlikte sabit öncelik sırası (kripto en "renkli" anlatı → önce). */
const BADGE_PRIORITY: ReadonlyArray<AllocationKey> = ['crypto', 'bist', 'commodity', 'fx', 'usd'];

/** En büyük pay ≥%50 → o kategorinin rozeti; aksi halde "Temkinli". */
export function strategyBadge(allocation: Partial<Record<AllocationKey, number>>): string {
  let best: AllocationKey | null = null;
  let bestPct = -Infinity;
  for (const key of BADGE_PRIORITY) {
    const pct = allocation[key] ?? 0;
    if (pct > bestPct) {
      bestPct = pct;
      best = key;
    }
  }
  if (best === null || bestPct < 50) return 'Temkinli';
  return STRATEGY_BADGES[best];
}

/** İstanbul takvim günü farkı + 1 (gün 1 = oyunun başladığı gün). */
export function daysElapsed(createdAtMs: number, nowMs: number): number {
  const createdKey = istanbulParts(new Date(createdAtMs)).key;
  const nowKey = istanbulParts(new Date(nowMs)).key;
  const createdMidnight = new Date(`${createdKey}T00:00:00Z`).getTime();
  const nowMidnight = new Date(`${nowKey}T00:00:00Z`).getTime();
  return Math.round((nowMidnight - createdMidnight) / DAY_MS) + 1;
}
