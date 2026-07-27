import { describe, it, expect } from 'vitest';
import { lttbIndices } from './downsample';

/** Düz seri + tek keskin tepe — LTTB'nin uç değeri koruduğunu göstermek için. */
function flatWithSpike(n: number, spikeAt: number, spikeValue: number): number[] {
	const v = Array.from({ length: n }, () => 10);
	v[spikeAt] = spikeValue;
	return v;
}

describe('lttbIndices', () => {
	it('eşik nokta sayısından büyük/eşitse hepsini döner (seyreltme yok)', () => {
		expect(lttbIndices([1, 2, 3, 4], 4)).toEqual([0, 1, 2, 3]);
		expect(lttbIndices([1, 2, 3, 4], 99)).toEqual([0, 1, 2, 3]);
	});

	it('eşik 3ün altındaysa hepsini döner (LTTB en az 3 kova ister — savunma)', () => {
		expect(lttbIndices([1, 2, 3, 4, 5], 2)).toEqual([0, 1, 2, 3, 4]);
		expect(lttbIndices([1, 2, 3, 4, 5], 0)).toEqual([0, 1, 2, 3, 4]);
	});

	it('boş / tek elemanlı seri', () => {
		expect(lttbIndices([], 10)).toEqual([]);
		expect(lttbIndices([7], 10)).toEqual([0]);
	});

	it('sonuç uzunluğu tam eşik kadar', () => {
		const v = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 100);
		expect(lttbIndices(v, 50)).toHaveLength(50);
		expect(lttbIndices(v, 137)).toHaveLength(137);
	});

	it('ilk ve son nokta her zaman korunur (uçlar kırpılmaz)', () => {
		const v = Array.from({ length: 500 }, (_, i) => Math.cos(i / 3) * 5);
		const out = lttbIndices(v, 40);
		expect(out[0]).toBe(0);
		expect(out[out.length - 1]).toBe(499);
	});

	it('indeksler artan sırada ve tekrarsız', () => {
		const v = Array.from({ length: 800 }, (_, i) => Math.sin(i / 11) + Math.sin(i / 2.3));
		const out = lttbIndices(v, 60);
		for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
	});

	it('keskin tepeyi korur — asıl amaç: seyreltme uç değeri yutmamalı', () => {
		const out = lttbIndices(flatWithSpike(400, 211, 999), 30);
		expect(out).toContain(211);
	});

	it('keskin dibi de korur', () => {
		const out = lttbIndices(flatWithSpike(400, 88, -999), 30);
		expect(out).toContain(88);
	});
});
