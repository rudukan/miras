import { describe, it, expect } from 'vitest';
import { VASIYET_2025 } from './macro2025';

const REQUIRED_TICKERS = [
  'THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'SASA', 'YKBNK', 'BIMAS',
];

describe('VASIYET_2025 senaryosu', () => {
  it('temel senaryo alanları doğru', () => {
    expect(VASIYET_2025.id).toBe('vasiyet');
    expect(VASIYET_2025.year).toBe(2025);
    expect(VASIYET_2025.totalDays).toBe(365);
    expect(VASIYET_2025.fxSource).toBe('seeded');
    expect(VASIYET_2025.timeMode).toBe('turn');
  });
});

describe('USD/TRY çapaları', () => {
  const anchors = VASIYET_2025.data.usdTryAnchors;
  it('gün 0 ile başlar, gün 365 ile biter', () => {
    expect(anchors[0].day).toBe(0);
    expect(anchors[anchors.length - 1].day).toBe(365);
  });
  it('gün değerleri kesin artan sırada', () => {
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i].day).toBeGreaterThan(anchors[i - 1].day);
    }
  });
  it('tüm kurlar pozitif', () => {
    for (const a of anchors) expect(a.rate).toBeGreaterThan(0);
  });
  it('yıl içinde yukarı trend (son > ilk)', () => {
    expect(anchors[anchors.length - 1].rate).toBeGreaterThan(anchors[0].rate);
  });
  it('gürültü genliği küçük (0, 0.01)', () => {
    expect(VASIYET_2025.data.usdTryVolatility).toBeGreaterThan(0);
    expect(VASIYET_2025.data.usdTryVolatility).toBeLessThan(0.01);
  });
});

describe('BIST hisseleri', () => {
  const stocks = VASIYET_2025.data.stocks;
  it('tam 9 hisse var', () => {
    expect(stocks).toHaveLength(9);
  });
  it('9 kanonik ticker da mevcut', () => {
    const tickers = stocks.map((s) => s.ticker);
    for (const t of REQUIRED_TICKERS) expect(tickers).toContain(t);
  });
  it('tüm başlangıç fiyatları pozitif', () => {
    for (const s of stocks) expect(s.startPrice).toBeGreaterThan(0);
  });
  it('tüm volatiliteler (0, 0.1) aralığında', () => {
    for (const s of stocks) {
      expect(s.volatility).toBeGreaterThan(0);
      expect(s.volatility).toBeLessThan(0.1);
    }
  });
});
