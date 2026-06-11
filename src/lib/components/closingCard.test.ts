import { describe, it, expect } from 'vitest';
import { usd } from '../domain/money';
import { createGameState } from '../stores/gameState';
import type { DailySnapshot } from '../domain/snapshot/dailySnapshot';
import { buildClosingCardModel, DISCLAIMER } from './closingCard';

// 2026-06-10 12:00 Europe/Istanbul
const NOW = new Date('2026-06-10T12:00:00+03:00').getTime();
const YESTERDAY_KEY = '2026-06-09';
const TODAY_KEY = '2026-06-10';

function snap(dateKey: string, netWorth: number, allocation: DailySnapshot['allocation']): DailySnapshot {
  return {
    dateKey,
    netWorthUsd: usd(netWorth),
    vsUsdHoldUsd: usd(netWorth - 1_000_000),
    allocation,
    recordedAt: 0,
  };
}

describe('buildClosingCardModel', () => {
  it('ilk gün: önceki snapshot yok → headline = TOPLAM GETİRİ = vsUsdHold', () => {
    const game = createGameState('canli', 1, 'p1', NOW);
    const history = [snap(TODAY_KEY, 1_015_000, { crypto: 100 })];

    const model = buildClosingCardModel(game, usd(1_015_000), usd(15_000), history, NOW);

    expect(model.headlineLabel).toBe('TOPLAM GETİRİ');
    expect(model.headlineValue).toBe('+$15,000.00');
    expect(model.headlineClass).toBe('text-term-green');
  });

  it('dünden beri pozitif → DÜNDEN BERİ + yeşil', () => {
    const game = createGameState('canli', 1, 'p1', NOW);
    const history = [
      snap(YESTERDAY_KEY, 1_000_000, { usd: 100 }),
      snap(TODAY_KEY, 1_015_000, { crypto: 50, usd: 50 }),
    ];

    const model = buildClosingCardModel(game, usd(1_015_000), usd(15_000), history, NOW);

    expect(model.headlineLabel).toBe('DÜNDEN BERİ');
    expect(model.headlineValue).toBe('+$15,000.00');
    expect(model.headlineClass).toBe('text-term-green');
  });

  it('dünden beri negatif → kırmızı', () => {
    const game = createGameState('canli', 1, 'p1', NOW);
    const history = [
      snap(YESTERDAY_KEY, 1_020_000, { usd: 100 }),
      snap(TODAY_KEY, 1_015_000, { usd: 100 }),
    ];

    const model = buildClosingCardModel(game, usd(1_015_000), usd(15_000), history, NOW);

    expect(model.headlineValue).toBe('-$5,000.00');
    expect(model.headlineClass).toBe('text-term-red');
  });

  it('"DOLAR TUTSAYDIN" satırı vsUsdHold\'u taşır', () => {
    const game = createGameState('canli', 1, 'p1', NOW);
    const history = [snap(TODAY_KEY, 985_000, { usd: 100 })];

    const model = buildClosingCardModel(game, usd(985_000), usd(-15_000), history, NOW);

    expect(model.vsUsdHoldValue).toBe('-$15,000.00');
    expect(model.vsUsdHoldClass).toBe('text-term-red');
  });

  it('segment sırası: crypto → bist → commodity → fx → usd, sıfır olanlar elenir', () => {
    const game = createGameState('canli', 1, 'p1', NOW);
    const history = [
      snap(TODAY_KEY, 1_000_000, { fx: 10, crypto: 30, usd: 40, bist: 20 }),
    ];

    const model = buildClosingCardModel(game, usd(1_000_000), usd(0), history, NOW);

    expect(model.segments.map((s) => s.key)).toEqual(['crypto', 'bist', 'fx', 'usd']);
    expect(model.segments.find((s) => s.key === 'crypto')?.pct).toBe(30);
    expect(model.segments.find((s) => s.key === 'crypto')?.label).toBe('KRİPTO');
    expect(model.segments.find((s) => s.key === 'usd')?.label).toBe('DOLAR');
    // term.* token'ları — hard-coded #hex yok
    expect(model.segments.every((s) => s.colorClass.startsWith('bg-term-'))).toBe(true);
  });

  it('rozet: en büyük pay ≥%50 → ilgili rozet', () => {
    const game = createGameState('canli', 1, 'p1', NOW);
    const history = [snap(TODAY_KEY, 1_000_000, { crypto: 60, usd: 40 })];

    const model = buildClosingCardModel(game, usd(1_000_000), usd(0), history, NOW);

    expect(model.badge).toBe("Kripto'cu");
  });

  it('disclaimer her modelde sabit ve sabit metinle eşleşir', () => {
    const game = createGameState('canli', 1, 'p1', NOW);

    const m1 = buildClosingCardModel(game, usd(1_000_000), usd(0), [], NOW);
    const m2 = buildClosingCardModel(game, usd(900_000), usd(-100_000), [snap(TODAY_KEY, 900_000, {})], NOW);

    expect(m1.disclaimer).toBe(DISCLAIMER);
    expect(m2.disclaimer).toBe(DISCLAIMER);
    expect(DISCLAIMER).toMatch(/SANAL OYUN/);
    expect(DISCLAIMER).toMatch(/GERÇEK PARA DEĞİL/);
  });

  it('history boş (henüz poll yok) → segments boş, badge Temkinli, çökmez', () => {
    const game = createGameState('canli', 1, 'p1', NOW);

    const model = buildClosingCardModel(game, usd(1_000_000), usd(0), [], NOW);

    expect(model.segments).toEqual([]);
    expect(model.badge).toBe('Temkinli');
  });

  it('dayLabel daysElapsed kullanır (GÜN N)', () => {
    const game = createGameState('canli', 1, 'p1', NOW);

    const model = buildClosingCardModel(game, usd(1_000_000), usd(0), [], NOW);

    expect(model.dayLabel).toBe('GÜN 1');
  });
});
