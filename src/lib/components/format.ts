import type { Money } from '../domain/money';
import { usd, tryM, formatMoney } from '../domain/money';

/**
 * Saf gösterim yardımcıları — runes yok, jsdom yok, node'da test edilebilir.
 * Bileşenler bu modülden import eder; hiçbir Svelte bağımlılığı yoktur.
 */

/** TRY sayısını biçimlendirir; undefined gelirse '—' döner. */
export function displayTry(n: number | undefined): string {
	if (n === undefined) return '—';
	return formatMoney(tryM(n));
}

/** USD Money'i biçimlendirir; null gelirse '—' döner. */
export function displayUsd(m: Money | null): string {
	if (m === null) return '—';
	return formatMoney(m);
}

/**
 * Net servetin yatırımda olan kısmı = net servet − kenardaki nakit.
 * (pozisyonlar + mevduatın GÜNCEL değeri toplamı; nakit + yatırım = net servet.)
 * netWorth null (fiyat eksik) → null ('—' gösterilir).
 */
export function investedUsd(netWorthUsd: Money | null, cashUsd: Money): Money | null {
	if (netWorthUsd === null) return null;
	return usd(netWorthUsd.amount - cashUsd.amount);
}

/**
 * Kâr/zarar renk sınıfı.
 * null ya da 0 → term.text (nötr); >0 → term.green; <0 → term.red.
 */
export function pnlClass(delta: number | null): string {
	if (delta === null || delta === 0) return 'text-term-text';
	return delta > 0 ? 'text-term-green' : 'text-term-red';
}

/**
 * Getiri oranını işaretli yüzde dizesine çevirir.
 * rate=1.05 → '+5.00%', rate=0.97 → '-3.00%', rate=1 → '+0.00%', null → '—'.
 */
