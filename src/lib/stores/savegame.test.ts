import { describe, it, expect } from 'vitest';
import {
  saveGame,
  loadGame,
  clearSave,
  getOrCreatePlayerId,
  saveHistory,
  loadHistory,
  type SaveEnvelopeV1,
} from './savegame';
import { createGameState } from './gameState';
import { usd, tryM } from '../domain/money';
import type { DailySnapshot } from '../domain/snapshot/dailySnapshot';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe('savegame', () => {
  it('round-trip: save → load aynı envelope döner', () => {
    const storage = makeStorage();
    const game = createGameState('canli', 1, 'p1', 1000);
    const envelope: SaveEnvelopeV1 = { v: 1, game, activeBist: ['THYAO', 'ASELS'] };

    saveGame(storage, envelope);

    expect(loadGame(storage)).toEqual(envelope);
  });

  it('hiç kayıt yoksa → null', () => {
    expect(loadGame(makeStorage())).toBeNull();
  });

  it('bozuk JSON → null', () => {
    const storage = makeStorage();
    storage.setItem('miras.save.v1', '{bozuk');

    expect(loadGame(storage)).toBeNull();
  });

  it('yanlış versiyon → null', () => {
    const storage = makeStorage();
    storage.setItem('miras.save.v1', JSON.stringify({ v: 2, game: {}, periodDays: 365, activeBist: [] }));

    expect(loadGame(storage)).toBeNull();
  });

  it("holdings'li restore: avgCost ve usdBalance Money olarak geri sarılır", () => {
    const storage = makeStorage();
    let game = createGameState('canli', 1, 'p1', 1000);
    game = { ...game, holdings: [{ assetId: 'BTC', units: 1, avgCost: usd(64000) }] };
    const envelope: SaveEnvelopeV1 = { v: 1, game, activeBist: [] };

    saveGame(storage, envelope);
    const loaded = loadGame(storage)!;

    expect(loaded.game.usdBalance).toEqual({ amount: 1_000_000, currency: 'USD' });
    expect(loaded.game.holdings[0].avgCost).toEqual({ amount: 64000, currency: 'USD' });
  });

  it('clearSave: kayıt silinir', () => {
    const storage = makeStorage();
    const game = createGameState('canli', 1, 'p1', 1000);
    saveGame(storage, { v: 1, game, activeBist: [] });

    clearSave(storage);

    expect(loadGame(storage)).toBeNull();
  });

  describe('history (miras.history.v1)', () => {
    const sampleHistory: DailySnapshot[] = [
      {
        dateKey: '2026-06-09',
        netWorthUsd: usd(1_000_000),
        vsUsdHoldUsd: usd(0),
        allocation: { usd: 100 },
        recordedAt: 111,
      },
      {
        dateKey: '2026-06-10',
        netWorthUsd: usd(1_015_000),
        vsUsdHoldUsd: usd(15_000),
        allocation: { crypto: 30, usd: 70 },
        recordedAt: 222,
      },
    ];

    it('round-trip: saveHistory → loadHistory aynı listeyi döner', () => {
      const storage = makeStorage();

      saveHistory(storage, { v: 1, history: sampleHistory });

      expect(loadHistory(storage)).toEqual({ v: 1, history: sampleHistory });
    });

    it('hiç kayıt yoksa → null', () => {
      expect(loadHistory(makeStorage())).toBeNull();
    });

    it('bozuk JSON → null', () => {
      const storage = makeStorage();
      storage.setItem('miras.history.v1', '{bozuk');

      expect(loadHistory(storage)).toBeNull();
    });

    it('Money alanları usd() ile geri sarılır', () => {
      const storage = makeStorage();
      saveHistory(storage, { v: 1, history: sampleHistory });

      const loaded = loadHistory(storage)!;

      expect(loaded.history[1].netWorthUsd).toEqual({ amount: 1_015_000, currency: 'USD' });
      expect(loaded.history[1].vsUsdHoldUsd).toEqual({ amount: 15_000, currency: 'USD' });
    });
  });

  describe('mevduat persistence', () => {
    it('reviveEnvelope: deposit Money alanlarını yeniden sarar (round2 + tip garantisi)', () => {
      const storage = makeStorage();
      // Yuvarlanmamış tutarlar: revive tryM/usd ile round2 uygulamalı (ham spread yetmez).
      const game = {
        ...createGameState('vasiyet', 1, 'p1', 0),
        deposit: {
          principalTry: { amount: 400_000.999, currency: 'TRY' as const },
          usdAtOpen: { amount: 10_000.555, currency: 'USD' as const },
          usdTryAtOpen: 40,
          openedAtMs: 123,
          annualRate: 0.5,
        },
      };
      saveGame(storage, { v: 1, game, activeBist: [] });
      const loaded = loadGame(storage);

      expect(loaded?.game.deposit?.principalTry).toEqual({ amount: 400_001, currency: 'TRY' });
      expect(loaded?.game.deposit?.usdAtOpen).toEqual({ amount: 10_000.56, currency: 'USD' });
    });

    it('loadGame: deposit alanı olmayan eski kayıt → deposit null', () => {
      const storage = makeStorage();
      const raw = {
        v: 1,
        game: { ...createGameState('vasiyet', 1, 'p1', 0), deposit: undefined },
        activeBist: [],
      };
      storage.setItem('miras.save.v1', JSON.stringify(raw));

      expect(loadGame(storage)?.game.deposit ?? null).toBeNull();
    });
  });

  describe('sealedFx persistence', () => {
    it('round-trip: sealedFx save → load korunur', () => {
      const storage = makeStorage();
      const game = createGameState('canli', 1, 'p1', 1000);
      const envelope: SaveEnvelopeV1 = {
        v: 1,
        game,
        activeBist: [],
        sealedFx: { dateKey: '2026-06-17', rate: 41.25 },
      };

      saveGame(storage, envelope);

      expect(loadGame(storage)?.sealedFx).toEqual({ dateKey: '2026-06-17', rate: 41.25 });
    });

    it('sealedFx olmayan eski kayıt → sealedFx undefined', () => {
      const storage = makeStorage();
      const game = createGameState('canli', 1, 'p1', 1000);

      saveGame(storage, { v: 1, game, activeBist: [] });

      expect(loadGame(storage)?.sealedFx).toBeUndefined();
    });
  });

  describe('getOrCreatePlayerId', () => {
    it('ilk çağrıda üretir ve kalıcı kaydeder', () => {
      const storage = makeStorage();

      const id = getOrCreatePlayerId(storage);

      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(storage.getItem('miras.playerId')).toBe(id);
    });

    it('idempotent: ikinci çağrı aynı id döner', () => {
      const storage = makeStorage();

      const id1 = getOrCreatePlayerId(storage);
      const id2 = getOrCreatePlayerId(storage);

      expect(id1).toBe(id2);
    });
  });
});
