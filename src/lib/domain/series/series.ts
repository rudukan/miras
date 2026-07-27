import { lttbIndices } from './downsample';

/** Tek fiyat noktası — t: epoch ms, price: ham birim (TRY/USD; grafik şekli için birim önemsiz). */
export interface PricePoint {
	readonly t: number;
	readonly price: number;
}

export type PeriodId = '15D' | '1G' | '1H' | '1A' | '1Y';

/** Seri kaynak sınıfı — upstream + sembol eşleme kuralını belirler:
 *  'crypto' = Binance USDT · 'yahoo' = Yahoo (BIST .IS / özel semboller) · 'us' = Yahoo soneksiz (ABD, USD bazlı). */
export type SeriesSource = 'crypto' | 'yahoo' | 'us';
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
	/** TAM çözünürlüklü ekran koordinatları — her kaynak noktası için bir giriş.
	 *  Hover/crosshair ve zaman ekseni bunu ORİJİNAL indeksle adresler (PriceChart),
	 *  bu yüzden seyreltilemez. */
	readonly points: ReadonlyArray<{ x: number; y: number }>;
	/** Çizim için seyreltilmiş alt küme (LTTB) — canvas stroke'u bunu kullanır.
	 *  Seyreltme gerekmiyorsa `points` ile aynı. */
	readonly line: ReadonlyArray<{ x: number; y: number }>;
	/** Serinin GERÇEK uç değerleri — dikey pay bunları kaydırmaz (etiketler dürüst kalır). */
	readonly min: number;
	readonly max: number;
	readonly first: number;
	readonly last: number;
	readonly changePct: number;
	readonly rising: boolean;
}

/** Y ekseninde alt+üst dikey pay (span oranı). Dar aralıklı serilerde (ör. FX'in %0.4'lük
 *  günü) çizgi kenarlara yapışmasın, genlik biraz yumuşasın diye. Fiyatı DEĞİŞTİRMEZ —
 *  yalnızca ölçek sınırlarını genişletir. */
const Y_PAD_RATIO = 0.08;

/** Çizim noktası başına hedef piksel. Altına inince alt-piksel mürekkep ("gürültü") başlar:
 *  1G serisi FX'te ~1140 noktaya çıkıyor, popover canvas'ı 274px → 4 nokta/piksel. */
const PX_PER_LINE_POINT = 1.5;

/** Noktaları (w×h) çizim alanına ölçekler. <2 nokta → null. y ekseni ters (yüksek fiyat = küçük y).
 *  Çizgi için LTTB ile piksel bütçesine seyreltilmiş `line` de üretir (bkz. downsample.ts). */
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
	// Ölçek sınırları paylı; min/max alanları ham kalır.
	const pad = (max - min) * Y_PAD_RATIO;
	const lo = min - pad;
	const span = max + pad - lo;
	const n = points.length;
	const xy = points.map((p, i) => ({
		x: (i / (n - 1)) * w,
		y: span === 0 ? h / 2 : h - ((p.price - lo) / span) * h,
	}));
	const budget = Math.max(2, Math.ceil(w / PX_PER_LINE_POINT));
	const keep = lttbIndices(
		points.map((p) => p.price),
		budget,
	);
	const line = keep.length === n ? xy : keep.map((i) => xy[i]);
	const first = points[0].price;
	const last = points[n - 1].price;
	const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
	return { points: xy, line, min, max, first, last, changePct, rising: last >= first };
}

/** Grafik zaman-ekseni etiketi — index çizgiyle aynı ölçekte (x eşit aralıklı). */
export interface TimeTick {
	readonly index: number;
	readonly label: string;
}

// TSİ = sabit UTC+3 (Türkiye 2016'dan beri DST uygulamıyor) — Intl/ICU bağımlılığı yok,
// CI (UTC) ve lokal (+03) bit-bit aynı sonucu üretir (format.ts'teki TR_MONTHS_SHORT emsali).
const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const;
const TR_DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const; // getUTCDay(): 0=Pazar
const TSI_OFFSET_MS = 3 * 3_600_000;

