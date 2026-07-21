import type { GameState } from './gameState';
import { usd, tryM } from '../domain/money';
import type { DailySnapshot } from '../domain/snapshot/dailySnapshot';
import type { PendingOrder } from '../domain/orders/orders';

const SAVE_KEY = 'miras.save.v1';
const HISTORY_KEY = 'miras.history.v1';
const PLAYER_ID_KEY = 'miras.playerId';

/** cloudSave'den taşındı — tüm localStorage anahtarları bu dosyada yaşar. */
export const LOCAL_TOUCHED_KEY = 'miras.save.touchedAt';
const OWNER_ID_KEY = 'miras.save.ownerId';
const RESET_AT_KEY = 'miras.resetAt';
// +page.svelte ve telemetry.ts'de tanımlı anahtarların literal'leri —
// clearLocalIdentity tek listeyi tutsun diye burada tekrarlanır:
const CARD_SEEN_KEY = 'miras.cardSeen';
const LAST_VISIT_KEY = 'miras.lastVisitPing';

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
  /** Opsiyonel — eski kayıtlarda yok (undefined → store boş dizi varsayar). Task 3: kapalı
   *  piyasada/bayat veride verilen, açılışı izleyen ilk taze fiyatta gerçekleşecek emirler. */
  pendingOrders?: PendingOrder[];
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
    // amountUsd-kind emirlerin Money alanı JSON.parse sonrası düz obje — usd() ile yeniden sarılır.
    // units-kind emirlerde Money yok, aynen döner. Alan hiç yoksa (eski kayıt) undefined kalır.
    pendingOrders: raw.pendingOrders?.map((o) =>
      o.kind === 'amountUsd' ? { ...o, amountUsd: usd(o.amountUsd.amount) } : o,
    ),
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

/** Local kaydın hangi Supabase kullanıcısına ait olduğu (yabancı-oyun koruması, spec §4.D). */
export function getOwnerId(storage: Storage): string | null {
  return storage.getItem(OWNER_ID_KEY);
}
export function setOwnerId(storage: Storage, userId: string): void {
  storage.setItem(OWNER_ID_KEY, userId);
}
export function clearOwnerId(storage: Storage): void {
  storage.removeItem(OWNER_ID_KEY);
}

/** Bilinçli reset/silme anı — bu andan ÖNCE kurulmuş oyunlar ölüdür (tombstone). */
export function getResetAt(storage: Storage): number | null {
  const raw = storage.getItem(RESET_AT_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
export function markReset(storage: Storage, now: number): void {
  storage.setItem(RESET_AT_KEY, String(now));
}

/** Bayat sekme guard'ı: ölü jenerasyon localStorage'a geri yazılamaz (pendingWipe tek
 *  atımlıktı; canlı ikinci sekme her saniye persist ederek kaydı hortlatabiliyordu). */
export function persistAllowed(storage: Storage, gameCreatedAt: number): boolean {
  const resetAt = getResetAt(storage);
  return resetAt === null || gameCreatedAt > resetAt;
}

/** KVKK hesap silme: kimlik anahtarları gider; resetAt KALIR (kişisel veri değil,
 *  zombi-sekme koruması — spec §4.G). */
export function clearLocalIdentity(storage: Storage): void {
  storage.removeItem(PLAYER_ID_KEY);
  storage.removeItem(LOCAL_TOUCHED_KEY);
  storage.removeItem(CARD_SEEN_KEY);
  storage.removeItem(LAST_VISIT_KEY);
  storage.removeItem(OWNER_ID_KEY);
}

/** Oyun sıfırlansa bile silinmez — telemetri/oyuncu kimliği. */
export function getOrCreatePlayerId(storage: Storage): string {
  const existing = storage.getItem(PLAYER_ID_KEY);
  if (existing !== null) return existing;
  const id = crypto.randomUUID();
  storage.setItem(PLAYER_ID_KEY, id);
  return id;
}
