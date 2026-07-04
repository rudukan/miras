import { describe, it, expect } from 'vitest';
import { displayTry, displayUsd, pnlClass, signedPercent, marketBadge, signedUsd, dailyChangeBadge, relativeTime, positionPnl, maxUnitsAffordable, heldUnits, groupByCategory, CATEGORY_LABELS, shortDate, countdownLabel, investedUsd, tradeToastMessage, parseTypedAmount, formatTypedAmount, countNonCommaBefore, caretAfterNonComma } from './format';
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
	it('value undefined → pnl undefined', () => {
		expect(positionPnl(1, 100, undefined)).toEqual({ pnl: undefined, pnlPct: undefined });
	});
	it('kâr: 1 adet, maliyet 100, değer 120 → +20, +%20', () => {
		expect(positionPnl(1, 100, 120)).toEqual({ pnl: 20, pnlPct: 20 });
	});
	it('zarar: 2 adet, maliyet 50, değer 80 → -20, -%20', () => {
		expect(positionPnl(2, 50, 80)).toEqual({ pnl: -20, pnlPct: -20 });
	});
	it('maliyet 0 → pnlPct undefined (sıfıra bölme yok)', () => {
		expect(positionPnl(5, 0, 100)).toEqual({ pnl: 100, pnlPct: undefined });
	});
});

// ── maxUnitsAffordable ──────────────────────────────────────────────────────────
describe('maxUnitsAffordable', () => {
	it('fiyat undefined → 0', () => {
		expect(maxUnitsAffordable(1000, undefined)).toBe(0);
	});
	it('fiyat 0 → 0 (sıfıra bölme yok)', () => {
		expect(maxUnitsAffordable(1000, 0)).toBe(0);
	});
	it('bakiye 0 → 0', () => {
		expect(maxUnitsAffordable(0, 100)).toBe(0);
	});
	it('tam bölünür: 1000 / 100 = 10', () => {
		expect(maxUnitsAffordable(1000, 100)).toBe(10);
	});
	it('4 ondalığa aşağı yuvarlar (asla bakiyeyi aşmaz)', () => {
		expect(maxUnitsAffordable(1000, 300)).toBe(3.3333);
		expect(3.3333 * 300).toBeLessThanOrEqual(1000);
	});
});

