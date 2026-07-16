import { describe, it, expect } from 'vitest';
import {
  createGameState,
  buyAsset,
  sellAsset,
  advanceTime,
  nextEventDay,
  netWorthUsd,
  netWorthPartsUsd,
  profitRate,
  grewDollars,
  openDeposit,
  breakDeposit,
  buyProperty,
  sellProperty,
  collectPropertyRent,
  STARTING_USD,
} from './gameState';
import { usd } from '../domain/money';
import { TERM_DAYS, DEPOSIT_ANNUAL_RATE } from '../domain/deposit/deposit';
import { accruedRentTry, vaultCapTry } from '../domain/property/property';
import type { UsdPriceOracle } from '../domain/fx/usdOracle';

// Sahte USD fiyat oracle'ı: sabit USD fiyatları (deterministik test).
function stubOracle(prices: Record<string, number>): UsdPriceOracle {
  return {
    assetUsd(id) {
      const p = prices[id];
      if (p === undefined) throw new Error(`No live price: ${id}`);
      return usd(p);
    },
  };
}

const ORACLE = stubOracle({ THYAO: 7.5, ASELS: 5, BTC: 64000, EUR: 1.1 });

describe('createGameState', () => {
  const s = createGameState('vasiyet', 12345, 'player-1', 1000);

  it('başlangıçta $1,000,000 USD', () => {
    expect(s.usdBalance).toEqual({ amount: STARTING_USD, currency: 'USD' });
  });
  it('gün 1, vasiyet 365g', () => {
    expect(s.clock.day).toBe(1);
    expect(s.clock.totalDays).toBe(365);
  });
  it('boş portföy', () => {
    expect(s.holdings).toEqual([]);
  });
  it('boş emlak listesi', () => {
    expect(s.properties).toEqual([]);
  });
  it('kimlik ve zaman alanları', () => {
    expect(s.playerId).toBe('player-1');
    expect(s.scenarioId).toBe('vasiyet');
    expect(s.seed).toBe(12345);
    expect(s.createdAt).toBe(1000);
    expect(s.updatedAt).toBe(1000);
  });
});

describe('varlık al/sat (USD oto-takas)', () => {
  it('buyAsset: USD düşer, holding eklenir, avgCost = USD alış fiyatı', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const s2 = buyAsset(s0, ORACLE, 'THYAO', 100); // 100 × $7.5 = $750
    const h = s2.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(100);
    expect(h.avgCost).toEqual({ amount: 7.5, currency: 'USD' });
    expect(s2.usdBalance.amount).toBeCloseTo(STARTING_USD - 750, 2);
  });

  it('buyAsset kesirli units (0.05 BTC)', () => {
    const s0 = createGameState('vasiyet', 12345, 'p', 0);
    const s2 = buyAsset(s0, ORACLE, 'BTC', 0.05); // 0.05 × $64000 = $3200
    expect(s2.holdings.find((x) => x.assetId === 'BTC')!.units).toBeCloseTo(0.05, 8);
    expect(s2.usdBalance.amount).toBeCloseTo(STARTING_USD - 3200, 2);
  });

  it('buyAsset ikinci alış: units toplanır, avgCost ağırlıklı ortalama (USD)', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100);
    s = buyAsset(s, ORACLE, 'THYAO', 100); // aynı fiyat
    const h = s.holdings.find((x) => x.assetId === 'THYAO')!;
    expect(h.units).toBe(200);
    expect(h.avgCost.amount).toBeCloseTo(7.5, 2);
  });

  it('buyAsset yetersiz USD -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'THYAO', 1_000_000)).toThrow('Insufficient USD');
  });
  it('buyAsset fiyatsız varlık -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'YOKBU', 1)).toThrow('No live price');
  });
  it('buyAsset pozitif olmayan units -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => buyAsset(s, ORACLE, 'THYAO', 0)).toThrow('positive');
  });

  it('sellAsset: USD artar, units azalır', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100); // -$750
    const before = s.usdBalance.amount;
    s = sellAsset(s, ORACLE, 'THYAO', 40); // +40 × $7.5 = $300
    expect(s.holdings.find((x) => x.assetId === 'THYAO')!.units).toBe(60);
    expect(s.usdBalance.amount).toBeCloseTo(before + 300, 2);
  });
  it('sellAsset tamamı satılınca holding silinir', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100);
    s = sellAsset(s, ORACLE, 'THYAO', 100);
    expect(s.holdings.find((x) => x.assetId === 'THYAO')).toBeUndefined();
  });
  it('sellAsset sahip olunandan fazla -> hata', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 10);
    expect(() => sellAsset(s, ORACLE, 'THYAO', 11)).toThrow('Insufficient units');
  });
  it('sellAsset hiç sahip olunmayan -> hata', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(() => sellAsset(s, ORACLE, 'THYAO', 1)).toThrow('Insufficient units');
  });
});

