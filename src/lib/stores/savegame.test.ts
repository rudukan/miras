import { describe, it, expect } from 'vitest';
import {
  saveGame,
  loadGame,
  clearSave,
  getOrCreatePlayerId,
  saveHistory,
  loadHistory,
  markPendingWipe,
  consumePendingWipe,
  getOwnerId,
  setOwnerId,
  clearOwnerId,
  getResetAt,
  markReset,
  persistAllowed,
  clearLocalIdentity,
  LOCAL_TOUCHED_KEY,
  type SaveEnvelopeV1,
} from './savegame';
import { createGameState } from './gameState';
import { usd, tryM } from '../domain/money';
import type { DailySnapshot } from '../domain/snapshot/dailySnapshot';
import type { PendingOrder } from '../domain/orders/orders';

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

    it('clearSave: döküm geçmişini de siler (reset/hesap silme sonrası eski döküm kalmamalı)', () => {
      const storage = makeStorage();
      const game = createGameState('canli', 1, 'p1', 1000);
      saveGame(storage, { v: 1, game, activeBist: [] });
      saveHistory(storage, { v: 1, history: sampleHistory });

      clearSave(storage);

      expect(loadGame(storage)).toBeNull();
      expect(loadHistory(storage)).toBeNull();
    });
  });

  describe('pending wipe (miras.pendingWipe)', () => {
    const staleHistory: DailySnapshot[] = [
      {
        dateKey: '2026-07-08',
        netWorthUsd: usd(1_010_000),
        vsUsdHoldUsd: usd(10_000),
        allocation: { usd: 100 },
        recordedAt: 111,
      },
    ];

    it('markPendingWipe → boot consumePendingWipe: kayıt + geçmiş silinir, bayrak düşer, true döner', () => {
      const session = makeStorage();
      const local = makeStorage();
      // Yarış senaryosu: clearSave'den SONRA çalışan store eski durumu geri yazmış olsun.
      const game = createGameState('canli', 1, 'p1', 1000);
      saveGame(local, { v: 1, game, activeBist: [] });
      saveHistory(local, { v: 1, history: staleHistory });
      markPendingWipe(session);

      const wiped = consumePendingWipe(session, local);

      expect(wiped).toBe(true);
      expect(loadGame(local)).toBeNull();
      expect(loadHistory(local)).toBeNull();
      // Bayrak tek kullanımlık: ikinci boot artık silmez.
      saveGame(local, { v: 1, game, activeBist: [] });
      expect(consumePendingWipe(session, local)).toBe(false);
      expect(loadGame(local)).not.toBeNull();
    });

    it('bayrak yokken no-op: false döner, mevcut kayda dokunmaz', () => {
      const session = makeStorage();
      const local = makeStorage();
      const game = createGameState('canli', 1, 'p1', 1000);
      saveGame(local, { v: 1, game, activeBist: [] });

      expect(consumePendingWipe(session, local)).toBe(false);
      expect(loadGame(local)).not.toBeNull();
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

  describe('emlak persistence', () => {
    it('reviveEnvelope: properties Money alanlarını yeniden sarar (round2 + tip garantisi)', () => {
      const storage = makeStorage();
      const game = {
        ...createGameState('canli', 1, 'p1', 0),
        properties: [
          {
            propertyId: 'arsa-ic-anadolu',
            priceTryAtBuy: { amount: 1_200_000.999, currency: 'TRY' as const },
            usdPaid: { amount: 30_000.555, currency: 'USD' as const },
            boughtAtMs: 123,
            lastCollectedAtMs: 456,
          },
        ],
      };
      saveGame(storage, { v: 1, game, activeBist: [] });
      const loaded = loadGame(storage);

      expect(loaded?.game.properties[0].priceTryAtBuy).toEqual({
        amount: 1_200_001,
        currency: 'TRY',
      });
      expect(loaded?.game.properties[0].usdPaid).toEqual({ amount: 30_000.56, currency: 'USD' });
      expect(loaded?.game.properties[0].lastCollectedAtMs).toBe(456);
    });

    it('loadGame: properties alanı olmayan eski kayıt → boş liste (kırılmaz)', () => {
      const storage = makeStorage();
      const game = { ...createGameState('canli', 1, 'p1', 0) } as Record<string, unknown>;
      delete game.properties; // eski kayıt simülasyonu
      storage.setItem('miras.save.v1', JSON.stringify({ v: 1, game, activeBist: [] }));

      expect(loadGame(storage)?.game.properties).toEqual([]);
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

  describe('pendingOrders persistence (Task 3)', () => {
    it('round-trip: pendingOrders kaydedilir; amountUsd usd() ile yeniden sarılır', () => {
      const storage = makeStorage();
      const game = createGameState('canli', 1, 'p1', 1000);
      const pendingOrders: PendingOrder[] = [
        { id: '1000-0', assetId: 'THYAO', side: 'buy', kind: 'units', units: 5, placedAt: 1000 },
        {
          id: '1000-1',
          assetId: 'THYAO',
          side: 'buy',
          kind: 'amountUsd',
          amountUsd: { amount: 500.999, currency: 'USD' }, // JSON.parse sonrası düz obje simülasyonu
          placedAt: 1000,
        },
      ];
      const envelope: SaveEnvelopeV1 = { v: 1, game, activeBist: [], pendingOrders };

      saveGame(storage, envelope);
      const loaded = loadGame(storage);

      expect(loaded?.pendingOrders).toHaveLength(2);
      expect(loaded?.pendingOrders?.[0]).toEqual(pendingOrders[0]); // units-kind: Money yok, aynen döner
      const revived = loaded?.pendingOrders?.[1];
      expect(revived?.kind).toBe('amountUsd');
      if (revived?.kind === 'amountUsd') {
        // usd() round2 uygular — ham JSON objesi (500.999) değil, yeniden sarılmış (501) döner.
        expect(revived.amountUsd).toEqual({ amount: 501, currency: 'USD' });
      }
    });

    it('pendingOrders olmayan eski kayıt → undefined (kırılmaz)', () => {
      const storage = makeStorage();
      const game = createGameState('canli', 1, 'p1', 1000);

      saveGame(storage, { v: 1, game, activeBist: [] });

      expect(loadGame(storage)?.pendingOrders).toBeUndefined();
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

  describe('ownerId damgası', () => {
    it('yokken null, set sonrası okunur, clear sonrası yine null', () => {
      const s = makeStorage();
      expect(getOwnerId(s)).toBeNull();
      setOwnerId(s, 'user-abc');
      expect(getOwnerId(s)).toBe('user-abc');
      clearOwnerId(s);
      expect(getOwnerId(s)).toBeNull();
    });
  });

  describe('resetAt tombstone + persist guard', () => {
    it('markReset sonrası eski createdAt persist edilemez, yenisi edilir', () => {
      const s = makeStorage();
      expect(persistAllowed(s, 1000)).toBe(true); // tombstone yokken serbest
      markReset(s, 5000);
      expect(getResetAt(s)).toBe(5000);
      expect(persistAllowed(s, 5000)).toBe(false); // eşitlik dahil ölü
      expect(persistAllowed(s, 4000)).toBe(false);
      expect(persistAllowed(s, 5001)).toBe(true);  // reset SONRASI kurulan oyun
    });
  });

  describe('clearLocalIdentity (KVKK)', () => {
    it('kimlik anahtarlarını siler, resetAt DURUR', () => {
      const s = makeStorage();
      s.setItem('miras.playerId', 'p1');
      s.setItem(LOCAL_TOUCHED_KEY, '123');
      s.setItem('miras.cardSeen', '2026-07-10');
      s.setItem('miras.lastVisitPing', '2026-07-10');
      setOwnerId(s, 'user-abc');
      markReset(s, 42);
      clearLocalIdentity(s);
      expect(s.getItem('miras.playerId')).toBeNull();
      expect(s.getItem(LOCAL_TOUCHED_KEY)).toBeNull();
      expect(s.getItem('miras.cardSeen')).toBeNull();
      expect(s.getItem('miras.lastVisitPing')).toBeNull();
      expect(getOwnerId(s)).toBeNull();
      expect(getResetAt(s)).toBe(42); // tombstone kalır — zombi-sekme koruması
    });
  });
});
