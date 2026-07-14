import type { ChartGeometry } from '$lib/domain/series/series';

export interface DrawOptions {
	/** CSS piksel boyutları — canvas attr'ları içeride dpr ile çarpılır. */
	readonly w: number;
	readonly h: number;
	readonly dpr: number;
	/** Çizgi + dolgu + son-nokta rengi (yükseliş/düşüşe göre çağıran seçer). */
	readonly lineColor: string;
	/** Açılış fiyatı referans kesikli çizgisi (soluk). */
	readonly refColor: string;
}

/** '#rrggbb' → 'rgba(r,g,b,a)'. Tanınmayan biçim olduğu gibi döner (alfasız). */
export function withAlpha(hex: string, alpha: number): string {
	const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return hex;
	const v = parseInt(m[1], 16);
	const r = (v >> 16) & 255;
	const g = (v >> 8) & 255;
	const b = v & 255;
	return `rgba(${r},${g},${b},${alpha})`;
}

/** Canvas'a statik grafik resmini çizer: DPR ölçek + degrade dolgu + referans çizgisi +
 *  fiyat çizgisi + son-nokta dot'u. Etkileşim (crosshair/tooltip) HTML katmanında — burada YOK.
 *  g=null → yalnız temizler ("veri yok" bindirmesini bileşen gösterir). */
export function renderChart(canvas: HTMLCanvasElement, g: ChartGeometry | null, o: DrawOptions): void {
	canvas.width = Math.round(o.w * o.dpr);
	canvas.height = Math.round(o.h * o.dpr);
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
	ctx.clearRect(0, 0, o.w, o.h);
	if (!g || g.points.length === 0) return;

	const first = g.points[0];
	const last = g.points[g.points.length - 1];

	// 1) Çizgi altı degrade dolgu (%18 → 0 alfa).
	const grad = ctx.createLinearGradient(0, 0, 0, o.h);
	grad.addColorStop(0, withAlpha(o.lineColor, 0.18));
	grad.addColorStop(1, withAlpha(o.lineColor, 0));
	ctx.beginPath();
	g.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
	ctx.lineTo(last.x, o.h);
	ctx.lineTo(first.x, o.h);
	ctx.closePath();
	ctx.fillStyle = grad;
	ctx.fill();

	// 2) Açılış fiyatında kesikli referans çizgisi.
	ctx.beginPath();
	ctx.setLineDash([3, 3]);
	ctx.strokeStyle = o.refColor;
	ctx.lineWidth = 1;
	ctx.moveTo(0, first.y);
	ctx.lineTo(o.w, first.y);
	ctx.stroke();
	ctx.setLineDash([]);

	// 3) Fiyat çizgisi.
	ctx.beginPath();
	g.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
	ctx.strokeStyle = o.lineColor;
	ctx.lineWidth = 1.5;
	ctx.stroke();

	// 4) Son noktada dot.
	ctx.beginPath();
	ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
	ctx.fillStyle = o.lineColor;
	ctx.fill();
}