describe('zaman ilerletme', () => {
  it('advanceTime günü ilerletir', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 10);
    expect(s.clock.day).toBe(11);
  });
  it('advanceTime totalDays üstüne çıkmaz', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 999);
    expect(s.clock.day).toBe(365);
  });
  it('nextEventDay son günü verir', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(nextEventDay(s)).toBe(365);
  });
  it('nextEventDay son günde null', () => {
    const s = advanceTime(createGameState('vasiyet', 12345, 'p', 0), 999);
    expect(nextEventDay(s)).toBeNull();
  });
});

describe('skor (USD)', () => {
  it('gün 1, pozisyonsuz: net servet = $1,000,000', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(netWorthUsd(s, ORACLE).amount).toBeCloseTo(STARTING_USD, 2);
  });
  it('gün 1 pozisyonsuz: profitRate = 1.0', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(profitRate(s, ORACLE)).toBeCloseTo(1.0, 4);
  });
  it('pozisyonsuz nakit doları büyütmez (grewDollars=false)', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    expect(grewDollars(s, ORACLE)).toBe(false);
  });
  it('alım sonrası net servet korunur (oto-takas, makas yok)', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'BTC', 1); // -$64000 nakit, +$64000 holding
    expect(netWorthUsd(s, ORACLE).amount).toBeCloseTo(STARTING_USD, 2);
  });
  it('grewDollars: holding değeri artınca true', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'BTC', 10); // -$640000, +10 BTC
    // fiyat $64000 → $80000 yükselen oracle ile değerle
    const up = stubOracle({ BTC: 80000 });
    expect(grewDollars(s, up)).toBe(true);
    expect(netWorthUsd(s, up).amount).toBeCloseTo(STARTING_USD + 10 * 16000, 2);
  });
  it('determinizm: aynı aksiyonlar -> aynı net servet', () => {
    function run() {
      let s = createGameState('vasiyet', 7, 'p', 0);
      s = buyAsset(s, ORACLE, 'BTC', 0.1);
      s = buyAsset(s, ORACLE, 'THYAO', 200);
      s = advanceTime(s, 100);
      return netWorthUsd(s, ORACLE).amount;
    }
    expect(run()).toBe(run());
  });
});

describe('netWorthPartsUsd (kısmi toplam — eksik fiyat tüm döngüyü durdurmaz)', () => {
  it('tüm holding fiyatları biliniyorsa complete=true, totalUsd = netWorthUsd ile birebir', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100);
    s = buyAsset(s, ORACLE, 'BTC', 0.1);
    const parts = netWorthPartsUsd(s, ORACLE);
    expect(parts.complete).toBe(true);
    expect(parts.totalUsd).toBeCloseTo(netWorthUsd(s, ORACLE).amount, 2);
  });

  it('2 holding, biri fiyatsız: fiyatsız olan ATLANIR (döngü durmaz), diğeri + nakit toplanır, complete=false', () => {
    let s = createGameState('vasiyet', 12345, 'p', 0);
    s = buyAsset(s, ORACLE, 'THYAO', 100); // fiyatlanabilir kalacak
    s = buyAsset(s, ORACLE, 'BTC', 0.1); // fiyatı kaybolacak
    const partialOracle = stubOracle({ THYAO: 7.5 }); // BTC eksik
    const cashAfterBuys = s.usdBalance.amount;

    const parts = netWorthPartsUsd(s, partialOracle);

    expect(parts.complete).toBe(false);
    // BTC atlanmış olmalı ama THYAO + nakit toplanmaya devam etmiş olmalı (ilk throw'da durmadı).
    expect(parts.totalUsd).toBeCloseTo(cashAfterBuys + 100 * 7.5, 2);
  });

  it('holding yok (yalnız nakit): complete=true, totalUsd = nakit', () => {
    const s = createGameState('vasiyet', 12345, 'p', 0);
    const parts = netWorthPartsUsd(s, ORACLE);
    expect(parts.complete).toBe(true);
    expect(parts.totalUsd).toBeCloseTo(STARTING_USD, 2);
  });
});

describe("mevduat reducer'ları", () => {
  const DAY_MS = 86_400_000;
  const base = createGameState('vasiyet', 1, 'p1', 0); // usdBalance $1M, deposit null

  it('openDeposit: USD→TL oto-takas, nakit düşer, deposit kurulur', () => {
    const s = openDeposit(base, 40, 10_000, 1000);
    expect(s.usdBalance.amount).toBe(990_000);
    expect(s.deposit?.principalTry.amount).toBe(400_000);
    expect(s.deposit?.usdAtOpen.amount).toBe(10_000);
    expect(s.deposit?.usdTryAtOpen).toBe(40);
    expect(s.deposit?.openedAtMs).toBe(1000);
    expect(s.deposit?.annualRate).toBe(DEPOSIT_ANNUAL_RATE);
  });

  it('openDeposit: yetersiz bakiye / sıfır tutar / aktif mevduat → throw', () => {
    expect(() => openDeposit(base, 40, 2_000_000, 0)).toThrow();
    expect(() => openDeposit(base, 40, 0, 0)).toThrow();
    const withDep = openDeposit(base, 40, 10_000, 0);
    expect(() => openDeposit(withDep, 40, 10_000, 0)).toThrow();
  });

  it('breakDeposit: erken bozma → sadece anapara TL→USD geri', () => {
    const opened = openDeposit(base, 40, 10_000, 0);
    const closed = breakDeposit(opened, 40, DAY_MS); // 1 gün, vade dolmadı
    expect(closed.usdBalance.amount).toBe(1_000_000); // anapara aynen geri
    expect(closed.deposit).toBeNull();
  });

  it('breakDeposit: vade dolunca anapara + net faiz geri', () => {
    const opened = openDeposit(base, 40, 10_000, 0);
    const closed = breakDeposit(opened, 40, TERM_DAYS * DAY_MS);
    expect(closed.usdBalance.amount).toBeGreaterThan(1_000_000); // faiz eklendi
    expect(closed.deposit).toBeNull();
  });
});