// ── heldUnits ───────────────────────────────────────────────────────────────────
describe('heldUnits', () => {
	const pos = [
		{ assetId: 'THYAO', units: 155279.5031 },
		{ assetId: 'BTC', units: 0.05 },
	];
	it('tutulan varlığın TAM adedini döner (yuvarlamasız)', () => {
		expect(heldUnits(pos, 'THYAO')).toBe(155279.5031);
	});
	it('kesirli adet aynen döner', () => {
		expect(heldUnits(pos, 'BTC')).toBe(0.05);
	});
	it('tutulmayan varlık → 0', () => {
		expect(heldUnits(pos, 'ASELS')).toBe(0);
	});
	it('null seçim → 0', () => {
		expect(heldUnits(pos, null)).toBe(0);
	});
	it('boş portföy → 0', () => {
		expect(heldUnits([], 'THYAO')).toBe(0);
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

// ── groupByCategory ───────────────────────────────────────────────────────────
describe('groupByCategory', () => {
	const row = (id: string, category: string) => ({ id, category });

	it('boş liste → boş dizi', () => {
		expect(groupByCategory([])).toEqual([]);
	});

	it('sabit kategori sırası: crypto → bist → us → commodity → fx (giriş sırasından bağımsız)', () => {
		const rows = [
			row('EUR', 'fx'), row('XAUGRAM', 'commodity'), row('AAPL', 'us'), row('THYAO', 'bist'), row('BTC', 'crypto'),
		];
		expect(groupByCategory(rows).map((g) => g.category)).toEqual(['crypto', 'bist', 'us', 'commodity', 'fx']);
	});

	it('grup içi giriş sırası korunur', () => {
		const rows = [row('BTC', 'crypto'), row('SOL', 'crypto'), row('ETH', 'crypto')];
		expect(groupByCategory(rows)[0].rows.map((r) => r.id)).toEqual(['BTC', 'SOL', 'ETH']);
	});

	it('boş kategori grubu üretilmez', () => {
		const rows = [row('BTC', 'crypto')];
		expect(groupByCategory(rows)).toHaveLength(1);
	});

	it('bilinmeyen kategori sona gider', () => {
		const rows = [row('X', 'weird'), row('BTC', 'crypto')];
		expect(groupByCategory(rows).map((g) => g.category)).toEqual(['crypto', 'weird']);
	});
});

// ── CATEGORY_LABELS ───────────────────────────────────────────────────────────
describe('CATEGORY_LABELS', () => {
	it('5 kategori Türkçe etiketli (EMTİA yerine ALTIN&GÜMÜŞ — jargon yok)', () => {
		expect(CATEGORY_LABELS.crypto).toBe('KRİPTO');
		expect(CATEGORY_LABELS.bist).toBe('BIST');
		expect(CATEGORY_LABELS.us).toBe('ABD BORSASI');
		expect(CATEGORY_LABELS.commodity).toBe('ALTIN&GÜMÜŞ');
		expect(CATEGORY_LABELS.fx).toBe('DÖVİZ');
	});
});

describe('shortDate', () => {
	it("'YYYY-MM-DD' → 'D Ay' (Türkçe kısa)", () => {
		expect(shortDate('2026-06-13')).toBe('13 Haz');
		expect(shortDate('2026-01-05')).toBe('5 Oca');
		expect(shortDate('2026-12-31')).toBe('31 Ara');
	});
	it('geçersiz girdi → olduğu gibi döner', () => {
		expect(shortDate('bozuk')).toBe('bozuk');
	});
});

describe('countdownLabel', () => {
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  it('gün kalınca "N gün kaldı"', () => {
    expect(countdownLabel(28 * DAY)).toBe('28 gün kaldı');
    expect(countdownLabel(DAY)).toBe('1 gün kaldı');
  });
  it('1 günden az → saat', () => {
    expect(countdownLabel(5 * HOUR)).toBe('5 sa kaldı');
  });
  it('1 saatten az → dakika', () => {
    expect(countdownLabel(12 * 60_000)).toBe('12 dk kaldı');
  });
  it('süre bitti → "vade doldu"', () => {
    expect(countdownLabel(0)).toBe('vade doldu');
    expect(countdownLabel(-1000)).toBe('vade doldu');
  });
});

// ── investedUsd ─────────────────────────────────────────────────────────────────
describe('investedUsd', () => {
	it('net servet − nakit = yatırımdaki güncel değer', () => {
		expect(investedUsd(usd(1_008_634), usd(732_995))).toEqual(usd(275_639));
	});
	it('netWorth null → null (fiyat eksik)', () => {
		expect(investedUsd(null, usd(500_000))).toBeNull();
	});
	it('hiç yatırım yok → $0 (nakit = net servet)', () => {
		expect(investedUsd(usd(1_000_000), usd(1_000_000))).toEqual(usd(0));
	});
});

// ── tradeToastMessage ─────────────────────────────────────────────────────────
describe('tradeToastMessage', () => {
	it('alım mesajı: varlık + adet + tutar', () => {
		expect(tradeToastMessage('buy', 'THYAO', 100, 750)).toBe(
			'✓ THYAO ALINDI — 100.0000 adet · $750.00',
		);
	});
	it('satım mesajı: varlık + adet + tutar', () => {
		expect(tradeToastMessage('sell', 'BTC', 0.5, 32000)).toBe(
			'✓ BTC SATILDI — 0.5000 adet · $32,000.00',
		);
	});
});

// ── parseTypedAmount ──────────────────────────────────────────────────────────
describe('parseTypedAmount', () => {
	it('binlik virgülünü temizleyip sayıya çevirir', () => {
		expect(parseTypedAmount('62,161,390')).toBe(62161390);
	});
	it('virgülsüz sayıyı da doğru çevirir', () => {
		expect(parseTypedAmount('1000')).toBe(1000);
	});
	it('ondalıklı sayıyı korur', () => {
		expect(parseTypedAmount('1,234.56')).toBe(1234.56);
	});
	it('boş string → 0', () => {
		expect(parseTypedAmount('')).toBe(0);
	});
	it('sadece nokta (yazım ortası) → 0', () => {
		expect(parseTypedAmount('.')).toBe(0);
	});
	it('eksi işareti yok sayılır (miktar hep pozitif)', () => {
		expect(parseTypedAmount('-500')).toBe(500);
	});
});

// ── formatTypedAmount ─────────────────────────────────────────────────────────
describe('formatTypedAmount', () => {
	it('4+ haneli tam sayıya binlik virgül ekler', () => {
		expect(formatTypedAmount('62161390')).toBe('62,161,390');
	});
	it('3 haneli sayıya virgül eklemez', () => {
		expect(formatTypedAmount('999')).toBe('999');
	});
	it('yazım ortasındaki ondalık nokta kaybolmaz ("1.5" yazarken "1." korunur)', () => {
		expect(formatTypedAmount('1.')).toBe('1.');
	});
	it('ondalıklı kısmı gruplamadan aynen bırakır', () => {
		expect(formatTypedAmount('1000.5')).toBe('1,000.5');
	});
	it('zaten virgüllü girdiyi tutarlı biçimde yeniden hesaplar', () => {
		expect(formatTypedAmount('1,000')).toBe('1,000');
	});
	it('boş string → boş string', () => {
		expect(formatTypedAmount('')).toBe('');
	});
	it('başlangıç sıfırlarını sadeleştirir', () => {
		expect(formatTypedAmount('007')).toBe('7');
	});
});

// ── countNonCommaBefore / caretAfterNonComma (yazarken imleç konumu) ───────────
describe('countNonCommaBefore', () => {
	it('virgülsüz metinde caret konumuyla aynı sayıyı döner', () => {
		expect(countNonCommaBefore('1000', 4)).toBe(4);
	});
	it('virgülleri saymaz', () => {
		expect(countNonCommaBefore('1,000', 5)).toBe(4);
	});
	it('caret ortadaysa yalnız öncesini sayar', () => {
		expect(countNonCommaBefore('15,000', 2)).toBe(2);
	});
});

describe('caretAfterNonComma', () => {
	it('hedef sayıya ulaşınca hemen sonrasını döner', () => {
		expect(caretAfterNonComma('1,000', 4)).toBe(5);
	});
	it('yeniden biçimlenmiş metinde imleci doğru karaktere yerleştirir', () => {
		expect(caretAfterNonComma('15,000', 2)).toBe(2);
	});
	it('0 → başa döner', () => {
		expect(caretAfterNonComma('1,000', 0)).toBe(0);
	});
	it('sayı metinden büyükse sona sabitler', () => {
		expect(caretAfterNonComma('1,000', 99)).toBe(5);
	});
});
