import { describe, it, expect } from 'vitest';
import { VASIYET_2025 } from './macro2025';

const REQUIRED_BIST = [
  'THYAO', 'EREGL', 'ASELS', 'GUBRF', 'KCHOL', 'TUPRS', 'SASA', 'YKBNK', 'BIMAS',
];
const REQUIRED_NEW = ['BTC', 'ETH', 'XAUGRAM', 'XAGGRAM', 'EUR'];

describe('VASIYET_2025 senaryosu', () => {
  it('temel senaryo alanları doğru', () => {
    expect(VASIYET_2025.id).toBe('vasiyet');
    expect(VASIYET_2025.year).toBe(2025);
    expect(VASIYET_2025.totalDays).toBe(365);
    expect(VASIYET_2025.fxSource).toBe('seeded');
    expect(VASIYET_2025.timeMode).toBe('turn');
  });
  it('mevduat yıllık faizi 0.42', () => {
    expect(VASIYET_2025.data.depositAnnualRate).toBe(0.42);
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
  it('yıl içinde yukarı trend (son > ilk)', () => {
    expect(anchors[anchors.length - 1].rate).toBeGreaterThan(anchors[0].rate);
  });
  it('gürültü genliği makul aralıkta (0, 0.05)', () => {
    // 0.012: gerçek 2025 günlük kur gürültüsü ±%1.2; üst sınır 0.05 aşırı volatileyi engeller
    expect(VASIYET_2025.data.usdTryVolatility).toBeGreaterThan(0);
    expect(VASIYET_2025.data.usdTryVolatility).toBeLessThan(0.05);
  });
});

describe('Varlık evreni (assets)', () => {
  const assets = VASIYET_2025.data.assets;
  const ids = assets.map((a) => a.id);

  it('9 kanonik BIST hissesi var ve kategorileri "bist"', () => {
    const bist = assets.filter((a) => a.category === 'bist');
    expect(bist).toHaveLength(9);
    for (const t of REQUIRED_BIST) expect(ids).toContain(t);
  });
  it('5 yeni varlık (BTC/ETH/altın/gümüş/EUR) mevcut', () => {
    for (const t of REQUIRED_NEW) expect(ids).toContain(t);
  });
  it('her varlığın geçerli bir kategorisi var', () => {
    const valid = new Set(['bist', 'crypto', 'commodity', 'fx']);
    for (const a of assets) expect(valid.has(a.category)).toBe(true);
  });
  it('BTC ve ETH crypto, altın/gümüş commodity, EUR fx', () => {
    const cat = (id: string) => assets.find((a) => a.id === id)!.category;
    expect(cat('BTC')).toBe('crypto');
    expect(cat('ETH')).toBe('crypto');
    expect(cat('XAUGRAM')).toBe('commodity');
    expect(cat('XAGGRAM')).toBe('commodity');
    expect(cat('EUR')).toBe('fx');
  });
  it('tüm başlangıç fiyatları pozitif', () => {
    for (const a of assets) expect(a.startPrice).toBeGreaterThan(0);
  });
  it('tüm volatiliteler (0, 0.1) aralığında', () => {
    for (const a of assets) {
      expect(a.volatility).toBeGreaterThan(0);
      expect(a.volatility).toBeLessThan(0.1);
    }
  });
});
