/** Tek fiyat noktası — t: epoch ms, price: ham birim (TRY/USD; grafik şekli için birim önemsiz). */
export interface PricePoint {
	readonly t: number;
	readonly price: number;
}

export type PeriodId = '15D' | '1G' | '1H' | '1A' | '1Y';
export interface Period {
	readonly id: PeriodId;
	readonly label: string;
}

/** Grafik periyot düğmeleri — 15 dakika / gün / hafta / ay / yıl. */
export const PERIODS: ReadonlyArray<Period> = [
	{ id: '15D', label: '15D' },
	{ id: '1G', label: '1G' },
	{ id: '1H', label: '1H' },
	{ id: '1A', label: '1A' },
	{ id: '1Y', label: '1Y' },
];

/** Son noktanın t'sinden geriye `windowMs` içindeki noktalar (15D = 1G serisinin dilimi). */
export function sliceLast(points: ReadonlyArray<PricePoint>, windowMs: number): PricePoint[] {
	if (points.length === 0) return [];
	const cutoff = points[points.length - 1].t - windowMs;
	return points.filter((p) => p.t >= cutoff);
}

export interface ChartGeometry {
	readonly points: ReadonlyArray<{ x: number; y: number }>;
	readonly min: number;
	readonly max: number;
	readonly first: number;
	readonly last: number;
	readonly changePct: number;
	readonly rising: boolean;
}

/** Noktaları (w×h) çizim alanına ölçekler. <2 nokta → null. y ekseni ters (yüksek fiyat = küçük y). */
export function computeChartGeometry(
	points: ReadonlyArray<PricePoint>,
	w: number,
	h: number,
): ChartGeometry | null {
	if (points.length < 2) return null;
	let min = points[0].price;
	let max = points[0].price;
	for (const p of points) {
		if (p.price < min) min = p.price;
		if (p.price > max) max = p.price;
	}
	const span = max - min;
	const n = points.length;
	const xy = points.map((p, i) => ({
		x: (i / (n - 1)) * w,
		y: span === 0 ? h / 2 : h - ((p.price - min) / span) * h,
	}));
	const first = points[0].price;
	const last = points[n - 1].price;
	const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
	return { points: xy, min, max, first, last, changePct, rising: last >= first };
}
