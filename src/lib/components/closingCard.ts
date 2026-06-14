import type { Money } from '../domain/money';
import { usd } from '../domain/money';
import type { GameState } from '../stores/gameState';
import {
  type DailySnapshot,
  type AllocationKey,
  previousSnapshot,
  strategyBadge,
  daysElapsed,
} from '../domain/snapshot/dailySnapshot';
import { istanbulParts } from '../domain/calendar/calendar';
import { signedUsd, pnlClass, CATEGORY_LABELS } from './format';

/** Hukuk şartı — kartta HER ZAMAN tam görünür (legal-consultant onayı). */
export const DISCLAIMER = 'SANAL OYUN — GERÇEK PARA DEĞİL';

/** Yatay yığılmış dağılım barı sırası — kripto en "renkli" anlatı → önce, nakit en sona. */
const SEGMENT_ORDER: ReadonlyArray<AllocationKey> = ['crypto', 'bist', 'commodity', 'fx', 'deposit', 'usd'];

/** Segment rengi — yalnız term.* token'ları (CLAUDE.md: hard-coded #hex yasak). */
const SEGMENT_COLOR_CLASS: Readonly<Record<AllocationKey, string>> = {
  crypto: 'bg-term-amber',
  bist: 'bg-term-blue',
  commodity: 'bg-term-green',
  fx: 'bg-term-red',
  deposit: 'bg-term-violet',
  usd: 'bg-term-text',
};

export interface ClosingCardSegment {
  key: AllocationKey;
  label: string;
  pct: number;
  colorClass: string;
}

export interface ClosingCardModel {
  dayLabel: string;
  headlineLabel: 'DÜNDEN BERİ' | 'TOPLAM GETİRİ';
  headlineValue: string;
  headlineClass: string;
  vsUsdHoldValue: string;
  vsUsdHoldClass: string;
  segments: ClosingCardSegment[];
  badge: string;
  disclaimer: string;
}

/**
 * Sert basitlik hiyerarşisi: tek vurgu (headline) → "DOLAR TUTSAYDIN" → dağılım barı + rozet → disclaimer.
 * `history`'de bugünün snapshot'u varsa dağılım/rozet ondan; yoksa boş (henüz poll yok, çökmez).
 */
export function buildClosingCardModel(
  game: GameState,
  netWorthUsd: Money,
  vsUsdHoldUsd: Money,
  history: ReadonlyArray<DailySnapshot>,
  nowMs: number,
): ClosingCardModel {
  const todayKey = istanbulParts(new Date(nowMs)).key;
  const prev = previousSnapshot(history, todayKey);
  const today = history.find((s) => s.dateKey === todayKey);
  const allocation = today?.allocation ?? {};

  const sinceLast = prev === null ? null : usd(netWorthUsd.amount - prev.netWorthUsd.amount);
  const headline = sinceLast ?? vsUsdHoldUsd; // ilk gün: toplam getiri = vsUsdHold

  const segments = SEGMENT_ORDER.filter((key) => (allocation[key] ?? 0) > 0).map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    pct: allocation[key]!,
    colorClass: SEGMENT_COLOR_CLASS[key],
  }));

  return {
    dayLabel: `GÜN ${daysElapsed(game.createdAt, nowMs)}`,
    headlineLabel: sinceLast === null ? 'TOPLAM GETİRİ' : 'DÜNDEN BERİ',
    headlineValue: signedUsd(headline),
    headlineClass: pnlClass(headline.amount),
    vsUsdHoldValue: signedUsd(vsUsdHoldUsd),
    vsUsdHoldClass: pnlClass(vsUsdHoldUsd.amount),
    segments,
    badge: strategyBadge(allocation),
    disclaimer: DISCLAIMER,
  };
}
