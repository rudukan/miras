/**
 * Bulut kayit senkronu (spec §5 + SP1.5 §4.D-E): localStorage birincil kalir; bulut push
 * debounce'ludur, boot uzlasmasi bitmeden kapalidir ve hatasi oyunu ASLA durdurmaz.
 * Kaynak secimi: sahiplik → tombstone → jenerasyon → tazelik.
 */
import type { SaveEnvelopeV1 } from './savegame';

export type SourceDecision = 'local' | 'cloud' | 'none' | 'local-adopt';

export interface ChooseSourceInput {
  localTouchedAt: number | null;
  localCreatedAt: number | null;
  cloudUpdatedAt: string | null;
  cloudCreatedAt: number | null;
  resetAt: number | null;
  localOwnerId: string | null;
  sessionUserId: string | null;
}

export function chooseSource(i: ChooseSourceInput): SourceDecision {
  // Tombstone: bilincli reset edilen jenerasyon hicbir cihazdan geri gelemez (spec §4.E).
  const cloudAlive =
    i.cloudCreatedAt != null && !(i.resetAt != null && i.cloudCreatedAt <= i.resetAt);
  const hasLocal = i.localCreatedAt != null;
  // Yabanci local: kayit baska kullaniciya damgali (paylasilan cihaz, spec §4.D k1 / K5).
  const foreign =
    hasLocal && i.localOwnerId != null && i.sessionUserId != null &&
    i.localOwnerId !== i.sessionUserId;
  if (foreign) return cloudAlive ? 'cloud' : 'local-adopt';
  if (!hasLocal && !cloudAlive) return 'none';
  if (!hasLocal) return 'cloud';
  if (!cloudAlive) return 'local';
  // Jenerasyon: yeni kurulan OYUN eski oyunun taze kaydini yener (reset yayilimi).
  if (i.localCreatedAt !== i.cloudCreatedAt)
    return i.cloudCreatedAt! > i.localCreatedAt! ? 'cloud' : 'local';
  // Ayni oyun, iki kopya: yeni-olan-kazanir, esitlikte local (gereksiz reload yok).
  if (i.cloudUpdatedAt == null) return 'local';
  if (i.localTouchedAt == null) return 'cloud';
  return Date.parse(i.cloudUpdatedAt) > i.localTouchedAt ? 'cloud' : 'local';
}

export function createCloudPush(
  push: (env: SaveEnvelopeV1) => Promise<void>,
  opts: { debounceMs?: number } = {},
) {
  const debounceMs = opts.debounceMs ?? 30_000;
  let enabled = false; // boot uzlasmasi (chooseSource karari) bitmeden push yok — yaris kapisi
  let pending: SaveEnvelopeV1 | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function fire(): Promise<boolean> {
    if (pending == null) return true;
    const env = pending;
    pending = null;
    try {
      await push(env);
      return true;
    } catch {
      // Sessiz: offline oyunu bozmasin; sonraki schedule yeniden dener.
      return false;
    }
  }

  return {
    schedule(env: SaveEnvelopeV1): void {
      if (!enabled) return;
      pending = env;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => void fire(), debounceMs);
    },
    enable(): void {
      enabled = true;
    },
    cancel(): void {
      pending = null;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    async flush(): Promise<boolean> {
      if (timer != null) clearTimeout(timer);
      return fire();
    },
  };
}