describe("emlak reducer'ları (kira kasası)", () => {
  const HOUR_MS = 3_600_000;
  const base = createGameState('canli', 1, 'p1', 0); // $1M nakit, properties []
  const ARSA = 'arsa-ic-anadolu'; // ₺1.2M

  it('buyProperty: bedel USD nakitten mühürlü kurla düşer, emlak listeye girer', () => {
    const s = buyProperty(base, 40, ARSA, 1000);
    expect(s.usdBalance.amount).toBeCloseTo(1_000_000 - 1_200_000 / 40, 2); // -$30,000
    expect(s.properties).toHaveLength(1);
    const p = s.properties[0];
    expect(p.propertyId).toBe(ARSA);
    expect(p.priceTryAtBuy).toEqual({ amount: 1_200_000, currency: 'TRY' });
    expect(p.usdPaid.amount).toBeCloseTo(30_000, 2);
    expect(p.boughtAtMs).toBe(1000);
    expect(p.lastCollectedAtMs).toBe(1000); // kasa alım anından birikmeye başlar
  });

  it('buyProperty: aynı emlaktan ikincisi / bilinmeyen id / yetersiz bakiye / geçersiz kur → throw', () => {
    const owned = buyProperty(base, 40, ARSA, 0);
    expect(() => buyProperty(owned, 40, ARSA, 0)).toThrow('already owned');
    expect(() => buyProperty(base, 40, 'yok-boyle', 0)).toThrow('Unknown property');
    expect(() => buyProperty(base, 0.01, 'isletme-kadikoy-kafe', 0)).toThrow('Insufficient USD'); // ₺15M / 0.01 = $1.5Mrd
    expect(() => buyProperty(base, 0, ARSA, 0)).toThrow('Invalid FX rate');
  });

  it('collectPropertyRent: kasadaki kira USD nakite geçer, kasa sıfırlanır', () => {
    const s0 = buyProperty(base, 40, ARSA, 0);
    const rentTl = accruedRentTry(s0.properties[0], 24 * HOUR_MS).amount;
    const s1 = collectPropertyRent(s0, 40, ARSA, 24 * HOUR_MS);
    // Money kuralı: USD'ye çevrim usd() ile 2 haneye yuvarlanır
    expect(s1.usdBalance.amount).toBeCloseTo(s0.usdBalance.amount + usd(rentTl / 40).amount, 2);
    expect(s1.properties[0].lastCollectedAtMs).toBe(24 * HOUR_MS);
    expect(accruedRentTry(s1.properties[0], 24 * HOUR_MS).amount).toBe(0);
  });

  it('collectPropertyRent: sahip olunmayan emlak → throw', () => {
    expect(() => collectPropertyRent(base, 40, ARSA, 0)).toThrow('not owned');
  });

  it('sellProperty: bedel + kasadaki kira USD olarak döner, emlak listeden çıkar', () => {
    const s0 = buyProperty(base, 40, ARSA, 0);
    const rentTl = accruedRentTry(s0.properties[0], 24 * HOUR_MS).amount;
    const s1 = sellProperty(s0, 40, ARSA, 24 * HOUR_MS);
    expect(s1.properties).toHaveLength(0);
    expect(s1.usdBalance.amount).toBeCloseTo(
      s0.usdBalance.amount + usd((1_200_000 + rentTl) / 40).amount,
      2,
    );
  });

  it('sellProperty: kur değişse de bedel TL sabit — düşen kurda USD karşılığı artar', () => {
    const s0 = buyProperty(base, 40, ARSA, 0); // $30,000 ödendi
    const s1 = sellProperty(s0, 30, ARSA, 0);  // TL değerlendi: ₺1.2M / 30 = $40,000
    expect(s1.usdBalance.amount).toBeCloseTo(s0.usdBalance.amount + 40_000, 2);
  });

  it('sellProperty: sahip olunmayan emlak → throw', () => {
    expect(() => sellProperty(base, 40, ARSA, 0)).toThrow('not owned');
  });

  it('kasa tavanı reducer üzerinden de görünür: uzun süre sonra tahsil = tavan', () => {
    const s0 = buyProperty(base, 40, ARSA, 0);
    const cap = vaultCapTry(s0.properties[0]).amount;
    const s1 = collectPropertyRent(s0, 40, ARSA, 1000 * HOUR_MS);
    expect(s1.usdBalance.amount).toBeCloseTo(s0.usdBalance.amount + cap / 40, 2);
  });
});
