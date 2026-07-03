import { describe, it, expect } from 'vitest';
import { tryM, usd } from '../money';
import {
  type OwnedProperty,
  PROPERTY_CATALOG,
  RENT_ANNUAL_RATE,
  VAULT_CAP_HOURS,
  propertyDef,
  vaultCapTry,
  accruedRentTry,
  isVaultFull,
  collectRent,
} from './property';

const HOUR_MS = 3_600_000;

function makeOwned(price: number, lastCollectedAtMs = 0): OwnedProperty {
  return {
    propertyId: 'arsa-ic-anadolu',
    priceTryAtBuy: tryM(price),
    usdPaid: usd(price / 40),
    boughtAtMs: 0,
    lastCollectedAtMs,
  };
}

/** Beklenen lineer kira: bedel × yıllık oran × saat/(24×365), 2 hane yuvarlı. */
function expectedRent(price: number, hours: number): number {
  return Math.round(price * RENT_ANNUAL_RATE * (hours / (24 * 365)) * 100) / 100;
}

describe('property domain (kira kasası, zaman-damgası tabanlı)', () => {
  it('PROPERTY_CATALOG: 3 emlak, benzersiz id, pozitif TRY fiyat', () => {
    expect(PROPERTY_CATALOG).toHaveLength(3);
    const ids = PROPERTY_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(3);
    for (const d of PROPERTY_CATALOG) {
      expect(d.priceTry.currency).toBe('TRY');
      expect(d.priceTry.amount).toBeGreaterThan(0);
    }
  });

  it('propertyDef: id ile bulur, bilinmeyen id → throw', () => {
    expect(propertyDef('arsa-ic-anadolu').name).toBe('İç Anadolu Tarım Arazisi');
    expect(() => propertyDef('yok-boyle-emlak')).toThrow('Unknown property');
  });

  it('accruedRentTry: 0 anında 0', () => {
    expect(accruedRentTry(makeOwned(1_200_000), 0).amount).toBe(0);
  });

  it('accruedRentTry: negatif süre → 0', () => {
    expect(accruedRentTry(makeOwned(1_200_000), -5 * HOUR_MS).amount).toBe(0);
  });

  it('accruedRentTry: 24 saatte lineer birikim', () => {
    expect(accruedRentTry(makeOwned(1_200_000), 24 * HOUR_MS).amount).toBe(
      expectedRent(1_200_000, 24),
    );
  });

  it('accruedRentTry: tavanda durur (48 saatten sonra büyümez)', () => {
    const p = makeOwned(1_200_000);
    const atCap = accruedRentTry(p, VAULT_CAP_HOURS * HOUR_MS).amount;
    expect(accruedRentTry(p, 200 * HOUR_MS).amount).toBe(atCap);
    expect(atCap).toBe(expectedRent(1_200_000, VAULT_CAP_HOURS));
  });

  it('vaultCapTry: tam VAULT_CAP_HOURS saatlik kira', () => {
    const p = makeOwned(4_500_000);
    expect(vaultCapTry(p).amount).toBe(expectedRent(4_500_000, VAULT_CAP_HOURS));
    expect(vaultCapTry(p)).toEqual(accruedRentTry(p, VAULT_CAP_HOURS * HOUR_MS));
  });

  it('isVaultFull: tavandan önce false, tavanda ve sonrasında true', () => {
    const p = makeOwned(1_200_000);
    expect(isVaultFull(p, (VAULT_CAP_HOURS - 1) * HOUR_MS)).toBe(false);
    expect(isVaultFull(p, VAULT_CAP_HOURS * HOUR_MS)).toBe(true);
    expect(isVaultFull(p, 500 * HOUR_MS)).toBe(true);
  });

  it('collectRent: birikmişi döner, anchor nowMs olur (kasa sıfırlanır)', () => {
    const p = makeOwned(1_200_000);
    const at = 24 * HOUR_MS;
    const { property: after, rentTry } = collectRent(p, at);
    expect(rentTry.amount).toBe(expectedRent(1_200_000, 24));
    expect(after.lastCollectedAtMs).toBe(at);
    // tahsil sonrası kasa sıfırdan birikir
    expect(accruedRentTry(after, at).amount).toBe(0);
    expect(accruedRentTry(after, at + 24 * HOUR_MS).amount).toBe(expectedRent(1_200_000, 24));
  });

  it('collectRent: kasa doluyken tahsil tavanı öder, sonrası yeniden birikir', () => {
    const p = makeOwned(1_200_000);
    const at = 300 * HOUR_MS; // tavanın çok ötesi — sadece tavan ödenir
    const { rentTry } = collectRent(p, at);
    expect(rentTry).toEqual(vaultCapTry(p));
  });
});
