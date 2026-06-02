import { describe, it, expect } from 'vitest';
import { displayTry, displayUsd, pnlClass, signedPercent, marketBadge, signedUsd, dailyChangeBadge, relativeTime, positionPnl, signedTry } from './format';
import { usd, tryM } from '../domain/money';

// ── displayTry ────────────────────────────────────────────────────────────────
describe('displayTry', () => {
	it('undefined → —', () => {
		expect(displayTry(undefined)).toBe('—');
	});
	it('0 sayısını biçimlendirir', () => {
		expect(displayTry(0)).toBe('₺0,00');
	});
	it('pozitif sayıyı TRY olarak biçimlendirir', () => {
		const result = displayTry(1000);
		expect(result).toContain('₺');
		expect(result).toContain('1.000');
	});
});

// ── displayUsd ────────────────────────────────────────────────────────────────
describe('displayUsd', () => {
	it('null → —', () => {
		expect(displayUsd(null)).toBe('—');
	});
	it('pozitif USD Money biçimlenir', () => {
		const result = displayUsd(usd(1_000_000));
		expect(result).toContain('$');
		expect(result).toContain('1,000,000');
	});
	it('negatif USD Money biçimlenir', () => {
		const result = displayUsd(usd(-500));
		expect(result).toContain('-');
		expect(result).toContain('500');
	});
});

// ── pnlClass ──────────────────────────────────────────────────────────────────
describe('pnlClass', () => {
	it('null → text-term-text', () => {
		expect(pnlClass(null)).toBe('text-term-text');
	});
	it('0 → text-term-text (nötr)', () => {
		expect(pnlClass(0)).toBe('text-term-text');
	});
	it('pozitif → text-term-green', () => {
		expect(pnlClass(100)).toBe('text-term-green');
	});
	it('negatif → text-term-red', () => {
		expect(pnlClass(-1)).toBe('text-term-red');
	});
	it('çok küçük pozitif → text-term-green', () => {
		expect(pnlClass(0.0001)).toBe('text-term-green');
	});
});

// ── signedPercent ─────────────────────────────────────────────────────────────
describe('signedPercent', () => {
	it('null → —', () => {
		expect(signedPercent(null)).toBe('—');
	});
	it('başabaş (rate=1) → +0.00%', () => {
		expect(signedPercent(1)).toBe('+0.00%');
	});
	it('kâr (rate=1.05) → +5.00%', () => {
		expect(signedPercent(1.05)).toBe('+5.00%');
	});
	it('zarar (rate=0.97) → -3.00%', () => {
		expect(signedPercent(0.97)).toBe('-3.00%');
	});
	it('büyük kâr (rate=2.5) → +150.00%', () => {
		expect(signedPercent(2.5)).toBe('+150.00%');
	});
});

// ── marketBadge ───────────────────────────────────────────────────────────────
describe('marketBadge', () => {
	it('open=true → AÇIK + term-green', () => {
		const b = marketBadge(true);
		expect(b.text).toBe('AÇIK');
		expect(b.cls).toBe('text-term-green');
	});
	it('open=false → KAPALI + term-amber', () => {
		const b = marketBadge(false);
		expect(b.text).toBe('KAPALI');
		expect(b.cls).toBe('text-term-amber');
	});
});

// ── signedUsd ─────────────────────────────────────────────────────────────────
describe('signedUsd', () => {
	it('null → —', () => {
		expect(signedUsd(null)).toBe('—');
	});
	it('pozitif tutar → + öneki', () => {
		const result = signedUsd(usd(5000));
		expect(result.startsWith('+')).toBe(true);
		expect(result).toContain('5,000');
	});
	it('sıfır → + öneki', () => {
		const result = signedUsd(usd(0));
		expect(result.startsWith('+')).toBe(true);
	});
	it('negatif tutar → eksi sembolü, + öneki yok', () => {
		const result = signedUsd(usd(-1000));
		expect(result.startsWith('+')).toBe(false);
		expect(result).toContain('-');
		expect(result).toContain('1,000');
	});
	it('TRY Money da null olmadığı sürece biçimlenir', () => {
		const result = signedUsd(tryM(500));
		expect(result.startsWith('+')).toBe(true);
		expect(result).toContain('500');
	});
});

// ── dailyChangeBadge ────────────────────────────────────────────────────────────
describe('dailyChangeBadge', () => {
	it('undefined → null (rozet yok)', () => {
		expect(dailyChangeBadge(undefined)).toBeNull();
	});
	it('pozitif → +%, term-green', () => {
		expect(dailyChangeBadge(2.5)).toEqual({ text: '+2.50%', cls: 'text-term-green' });
	});
	it('negatif → eksi, term-red', () => {
		expect(dailyChangeBadge(-1.2)).toEqual({ text: '-1.20%', cls: 'text-term-red' });
	});
	it('sıfır → +0.00%, nötr', () => {
		expect(dailyChangeBadge(0)).toEqual({ text: '+0.00%', cls: 'text-term-text' });
	});
});

// ── positionPnl ─────────────────────────────────────────────────────────────────
describe('positionPnl', () => {
	it('valueTry undefined → pnl undefined', () => {
		expect(positionPnl(1, 100, undefined)).toEqual({ pnlTry: undefined, pnlPct: undefined });
	});
	it('kâr: 1 adet, maliyet 100, değer 120 → +20 TRY, +%20', () => {
		expect(positionPnl(1, 100, 120)).toEqual({ pnlTry: 20, pnlPct: 20 });
	});
	it('zarar: 2 adet, maliyet 50, değer 80 → -20 TRY, -%20', () => {
		expect(positionPnl(2, 50, 80)).toEqual({ pnlTry: -20, pnlPct: -20 });
	});
	it('maliyet 0 → pnlPct undefined (sıfıra bölme yok)', () => {
		expect(positionPnl(5, 0, 100)).toEqual({ pnlTry: 100, pnlPct: undefined });
	});
});

// ── signedTry ───────────────────────────────────────────────────────────────────
describe('signedTry', () => {
	it('undefined → —', () => {
		expect(signedTry(undefined)).toBe('—');
	});
	it('pozitif → + öneki + ₺', () => {
		const r = signedTry(1000);
		expect(r.startsWith('+')).toBe(true);
		expect(r).toContain('₺');
		expect(r).toContain('1.000');
	});
	it('negatif → eksi, + öneki yok', () => {
		const r = signedTry(-500);
		expect(r.startsWith('+')).toBe(false);
		expect(r).toContain('500');
	});
	it('sıfır → + öneki', () => {
		expect(signedTry(0).startsWith('+')).toBe(true);
	});
});

// ── relativeTime ────────────────────────────────────────────────────────────────
describe('relativeTime', () => {
	it('asOf=0 → —', () => {
		expect(relativeTime(0, 10_000)).toBe('—');
	});
	it('<5sn → az önce', () => {
		expect(relativeTime(10_000, 12_000)).toBe('az önce');
	});
	it('saniye aralığı → N sn önce', () => {
		expect(relativeTime(10_000, 40_000)).toBe('30 sn önce');
	});
	it('dakika aralığı → N dk önce', () => {
		expect(relativeTime(1, 120_001)).toBe('2 dk önce');
	});
	it('saat aralığı → N sa önce', () => {
		expect(relativeTime(1, 7_200_001)).toBe('2 sa önce');
	});
});
