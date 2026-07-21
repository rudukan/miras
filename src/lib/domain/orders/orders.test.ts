import { describe, it, expect } from 'vitest';
import { resolveUnits, type PendingOrder } from './orders';
import { usd } from '../money';

describe('resolveUnits', () => {
  it('units-kind: adet emir anında sabitlenmiştir, fiyattan bağımsız aynen döner', () => {
    const order: PendingOrder = { id: 'o1', assetId: 'THYAO', side: 'buy', kind: 'units', units: 5, placedAt: 0 };
    expect(resolveUnits(order, 327.5)).toBe(5);
  });

  it('units-kind: sell tarafı da aynen döner', () => {
    const order: PendingOrder = { id: 'o2', assetId: 'THYAO', side: 'sell', kind: 'units', units: 2.5, placedAt: 0 };
    expect(resolveUnits(order, 999)).toBe(2.5);
  });

  it('amountUsd-kind: tutarı fiyattan adede çevirir (floor, 1e4 hassasiyet — TradeForm kuralıyla aynı)', () => {
    const order: PendingOrder = { id: 'o3', assetId: 'THYAO', side: 'buy', kind: 'amountUsd', amountUsd: usd(500), placedAt: 0 };
    expect(resolveUnits(order, 327.5)).toBe(1.5267);
  });

  it('fiyat sıfır veya negatif -> throw (amountUsd-kind)', () => {
    const order: PendingOrder = { id: 'o4', assetId: 'THYAO', side: 'buy', kind: 'amountUsd', amountUsd: usd(500), placedAt: 0 };
    expect(() => resolveUnits(order, 0)).toThrow();
    expect(() => resolveUnits(order, -10)).toThrow();
  });

  it('fiyat sıfır veya negatif -> throw (units-kind de aynı ön koşula tabi)', () => {
    const order: PendingOrder = { id: 'o5', assetId: 'THYAO', side: 'sell', kind: 'units', units: 5, placedAt: 0 };
    expect(() => resolveUnits(order, 0)).toThrow();
    expect(() => resolveUnits(order, -1)).toThrow();
  });
});
