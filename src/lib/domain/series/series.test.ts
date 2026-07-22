import { describe, it, expect } from 'vitest';
import {
	PERIODS,
	sliceLast,
	computeChartGeometry,
	type PricePoint,
	timeTicks,
	tickLabel,
	tooltipTimeLabel,
	nearestIndex,
	seriesCurrency,
	seriesChangePct,
} from './series';

describe('PERIODS', () => {
	it('5 periyot, doğru sıra ve etiketler', () => {
		expect(PERIODS.map((p) => p.id)).toEqual(['15D', '1G', '1H', '1A', '1Y']);
		expect(PERIODS.map((p) => p.label)).toEqual(['15D', '1G', '1H', '1A', '1Y']);
	});
});

describe('sliceLast', () => {
	const pts: PricePoint[] = [
		{ t: 1000, price: 1 },
		{ t: 2000, price: 2 },
		{ t: 3000, price: 3 },
	];
	it('pencere içindeki son noktaları döner (son t referans)', () => {
		expect(sliceLast(pts, 1500)).toEqual([{ t: 2000, price: 2 }, { t: 3000, price: 3 }]);
	});
	it('pencere her şeyi kapsıyorsa hepsini döner', () => {
		expect(sliceLast(pts, 999999)).toEqual(pts);
	});
	it('boş dizi → boş', () => {
		expect(sliceLast([], 1000)).toEqual([]);
	});
});

describe('computeChartGeometry', () => {
	it('boş dizi → null', () => {
		expect(computeChartGeometry([], 100, 50)).toBeNull();
	});
	it('tek nokta → null (çizgi çizilemez)', () => {
		expect(computeChartGeometry([{ t: 1, price: 5 }], 100, 50)).toBeNull();
	});
	it('yükselen seri: rising=true, ilk x=0 son x=w, y ters (yüksek fiyat küçük y)', () => {
		const g = computeChartGeometry([{ t: 0, price: 10 }, { t: 1, price: 20 }], 100, 50)!;
		expect(g.rising).toBe(true);
		expect(g.first).toBe(10);
		expect(g.last).toBe(20);
		expect(g.min).toBe(10);
		expect(g.max).toBe(20);
		expect(g.changePct).toBeCloseTo(100, 5);
		expect(g.points[0]).toEqual({ x: 0, y: 50 });   // min fiyat → alt (y=h)
		expect(g.points[1]).toEqual({ x: 100, y: 0 });  // max fiyat → üst (y=0)
	});
	it('düşen seri: rising=false', () => {
		const g = computeChartGeometry([{ t: 0, price: 20 }, { t: 1, price: 10 }], 100, 50)!;
		expect(g.rising).toBe(false);
		expect(g.changePct).toBeCloseTo(-50, 5);
	});
	it('düz seri (min==max): y ortada (NaN değil)', () => {
		const g = computeChartGeometry([{ t: 0, price: 5 }, { t: 1, price: 5 }], 100, 50)!;
		expect(g.points.every((p) => Number.isFinite(p.y))).toBe(true);
		expect(g.changePct).toBe(0);
	});
});

describe('tickLabel / tooltipTimeLabel (TSİ = sabit UTC+3, ICU yok)', () => {
	// 2026-07-14 12:30 UTC → TSİ 15:30, Salı.
	const T = Date.UTC(2026, 6, 14, 12, 30);
	it('15D/1G: HH:MM', () => {
		expect(tickLabel(T, '15D')).toBe('15:30');
		expect(tickLabel(T, '1G')).toBe('15:30');
	});
	it('1H: kısa gün + saat', () => {
		expect(tickLabel(T, '1H')).toBe('Sal 15:30');
	});
	it('1A: gün + kısa ay', () => {
		expect(tickLabel(T, '1A')).toBe('14 Tem');
	});
	it('1Y: kısa ay + 2 haneli yıl', () => {
		expect(tickLabel(T, '1Y')).toBe('Tem 26');
	});
	it('tooltip 1Y: gün dahil; 1H tooltip dakika dahil', () => {
		expect(tooltipTimeLabel(T, '1Y')).toBe('14 Tem 26');
		expect(tooltipTimeLabel(T, '1H')).toBe('Sal 15:30');
		expect(tooltipTimeLabel(T, '1G')).toBe('15:30');
		expect(tooltipTimeLabel(T, '1A')).toBe('14 Tem');
	});
	it('gün sınırı: 22:00 UTC → TSİ ertesi gün 01:00', () => {
		const t = Date.UTC(2026, 6, 14, 22, 0); // Salı 22:00 UTC → Çarşamba 01:00 TSİ
		expect(tickLabel(t, '1H')).toBe('Çar 01:00');
		expect(tickLabel(t, '1A')).toBe('15 Tem');
	});
	it('epoch 0: 1 Oca 1970 Perşembe 03:00 TSİ', () => {
		expect(tickLabel(0, '1G')).toBe('03:00');
		expect(tickLabel(0, '1H')).toBe('Per 03:00');
		expect(tickLabel(0, '1Y')).toBe('Oca 70');
	});
});

