import { describe, it, expect } from 'vitest';
import { PERIODS, sliceLast, computeChartGeometry, type PricePoint } from './series';

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
