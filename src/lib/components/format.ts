import type { Money } from '../domain/money';
import { tryM, formatMoney } from '../domain/money';

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