describe('timeTicks', () => {
	const mk = (n: number): { t: number; price: number }[] =>
		Array.from({ length: n }, (_, i) => ({ t: Date.UTC(2026, 6, 14, 9, 0) + i * 60_000, price: 1 }));
	it('<2 nokta ya da maxTicks<2 → []', () => {
		expect(timeTicks([], '1G', 4)).toEqual([]);
		expect(timeTicks(mk(1), '1G', 4)).toEqual([]);
		expect(timeTicks(mk(10), '1G', 1)).toEqual([]);
	});
	it('ilk ve son nokta hep dahil, eşit aralıklı', () => {
		const ticks = timeTicks(mk(5), '1G', 3);
		expect(ticks.map((x) => x.index)).toEqual([0, 2, 4]);
	});
	it('maxTicks > n → her nokta bir tick', () => {
		expect(timeTicks(mk(2), '1G', 4).map((x) => x.index)).toEqual([0, 1]);
	});
	it('yuvarlama: n=4, maxTicks=3 → [0,2,3]', () => {
		expect(timeTicks(mk(4), '1G', 3).map((x) => x.index)).toEqual([0, 2, 3]);
	});
	it('etiketler tickLabel ile üretilir (TSİ)', () => {
		const ticks = timeTicks(mk(2), '1G', 2);
		expect(ticks[0].label).toBe('12:00'); // 09:00 UTC → 12:00 TSİ
	});
});

describe('nearestIndex', () => {
	it('uçlar ve orta', () => {
		expect(nearestIndex(5, 0)).toBe(0);
		expect(nearestIndex(5, 1)).toBe(4);
		expect(nearestIndex(5, 0.49)).toBe(2);
	});
	it('taşma clamp edilir, n<1 → -1, tek nokta → 0', () => {
		expect(nearestIndex(5, 1.7)).toBe(4);
		expect(nearestIndex(5, -0.3)).toBe(0);
		expect(nearestIndex(0, 0.5)).toBe(-1);
		expect(nearestIndex(1, 0.9)).toBe(0);
	});
});

describe('seriesCurrency', () => {
	it('crypto her zaman USD (assetId farketmez)', () => {
		expect(seriesCurrency('BTC', 'crypto')).toBe('USD');
		expect(seriesCurrency('DOGE', 'crypto')).toBe('USD');
	});
	it('yahoo + adi hisse/FX → TRY', () => {
		expect(seriesCurrency('THYAO', 'yahoo')).toBe('TRY');
		expect(seriesCurrency('EUR', 'yahoo')).toBe('TRY');
	});
	it('yahoo + XAUGRAM/XAGGRAM (COMEX GC=F/SI=F) → USD, ₺ değil', () => {
		expect(seriesCurrency('XAUGRAM', 'yahoo')).toBe('USD');
		expect(seriesCurrency('XAGGRAM', 'yahoo')).toBe('USD');
	});
	it("us (ABD hissesi) → USD (Yahoo ABD serileri USD bazlı)", () => {
		expect(seriesCurrency('VRT', 'us')).toBe('USD');
		expect(seriesCurrency('AAPL', 'us')).toBe('USD');
	});
});

describe('seriesChangePct', () => {
	it('ilk→son yüzde', () => {
		expect(seriesChangePct([{ t: 0, price: 100 }, { t: 1, price: 110 }])).toBeCloseTo(10, 5);
	});
	it('<2 nokta ya da ilk=0 → undefined', () => {
		expect(seriesChangePct([])).toBeUndefined();
		expect(seriesChangePct([{ t: 0, price: 5 }])).toBeUndefined();
		expect(seriesChangePct([{ t: 0, price: 0 }, { t: 1, price: 5 }])).toBeUndefined();
	});
});
