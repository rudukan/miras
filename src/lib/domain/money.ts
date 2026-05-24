export type Currency = 'USD' | 'TRY';

export interface Money {
	readonly amount: number;
	readonly currency: Currency;
}

export function usd(amount: number): Money {
	return { amount: round2(amount), currency: 'USD' };
}

export function tryM(amount: number): Money {
	return { amount: round2(amount), currency: 'TRY' };
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

function assertSameCurrency(a: Money, b: Money, op: string): void {
	if (a.currency !== b.currency) {
		throw new Error(`Currency mismatch: ${a.currency} ${op} ${b.currency}`);
	}
}

export function add(a: Money, b: Money): Money {
	assertSameCurrency(a, b, '+');
	return { amount: round2(a.amount + b.amount), currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
	assertSameCurrency(a, b, '-');
	return { amount: round2(a.amount - b.amount), currency: a.currency };
}

export function multiply(m: Money, factor: number): Money {
	return { amount: round2(m.amount * factor), currency: m.currency };
}

export function divide(m: Money, divisor: number): Money {
	if (divisor === 0) throw new Error('Division by zero');
	return { amount: round2(m.amount / divisor), currency: m.currency };
}

/** USD → TRY. commission örn. 0.001 = %0.1 */
export function toTRY(m: Money, rate: number, commission = 0): Money {
	if (m.currency === 'TRY') return m;
	const effectiveRate = rate * (1 - commission);
	return { amount: round2(m.amount * effectiveRate), currency: 'TRY' };
}

/** TRY → USD. commission örn. 0.001 = %0.1 */
export function toUSD(m: Money, rate: number, commission = 0): Money {
	if (m.currency === 'USD') return m;
	const effectiveRate = rate * (1 - commission);
	return { amount: round2(m.amount / effectiveRate), currency: 'USD' };
}

export function gte(a: Money, b: Money): boolean {
	assertSameCurrency(a, b, '>=');
	return a.amount >= b.amount;
}

export function lte(a: Money, b: Money): boolean {
	assertSameCurrency(a, b, '<=');
	return a.amount <= b.amount;
}

export function isZero(m: Money): boolean {
	return m.amount === 0;
}

export function isNegative(m: Money): boolean {
	return m.amount < 0;
}

export function toNumber(m: Money): number {
	return m.amount;
}

export function formatMoney(m: Money): string {
	if (m.currency === 'USD') {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(m.amount);
	}
	return '₺' + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m.amount);
}
