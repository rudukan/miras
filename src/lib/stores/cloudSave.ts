/**
 * Bulut kayit senkronu (spec §5): localStorage birincil kalir; bulut push
 * debounce'ludur ve hatasi oyunu ASLA durdurmaz. Kaynak secimi yeni-olan-kazanir,
 * esitlikte local (gereksiz reload'u onlemek icin).
 */
import type { SaveEnvelopeV1 } from './savegame';

export function chooseSource(
  localTouchedAt: number | null,
  cloudUpdatedAt: string | null,
): 'local' | 'cloud' | 'none' {
  if (localTouchedAt == null && cloudUpdatedAt == null) return 'none';
  if (cloudUpdatedAt == null) return 'local';
  if (localTouchedAt == null) return 'cloud';
  return Date.parse(cloudUpdatedAt) > localTouchedAt ? 'cloud' : 'local';
}

export function createCloudPush(
  push: (env: SaveEnvelopeV1) => Promise<void>,
  opts: { debounceMs?: number } = {},
) {
  const debounceMs = opts.debounceMs ?? 30_000;
  let pending: SaveEnvelopeV1 | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function fire(): Promise<void> {
    if (pending == null) return;
    const env = pending;
    pending = null;
    try {
      await push(env);
    } catch {
      // Sessiz: offline/likidite sorunu oyunu bozmasin; sonraki schedule yeniden dener.
    }
  }

  return {
    schedule(env: SaveEnvelopeV1): void {
      pending = env;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => void fire(), debounceMs);
    },
    async flush(): Promise<void> {
      if (timer != null) clearTimeout(timer);
      await fire();
    },
  };
}
