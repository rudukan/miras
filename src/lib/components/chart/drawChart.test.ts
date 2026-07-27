import { describe, it, expect } from 'vitest';
import { withAlpha, renderChart } from './drawChart';
import { computeChartGeometry, type PricePoint } from '$lib/domain/series/series';

/** Canvas yok (jsdom değil, saf node) — çağrıları sayan minimal 2D bağlam taklidi. */
function stubCanvas() {
	const calls = { moveTo: 0, lineTo: 0, arc: 0 };
	const ctx = {
		setTransform: () => {},
		clearRect: () => {},
		beginPath: () => {},
		closePath: () => {},
		moveTo: () => void calls.moveTo++,
		lineTo: () => void calls.lineTo++,
		arc: () => void calls.arc++,
		setLineDash: () => {},
		fill: () => {},
		stroke: () => {},
		createLinearGradient: () => ({ addColorStop: () => {} }),
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 0,
	};
	const canvas = { width: 0, height: 0, getContext: () => ctx };
	return { canvas: canvas as unknown as HTMLCanvasElement, calls };
}

describe('withAlpha', () => {
	it('#rrggbb → rgba', () => {
		expect(withAlpha('#00ff66', 0.18)).toBe('rgba(0,255,102,0.18)');
		expect(withAlpha('#a3b8cc', 0.35)).toBe('rgba(163,184,204,0.35)');
	});
	it('boşluk toleransı + büyük harf', () => {
		expect(withAlpha(' #FF3366 ', 1)).toBe('rgba(255,51,102,1)');
	});
	it('tanınmayan biçim olduğu gibi döner (rgb(...), kısa hex vb.)', () => {
		expect(withAlpha('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)');
		expect(withAlpha('#0f6', 0.5)).toBe('#0f6');
	});
});

describe('renderChart', () => {
	const many = (n: number): PricePoint[] =>
		Array.from({ length: n }, (_, i) => ({ t: i * 60_000, price: 50 + Math.sin(i / 3) }));

	it('seyreltilmiş line ile çizer — 1000 noktalık seri tüm noktalarıyla stroke EDİLMEZ', () => {
		const g = computeChartGeometry(many(1000), 100, 50)!;
		const { canvas, calls } = stubCanvas();
		renderChart(canvas, g, { w: 100, h: 50, dpr: 1, lineColor: '#00ff66', refColor: '#a3b8cc' });
		// dolgu yolu: (len-1) + 2 köşe · referans çizgisi: 1 · fiyat çizgisi: (len-1)
		expect(calls.lineTo).toBe(2 * (g.line.length - 1) + 3);
		expect(g.line.length).toBeLessThan(100); // 1000 nokta 100px'e sığmaz — seyreltildi
	});

	it('g=null → hiçbir yol çizilmez', () => {
		const { canvas, calls } = stubCanvas();
		renderChart(canvas, null, { w: 100, h: 50, dpr: 1, lineColor: '#00ff66', refColor: '#a3b8cc' });
		expect(calls.lineTo).toBe(0);
		expect(calls.moveTo).toBe(0);
	});
});
