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