export function signedPercent(rate: number | null): string {
	if (rate === null) return '—';
	const pct = (rate - 1) * 100;
	const sign = pct >= 0 ? '+' : '';
	return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Market durumu rozeti.
 * open: true → { text:'AÇIK', cls:'text-term-green' }
 * open: false → { text:'KAPALI', cls:'text-term-amber' }
 */
export function marketBadge(open: boolean): { text: string; cls: string } {
	return open
		? { text: 'AÇIK', cls: 'text-term-green' }
		: { text: 'KAPALI', cls: 'text-term-amber' };
}

/**
 * İşaretli USD gösterimi.
 * null → '—'; amount >= 0 → '+$x,xxx.xx'; <0 → '-$x,xxx.xx' (formatMoney zaten eksi gösterir).
 */
export function signedUsd(m: Money | null): string {
	if (m === null) return '—';
	if (m.amount >= 0) return '+' + formatMoney(m);
	return formatMoney(m);
}

/**
 * Günlük/24s % değişim rozeti.
 * undefined → null (rozet gösterilmez); +2.5 → {text:'+2.50%', green};
 * -1.2 → {text:'-1.20%', red}; 0 → {text:'+0.00%', nötr}.
 */
export function dailyChangeBadge(pct: number | undefined): { text: string; cls: string } | null {
	if (pct === undefined) return null;
	const sign = pct >= 0 ? '+' : '';
	return { text: `${sign}${pct.toFixed(2)}%`, cls: pnlClass(pct) };
}

/**
 * Mevcut TRY bakiyesiyle alınabilecek en çok adet (kesirli).
 * Fiyat yok / 0 / bakiye 0 → 0. 4 ondalığa AŞAĞI yuvarlanır → asla bakiyeyi aşmaz.
 */
export function maxUnitsAffordable(tryBalance: number, priceTry: number | undefined): number {
	if (priceTry === undefined || priceTry <= 0 || tryBalance <= 0) return 0;
	return Math.floor((tryBalance / priceTry) * 10000) / 10000;
}

/**
 * Verilen varlıkta tutulan TAM adet (satış-hepsi için).
 * Yuvarlama YOK — `sellAsset`'in "tutulandan fazla" kontrolüne birebir eşit geçer.
 * Seçim null / tutulmuyor / boş portföy → 0.
 */
export function heldUnits(
	positions: ReadonlyArray<{ assetId: string; units: number }>,
	assetId: string | null,
): number {
	if (assetId === null) return 0;
	return positions.find((p) => p.assetId === assetId)?.units ?? 0;
}

/**
 * Pozisyon kâr/zararı (para birimi bağımsız — sayısal).
 * value undefined → her ikisi undefined.
 * pnl = güncel değer − (adet × ort. maliyet); pnlPct yüzde (20 = +%20).
 * maliyet 0 ise pnlPct undefined (sıfıra bölme yok).
 */
export function positionPnl(
	units: number,
	avgCost: number,
	value: number | undefined,
): { pnl: number | undefined; pnlPct: number | undefined } {
	if (value === undefined) return { pnl: undefined, pnlPct: undefined };
	const cost = units * avgCost;
	const pnl = value - cost;
	const pnlPct = cost > 0 ? (pnl / cost) * 100 : undefined;
	return { pnl, pnlPct };
}

/**
 * "Şu an"-lık göreli zaman etiketi (durum bandı).
 * asOf<=0 → '—'; <5sn → 'az önce'; <60sn → 'N sn önce'; <60dk → 'N dk önce'; üstü → 'N sa önce'.
 */
export function relativeTime(asOf: number, now: number): string {
	if (asOf <= 0) return '—';
	const sec = Math.max(0, Math.floor((now - asOf) / 1000));
	if (sec < 5) return 'az önce';
	if (sec < 60) return `${sec} sn önce`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min} dk önce`;
	return `${Math.floor(min / 60)} sa önce`;
}

/** Vadeye kalan süre etiketi. <=0 → 'vade doldu'; gün/saat/dakika kademeli. */
export function countdownLabel(msRemaining: number): string {
	if (msRemaining <= 0) return 'vade doldu';
	const totalMin = Math.floor(msRemaining / 60_000);
	const days = Math.floor(totalMin / 1440);
	if (days >= 1) return `${days} gün kaldı`;
	const hours = Math.floor(totalMin / 60);
	if (hours >= 1) return `${hours} sa kaldı`;
	return `${totalMin} dk kaldı`;
}

const TR_MONTHS_SHORT: ReadonlyArray<string> = [
	'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

/** 'YYYY-MM-DD' → '13 Haz' (Türkçe kısa tarih; gün-gün döküm satırı). */
export function shortDate(dateKey: string): string {
	const [, m, d] = dateKey.split('-');
	const month = TR_MONTHS_SHORT[Number(m) - 1];
	if (month === undefined || Number.isNaN(Number(d))) return dateKey;
	return `${Number(d)} ${month}`;
}

/** Piyasa listesi grup/sekme sırası — sabit: kripto → bist → ABD borsası → emtia → döviz. */
const CATEGORY_ORDER: ReadonlyArray<string> = ['crypto', 'bist', 'us', 'commodity', 'fx'];

/** Kategori → UI etiketi. "EMTİA" jargon olduğu için ALTIN&GÜMÜŞ (hedef kitle: sıradan kriz-insanı).
 *  `usd` — kapanış kartı dağılım barında nakit segmenti (closingCard.ts). */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
	crypto: 'KRİPTO',
	bist: 'BIST',
	us: 'ABD BORSASI',
	commodity: 'ALTIN&GÜMÜŞ',
	fx: 'DÖVİZ',
	deposit: 'MEVDUAT',
	usd: 'DOLAR',
};

export interface CategoryGroup<T> {
	category: string;
	rows: T[];
}

/**
 * Satırları sabit kategori sırasıyla gruplar (grup içi giriş sırası korunur).
 * Bilinmeyen kategoriler sona, giriş sırasıyla. Boş grup üretilmez.
 */
/** Al/sat sonrası geçici bildirim metni — gerçekleşen işlemin özeti. */
export function tradeToastMessage(
	kind: 'buy' | 'sell',
	assetId: string,
	units: number,
	amountUsd: number,
): string {
	const verb = kind === 'buy' ? 'ALINDI' : 'SATILDI';
	return `✓ ${assetId} ${verb} — ${units.toFixed(4)} adet · ${displayUsd(usd(amountUsd))}`;
}

/**
 * Yazarken girilen ham metni (binlik virgülü + ondalık nokta) sayıya çevirir.
 * Eksi işareti yok sayılır (miktar alanları hep pozitif). Geçersiz/boş → 0.
 */
export function parseTypedAmount(raw: string): number {
	const cleaned = raw.replace(/,/g, '').replace(/-/g, '').trim();
	if (cleaned === '' || cleaned === '.') return 0;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Yazarken canlı binlik-virgül gösterimi. Tam kısmı gruplar, ondalık kısmı
 * (varsa) OLDUĞU GİBİ bırakır — "1.5" yazarken ara adım "1." kaybolmasın diye.
 */
export function formatTypedAmount(raw: string): string {
	const cleaned = raw.replace(/,/g, '').replace(/-/g, '');
	const [intPart, ...rest] = cleaned.split('.');
	const groupedInt = intPart === '' ? '' : Number(intPart).toLocaleString('en-US');
	const decPart = rest.length > 0 ? '.' + rest.join('') : '';
	return groupedInt + decPart;
}

/** `text`'te `caret`'ten önceki virgül-olmayan karakter sayısı (caret'i yeniden konumlamak için). */
export function countNonCommaBefore(text: string, caret: number): number {
	let count = 0;
	for (let i = 0; i < caret && i < text.length; i++) {
		if (text[i] !== ',') count++;
	}
	return count;
}

/** `text` içinde ilk `nonCommaCount` virgül-olmayan karakterden hemen sonraki index. */
export function caretAfterNonComma(text: string, nonCommaCount: number): number {
	if (nonCommaCount <= 0) return 0;
	let seen = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== ',') {
			seen++;
			if (seen === nonCommaCount) return i + 1;
		}
	}
	return text.length;
}

export function groupByCategory<T extends { category: string }>(
	rows: ReadonlyArray<T>,
): CategoryGroup<T>[] {
	const map = new Map<string, T[]>();
	for (const r of rows) {
		const list = map.get(r.category);
		if (list) list.push(r);
		else map.set(r.category, [r]);
	}
	const known = CATEGORY_ORDER.filter((c) => map.has(c));
	const unknown = [...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
	return [...known, ...unknown].map((category) => ({ category, rows: map.get(category)! }));
}
