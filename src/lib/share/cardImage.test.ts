import { describe, it, expect } from 'vitest';
import { buildCardLayout, CARD_SIZE, TERM_COLORS, type Primitive } from './cardImage';
import { DISCLAIMER, type ClosingCardModel } from '../components/closingCard';

function makeModel(overrides: Partial<ClosingCardModel> = {}): ClosingCardModel {
  return {
    dayLabel: 'GÜN 1',
    headlineLabel: 'TOPLAM GETİRİ',
    headlineValue: '+$0.00',
    headlineClass: 'text-term-text',
    vsUsdHoldValue: '+$0.00',
    vsUsdHoldClass: 'text-term-text',
    segments: [{ key: 'usd', label: 'DOLAR', pct: 100, colorClass: 'bg-term-text' }],
    badge: 'Mevduatçı',
    disclaimer: DISCLAIMER,
    ...overrides,
  };
}

function rects(layout: Primitive[]) {
  return layout.filter((p): p is Extract<Primitive, { type: 'rect' }> => p.type === 'rect');
}
function texts(layout: Primitive[]) {
  return layout.filter((p): p is Extract<Primitive, { type: 'text' }> => p.type === 'text');
}

describe('buildCardLayout', () => {
  it("disclaimer her layout'ta bulunur (hukuk regresyonu)", () => {
    const m1 = buildCardLayout(makeModel());
    const m2 = buildCardLayout(
      makeModel({ segments: [], headlineClass: 'text-term-red', headlineValue: '-$1,234,567.89' }),
    );

    expect(texts(m1).some((t) => t.text === DISCLAIMER)).toBe(true);
    expect(texts(m2).some((t) => t.text === DISCLAIMER)).toBe(true);
  });

  it('bar segment genişlikleri pct ile orantılı', () => {
    const model = makeModel({
      segments: [
        { key: 'crypto', label: 'KRİPTO', pct: 30, colorClass: 'bg-term-amber' },
        { key: 'usd', label: 'DOLAR', pct: 70, colorClass: 'bg-term-text' },
      ],
    });

    const layout = buildCardLayout(model);
    const segRects = rects(layout).filter(
      (r) => r.fill === TERM_COLORS.amber || r.fill === TERM_COLORS.text,
    );
    expect(segRects).toHaveLength(2);
    const [crypto, usd] = segRects;
    expect(crypto.w / usd.w).toBeCloseTo(30 / 70, 1);
  });

  it('hiçbir dikdörtgen kanvası taşmaz (x+w ≤ CARD_SIZE, y+h ≤ CARD_SIZE)', () => {
    const layout = buildCardLayout(
      makeModel({
        segments: [
          { key: 'crypto', label: 'KRİPTO', pct: 25, colorClass: 'bg-term-amber' },
          { key: 'bist', label: 'BIST', pct: 25, colorClass: 'bg-term-blue' },
          { key: 'commodity', label: 'ALTIN&GÜMÜŞ', pct: 25, colorClass: 'bg-term-green' },
          { key: 'usd', label: 'DOLAR', pct: 25, colorClass: 'bg-term-text' },
        ],
      }),
    );

    for (const r of rects(layout)) {
      expect(r.x + r.w).toBeLessThanOrEqual(CARD_SIZE);
      expect(r.y + r.h).toBeLessThanOrEqual(CARD_SIZE);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('uzun rakamda headline font küçülür', () => {
    const short = buildCardLayout(makeModel({ headlineValue: '+$0.00' }));
    const long = buildCardLayout(makeModel({ headlineValue: '+$12,345,678.90' }));

    const sizeOf = (layout: Primitive[], text: string) => {
      const t = texts(layout).find((p) => p.text === text)!;
      return Number(t.font.match(/(\d+)px/)![1]);
    };

    expect(sizeOf(long, '+$12,345,678.90')).toBeLessThan(sizeOf(short, '+$0.00'));
  });

  it('segments boşsa bar dikdörtgenleri yok ama disclaimer/headline yine var', () => {
    const layout = buildCardLayout(makeModel({ segments: [] }));

    expect(texts(layout).some((t) => t.text === DISCLAIMER)).toBe(true);
    expect(texts(layout).some((t) => t.text === '+$0.00')).toBe(true);
  });
});
