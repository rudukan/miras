import type { GameState } from './gameState';
import type { PeriodDays } from './liveGameStore.svelte';
import { usd } from '../domain/money';
import type { DailySnapshot } from '../domain/snapshot/dailySnapshot';

const SAVE_KEY = 'miras.save.v1';
const HISTORY_KEY = 'miras.history.v1';
const PLAYER_ID_KEY = 'miras.playerId';

export interface SaveEnvelopeV1 {
  v: 1;
  game: GameState;
  periodDays: PeriodDays;
  activeBist: string[];
}

export function saveGame(storage: Storage, envelope: SaveEnvelopeV1): void {
  storage.setItem(SAVE_KEY, JSON.stringify(envelope));
}

export function clearSave(storage: Storage): void {
  storage.removeItem(SAVE_KEY);
}

/** Bozuk JSON / yanlış versiyon → null (sıfırdan başla, migration yok). */
export function loadGame(storage: Storage): SaveEnvelopeV1 | null {
  const raw = storage.getItem(SAVE_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveEnvelopeV1>;
    if (parsed.v !== 1 || !parsed.game || !Array.isArray(parsed.activeBist)) return null;
    return reviveEnvelope(parsed as SaveEnvelopeV1);
  } catch {
    return null;
  }
}

/** Money alanları JSON.parse sonrası düz obje — usd() ile yeniden sarılır (round/tip garantisi). */
function reviveEnvelope(raw: SaveEnvelopeV1): SaveEnvelopeV1 {
  return {
    ...raw,
    game: {
      ...raw.game,
      usdBalance: usd(raw.game.usdBalance.amount),
      holdings: raw.game.holdings.map((h) => ({ ...h, avgCost: usd(h.avgCost.amount) })),
    },
  };
}

export interface SaveHistoryV1 {
  v: 1;
  history: DailySnapshot[];
}

export function saveHistory(storage: Storage, envelope: SaveHistoryV1): void {
  storage.setItem(HISTORY_KEY, JSON.stringify(envelope));
}

/** Bozuk JSON / yanlış versiyon → null. */
export function loadHistory(storage: Storage): SaveHistoryV1 | null {
  const raw = storage.getItem(HISTORY_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveHistoryV1>;
    if (parsed.v !== 1 || !Array.isArray(parsed.history)) return null;
    return {
      v: 1,
      history: parsed.history.map((s) => ({
        ...s,
        netWorthUsd: usd(s.netWorthUsd.amount),
        vsUsdHoldUsd: usd(s.vsUsdHoldUsd.amount),
      })),
    };
  } catch {
    return null;
  }
}

/** Oyun sıfırlansa bile silinmez — telemetri/oyuncu kimliği. */
export function getOrCreatePlayerId(storage: Storage): string {
  const existing = storage.getItem(PLAYER_ID_KEY);
  if (existing !== null) return existing;
  const id = crypto.randomUUID();
  storage.setItem(PLAYER_ID_KEY, id);
  return id;
}
