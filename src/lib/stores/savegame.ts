import type { GameState } from './gameState';
import { usd, tryM } from '../domain/money';
import type { DailySnapshot } from '../domain/snapshot/dailySnapshot';

const SAVE_KEY = 'miras.save.v1';
const HISTORY_KEY = 'miras.history.v1';
const PLAYER_ID_KEY = 'miras.playerId';

/** Günlük mühürlü operatif kur — İstanbul gün-anahtarı + o gün için yakalanan USD/TRY. */
export interface SealedFx {
  dateKey: string; // 'YYYY-MM-DD' (Europe/Istanbul)
  rate: number;    // o günün operatif USD/TRY kuru
}

export interface SaveEnvelopeV1 {
  v: 1;
  game: GameState;
  activeBist: string[];
  /** Opsiyonel — eski kayıtlarda yok (undefined → store ilk poll'da mühürler). */
  sealedFx?: SealedFx;
  /** Opsiyonel — eski kayıtlarda yok (undefined → store boş dizi varsayar, sabit varsayılan YOK). */
  activeUs?: string[];
}

export function saveGame(storage: Storage, envelope: SaveEnvelopeV1): void {
  storage.setItem(SAVE_KEY, JSON.stringify(envelope));
}

/** Kayıt + günlük döküm geçmişi birlikte silinir (oyun reset'i ve hesap silme aynı semantik:
 * geçmiş kalırsa yeni oyunun ilk snapshot'ı eski değerlerle kıyaslanıp sahte delta üretir).
 * PLAYER_ID bilinçli olarak kalır — bkz. getOrCreatePlayerId. */
export function clearSave(storage: Storage): void {
  storage.removeItem(SAVE_KEY);
  storage.removeItem(HISTORY_KEY);
}

const PENDING_WIPE_KEY = 'miras.pendingWipe';

/** Reset/hesap silme reload'ından ÖNCE çağrılır. clearSave tek başına yeterli değil:
 * reload gerçekleşene kadar çalışan store bir persist tetiklerse bellekteki eski kayıt/geçmiş
 * localStorage'a geri yazılır. Bayrak, temizliği bir sonraki boot'a da taşır. */
export function markPendingWipe(session: Storage): void {
  session.setItem(PENDING_WIPE_KEY, '1');
}

/** Boot'ta loadGame/loadHistory'den ÖNCE çağrılır: bayrak varsa temizliği tekrarlar (tek kullanımlık). */
export function consumePendingWipe(session: Storage, local: Storage): boolean {
  if (session.getItem(PENDING_WIPE_KEY) === null) return false;
  session.removeItem(PENDING_WIPE_KEY);
  clearSave(local);
  return true;
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
      deposit: raw.game.deposit
        ? {
            ...raw.game.deposit,
            principalTry: tryM(raw.game.deposit.principalTry.amount),
            usdAtOpen: usd(raw.game.deposit.usdAtOpen.amount),
          }
        : null,
      // Eski kayıtlarda alan yok → boş liste (sealedFx kalıbı, v bump gerekmez).
      properties: (raw.game.properties ?? []).map((p) => ({
        ...p,
        priceTryAtBuy: tryM(p.priceTryAtBuy.amount),
        usdPaid: usd(p.usdPaid.amount),
      })),
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
