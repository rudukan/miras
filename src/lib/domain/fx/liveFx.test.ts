import { describe, it, expect } from 'vitest';
import { createLiveFxEngine, type LivePriceSource } from './liveFx';
import { createGameState, buyAsset } from '../../stores/gameState';
import { tryM } from '../money';

// Sahte canlı kaynak: sabit fiyatlar (deterministik test)
function stubSource(prices: Record<string, number>, rate = 40): LivePriceSource {
  return {
    usdTry: () => rate,
    assetTry: (id) => prices[id],
  };
}

describe('createLiveFxEngine', () => {
  const fx = createLiveFxEngine(stubSource({ BTC: 4_000_000, THYAO: 320 }, 40));

  it('usdTryForDay canlı kuru TRY olarak döner, day yok sayılır', () => {
    expect(fx.usdTryForDay(0).amount).toBe(40);
    expect(fx.usdTryForDay(999).amount).toBe(40); // farklı day -> aynı (canlı)
    expect(fx.usdTryForDay(5).currency).toBe('TRY');
  });
  it('assetPriceForDay canlı TRY fiyatı döner, day yok sayılır', () => {
    expect(fx.assetPriceForDay('BTC', 0).amount).toBe(4_000_000);
    expect(fx.assetPriceForDay('BTC', 123).amount).toBe(4_000_000);
    expect(fx.assetPriceForDay('THYAO', 7).currency).toBe('TRY');
  });
  it('bilinmeyen (canlı fiyatı olmayan) varlıkta hata fırlatır', () => {
    expect(() => fx.assetPriceForDay('YOKBU', 1)).toThrow('No live price: YOKBU');
  });
  it('güncel kaynak değişimini yansıtır (canlılık)', () => {
    let p = 100;
    const live = createLiveFxEngine({ usdTry: () => 40, assetTry: () => p });
    expect(live.assetPriceForDay('X', 0).amount).toBe(100);
    p = 150;
    expect(live.assetPriceForDay('X', 0).amount).toBe(150);
  });
});

// SEAM DOĞRULAMA (spec §3): mevcut reducer canlı motorla DEĞİŞMEDEN çalışır.
describe("liveFx seam: mevcut reducer'lar degismeden calisir", () => {
  it('buyAsset canlı fiyatla TRY bakiyeden düşer ve holding ekler', () => {
    const fx = createLiveFxEngine(stubSource({ BTC: 1_000_000 }, 40));
    let s = createGameState('canli', 1, 'p1', 0);
    s = { ...s, tryBalance: tryM(5_000_000) }; // test için TRY yükle
    s = buyAsset(s, fx, 'BTC', 2); // 2 × 1.000.000 = 2.000.000 TRY
    expect(s.tryBalance.amount).toBe(3_000_000);
    expect(s.holdings).toHaveLength(1);
    expect(s.holdings[0]).toMatchObject({ assetId: 'BTC', units: 2 });
    expect(s.holdings[0].avgCost.amount).toBe(1_000_000);
  });
});
