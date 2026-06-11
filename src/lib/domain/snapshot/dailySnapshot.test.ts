import { describe, it, expect } from 'vitest';
import { usd } from '../money';
import type { AssetCategory } from '../scenario/types';
import {
  computeAllocation,
  upsertSnapshot,
  previousSnapshot,
  changeSince,
  strategyBadge,
  daysElapsed,
  type DailySnapshot,
} from './dailySnapshot';

const categoryOf = (id: string): AssetCategory => {
  if (id === 'BTC') return 'crypto';
  if (id === 'THYAO') return 'bist';
  if (id === 'XAUGRAM') return 'commodity';
  if (id === 'EUR') return 'fx';
  return 'bist';
};

function snapshot(dateKey: string, netWorth: number): DailySnapshot {
  return {
    dateKey,
    netWorthUsd: usd(netWorth),
    vsUsdHoldUsd: usd(netWorth - 1_000_000),
    allocation: { usd: 100 },
    recordedAt: 0,
  };
}

describe('computeAllocation', () => {
  it('toplam ≈100 (BTC + THYAO + nakit)', () => {
    const a = computeAllocation(
      500_000,
      [
        { assetId: 'BTC', valueUsd: 300_000 },
        { assetId: 'THYAO', valueUsd: 200_000 },
      ],
      1_000_000,
      categoryOf,
    );
    const total = Object.values(a).reduce((s, v) => s + (v ?? 0), 0);
    expect(total).toBeCloseTo(100, 2);
    expect(a.crypto).toBeCloseTo(30, 2);
    expect(a.bist).toBeCloseTo(20, 2);
    expect(a.usd).toBeCloseTo(50, 2);
  });

  it('yalnız nakit → {usd:100}', () => {
    const a = computeAllocation(1_000_000, [], 1_000_000, categoryOf);
    expect(a).toEqual({ usd: 100 });
  });

  it('aynı kategoride birden çok holding birikir', () => {
    const a = computeAllocation(
      0,
      [
        { assetId: 'BTC', valueUsd: 600_000 },
        { assetId: 'THYAO', valueUsd: 400_000 },
        { assetId: 'XAUGRAM', valueUsd: 0 }, // 0 değer atlanır
      ],
      1_000_000,
      categoryOf,
    );
    expect(a.crypto).toBeCloseTo(60, 2);
    expect(a.bist).toBeCloseTo(40, 2);
    expect(a.commodity).toBeUndefined();
  });

  it('netWorth <= 0 → boş obje', () => {
    expect(computeAllocation(0, [], 0, categoryOf)).toEqual({});
  });
});

describe('upsertSnapshot', () => {
  it('yeni gün → eklenir (append)', () => {
    const history = [snapshot('2026-06-08', 1_000_000)];
    const next = upsertSnapshot(history, snapshot('2026-06-09', 1_010_000));
    expect(next.map((s) => s.dateKey)).toEqual(['2026-06-08', '2026-06-09']);
  });

  it('aynı gün → günün son değeri ile değiştirilir (replace)', () => {
    const history = [snapshot('2026-06-08', 1_000_000), snapshot('2026-06-09', 1_010_000)];
    const next = upsertSnapshot(history, snapshot('2026-06-09', 1_020_000));
    expect(next).toHaveLength(2);
    expect(next[1].netWorthUsd.amount).toBe(1_020_000);
  });

  it('60 kaydı aşınca en eskiler düşer (cap), sıra korunur', () => {
    let history: DailySnapshot[] = [];
    for (let i = 1; i <= 61; i++) {
      const day = String(i).padStart(3, '0');
      history = upsertSnapshot(history, snapshot(`2026-01-${day}`, 1_000_000 + i));
    }
    expect(history).toHaveLength(60);
    expect(history[0].dateKey).toBe('2026-01-002'); // ilk gün (001) düştü
    expect(history[59].dateKey).toBe('2026-01-061'); // son eklenen
    expect(history[59].netWorthUsd.amount).toBe(1_000_061);
  });
});

describe('previousSnapshot', () => {
  it('boş geçmiş → null', () => {
    expect(previousSnapshot([], '2026-06-10')).toBeNull();
  });

  it('bugünden önceki en yakın kayıt döner', () => {
    const history = [
      snapshot('2026-06-08', 1_000_000),
      snapshot('2026-06-09', 1_010_000),
    ];
    const prev = previousSnapshot(history, '2026-06-10');
    expect(prev?.dateKey).toBe('2026-06-09');
  });

  it('yalnızca bugünün kaydı varsa → null', () => {
    const history = [snapshot('2026-06-10', 1_000_000)];
    expect(previousSnapshot(history, '2026-06-10')).toBeNull();
  });
});

describe('changeSince', () => {
  it('önceki yoksa → null', () => {
    const current = snapshot('2026-06-10', 1_010_000);
    expect(changeSince(current, null)).toBeNull();
  });

  it('delta hesaplanır (artış/azalış)', () => {
    const prev = snapshot('2026-06-09', 1_000_000);
    const current = snapshot('2026-06-10', 1_015_000);
    const change = changeSince(current, prev);
    expect(change?.netWorthDeltaUsd.amount).toBeCloseTo(15_000, 2);
    expect(change?.vsUsdHoldDeltaUsd.amount).toBeCloseTo(15_000, 2);
  });
});

describe('strategyBadge', () => {
  it('boş allocation → Temkinli', () => {
    expect(strategyBadge({})).toBe('Temkinli');
  });

  it('en büyük pay %49.9 (< 50) → eşik altı, Temkinli', () => {
    expect(strategyBadge({ crypto: 49.9, bist: 30, usd: 20.1 })).toBe('Temkinli');
  });

  it('en büyük pay tam %50 → eşik, rozet kazanır', () => {
    expect(strategyBadge({ crypto: 49.9, usd: 50.1 })).toBe('Mevduatçı');
    expect(strategyBadge({ crypto: 50, usd: 50 })).toBe("Kripto'cu"); // eşitlik → sabit öncelik (crypto)
    expect(strategyBadge({ bist: 50, fx: 50 })).toBe('Borsacı');
  });

  it('kategori → rozet eşlemesi', () => {
    expect(strategyBadge({ commodity: 70 })).toBe('Altıncı');
    expect(strategyBadge({ fx: 80 })).toBe('Dövizci');
    expect(strategyBadge({ usd: 100 })).toBe('Mevduatçı');
  });
});

describe('daysElapsed', () => {
  it('aynı İstanbul günü → 1', () => {
    const created = new Date('2026-06-10T10:00:00+03:00').getTime();
    const now = new Date('2026-06-10T23:59:00+03:00').getTime();
    expect(daysElapsed(created, now)).toBe(1);
  });

  it('İstanbul gece yarısı sınırı (UTC 21:00 = İstanbul 00:00) → 2', () => {
    const created = new Date('2026-06-10T10:00:00+03:00').getTime();
    const now = new Date('2026-06-11T00:01:00+03:00').getTime(); // = 2026-06-10T21:01:00Z
    expect(daysElapsed(created, now)).toBe(2);
  });

  it('UTC 20:59 hâlâ aynı İstanbul günü → 1', () => {
    const created = new Date('2026-06-10T10:00:00+03:00').getTime();
    const now = new Date('2026-06-10T23:59:00+03:00').getTime(); // = 2026-06-10T20:59:00Z
    expect(daysElapsed(created, now)).toBe(1);
  });
});