function tsi(t: number): Date {
	return new Date(t + TSI_OFFSET_MS);
}
function hhmm(d: Date): string {
	return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Eksen etiketi (kısa). 15D/1G: '15:30' · 1H: 'Sal 15:30' · 1A: '14 Tem' · 1Y: 'Tem 26'. */
export function tickLabel(t: number, period: PeriodId): string {
	const d = tsi(t);
	switch (period) {
		case '15D':
		case '1G':
			return hhmm(d);
		case '1H':
			return `${TR_DAYS_SHORT[d.getUTCDay()]} ${hhmm(d)}`;
		case '1A':
			return `${d.getUTCDate()} ${TR_MONTHS_SHORT[d.getUTCMonth()]}`;
		case '1Y':
			return `${TR_MONTHS_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
	}
}

/** Tooltip etiketi (eksene göre bir kademe zengin: 1Y'de gün dahil). */
export function tooltipTimeLabel(t: number, period: PeriodId): string {
	const d = tsi(t);
	if (period === '1Y') {
		return `${d.getUTCDate()} ${TR_MONTHS_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
	}
	return tickLabel(t, period);
}

/** Eşit aralıklı ~maxTicks eksen etiketi (ilk ve son nokta dahil). <2 nokta ya da maxTicks<2 → []. */
export function timeTicks(
	points: ReadonlyArray<PricePoint>,
	period: PeriodId,
	maxTicks: number,
): TimeTick[] {
	const n = points.length;
	if (n < 2 || maxTicks < 2) return [];
	const count = Math.min(maxTicks, n);
	const out: TimeTick[] = [];
	let prev = -1;
	for (let k = 0; k < count; k++) {
		const index = Math.round((k * (n - 1)) / (count - 1));
		if (index === prev) continue; // savunma: yuvarlama çakışması
		prev = index;
		out.push({ index, label: tickLabel(points[index].t, period) });
	}
	return out;
}

/** Crosshair: 0..1 x oranını en yakın nokta indeksine çevirir (x eşit aralıklı). n<1 → -1. */
export function nearestIndex(n: number, xRatio: number): number {
	if (n < 1) return -1;
	const clamped = Math.min(1, Math.max(0, xRatio));
	return Math.round(clamped * (n - 1));
}

// Yahoo kaynağındaki iki komodite (GC=F/SI=F, USD/ons) — TRY değil. Bu liste
// src/lib/api/seriesSource.ts'teki YAHOO_SPECIAL'ın bir alt kümesini yansıtır;
// domain katmanı api/'den import edemediği için kasıtlı olarak burada tekrarlanır
// (TR_MONTHS_SHORT/format.ts emsali). EUR (EURTRY=X) burada YOK — o gerçekten TRY.
const YAHOO_USD_ASSETS = new Set(['XAUGRAM', 'XAGGRAM']);

/** Serinin HAM para birimi: Binance klines USD(T) ve ABD hisseleri (Yahoo soneksiz) USD bazlı;
 *  Yahoo çoğunlukla TRY bazlı, ama XAUGRAM/XAGGRAM (COMEX GC=F/SI=F) USD/ons — assetId ile ayırt edilir.
 *  Tarihsel seri bugünkü kurla çevrilmez (yanlış tarih üretir) — etiketler bu birimle. */
export function seriesCurrency(assetId: string, source: SeriesSource): 'USD' | 'TRY' {
	if (source === 'crypto' || source === 'us') return 'USD';
	return YAHOO_USD_ASSETS.has(assetId) ? 'USD' : 'TRY';
}

/** Serinin ilk→son değişim yüzdesi. <2 nokta ya da ilk fiyat 0 → undefined. */
export function seriesChangePct(points: ReadonlyArray<PricePoint>): number | undefined {
	if (points.length < 2) return undefined;
	const first = points[0].price;
	if (first === 0) return undefined;
	return ((points[points.length - 1].price - first) / first) * 100;
}
