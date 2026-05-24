import { describe, it, expect } from 'vitest';
import {
	usd, tryM, add, subtract, multiply, divide,
	toTRY, toUSD, gte, lte, isZero, isNegative, formatMoney
} from './money';

describe('money creation', () => {
	it('creates USD', () => {
		const m = usd(1000.50);
		expect(m.amount).toBe(1000.5);
		expect(m.currency).toBe('USD');
	});

	it('creates TRY', () => {
		const m = tryM(29500.75);
		expect(m.amount).toBe(29500.75);
		expect(m.currency).toBe('TRY');
	});

	it('rounds to 2 decimals', () => {
		expect(usd(0.123456).amount).toBe(0.12);
	});
});

describe('arithmetic', () => {
	it('adds same currency', () => {
		expect(add(usd(100), usd(50.50)).amount).toBe(150.5);
	});

	it('throws on currency mismatch add', () => {
		expect(() => add(usd(100), tryM(100))).toThrow('Currency mismatch');
	});

	it('subtracts correctly', () => {
		expect(subtract(usd(1_000_000), usd(50_000)).amount).toBe(950_000);
	});

	it('multiply by commission rate', () => {
		expect(multiply(usd(1000), 0.001).amount).toBe(1);
	});

	it('divides correctly', () => {
		expect(divide(usd(100), 2).amount).toBe(50);
	});

	it('throws division by zero', () => {
		expect(() => divide(usd(100), 0)).toThrow('Division by zero');
	});
});

describe('currency conversion', () => {
	const RATE = 35.30; // 2024 yıl sonu

	it('USD → TRY at rate', () => {
		const result = toTRY(usd(1000), RATE);
		expect(result.amount).toBe(35_300);
		expect(result.currency).toBe('TRY');
	});

	it('USD → TRY with %0.1 commission', () => {
		const result = toTRY(usd(1000), RATE, 0.001);
		expect(result.currency).toBe('TRY');
		expect(result.amount).toBeLessThan(35_300);
		expect(result.amount).toBeCloseTo(35_264.7, 0);
	});

	it('TRY → USD at rate', () => {
		const result = toUSD(tryM(35_300), RATE);
		expect(result.currency).toBe('USD');
		expect(result.amount).toBeCloseTo(1000, 1);
	});

	it('same currency passthrough (TRY stays TRY)', () => {
		expect(toTRY(tryM(1000), RATE).currency).toBe('TRY');
		expect(toUSD(usd(1000), RATE).currency).toBe('USD');
	});
});

describe('comparison', () => {
	it('gte', () => {
		expect(gte(usd(1000), usd(500))).toBe(true);
		expect(gte(usd(500), usd(1000))).toBe(false);
		expect(gte(usd(1000), usd(1000))).toBe(true);
	});

	it('lte', () => {
		expect(lte(usd(500), usd(1000))).toBe(true);
	});

	it('isZero', () => {
		expect(isZero(usd(0))).toBe(true);
		expect(isZero(usd(0.01))).toBe(false);
	});

	it('isNegative', () => {
		expect(isNegative(usd(-100))).toBe(true);
		expect(isNegative(usd(0))).toBe(false);
	});
});

describe('formatting', () => {
	it('formats USD with $ sign', () => {
		const s = formatMoney(usd(1_000_000));
		expect(s).toContain('$');
		expect(s).toContain('1,000,000');
	});

	it('formats TRY with ₺ sign', () => {
		const s = formatMoney(tryM(29_500));
		expect(s).toContain('₺');
	});
});

describe('ekonomi kanonları', () => {
	it('yıl sonu enflasyon hedefi ~$1,037,172', () => {
		const initial = usd(1_000_000);
		const dailyRate = 0.0001;
		const days = 365;
		const target = initial.amount * Math.pow(1 + dailyRate, days);
		expect(target).toBeCloseTo(1_037_172, -1);
	});

	it('USD/TRY 2024 başlangıç → yıl sonu eğrisi', () => {
		const start = 29.90;
		const end = 35.30;
		expect(end).toBeGreaterThan(start);
		const devaluation = (end - start) / start;
		expect(devaluation).toBeCloseTo(0.181, 2); // ~%18.1 devalüasyon
	});
});
