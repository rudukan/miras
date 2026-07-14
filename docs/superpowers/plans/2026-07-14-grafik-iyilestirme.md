# Grafik İyileştirme + BAĞLAM Kaldırma — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BAĞLAM satırını tamamen kaldır; pop-up fiyat grafiğini keskin/bilgili/etkileşimli hale getir; ⤢ BÜYÜT ile tam boy grafik+işlem overlay'i ekle.

**Architecture:** Mevcut katmanlı desen büyür: saf domain (`series.ts` — geometri + YENİ tick/hit-test/birim fonksiyonları) → saf canvas çizim modülü (`drawChart.ts`, DPR ölçekli) → ince Svelte bileşenleri (`PriceChart` yeniden, `PeriodTabs`/`PositionSummary`/`ChartOverlay` yeni). Etkileşim (crosshair/tooltip/etiketler) HTML bindirme katmanında — canvas hover'da yeniden çizilmez. Veri zinciri değişmez (`/api/series` aynen).

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TS strict + Tailwind (`term.*` token'ları) + Vitest (node env) + Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-grafik-iyilestirme-design.md`

## Global Constraints

- Para tipi: `number` değil `Money` (`src/lib/domain/money.ts`) — bu işte yalnız gösterim var, `formatMoney/usd/tryM` üzerinden.
- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`); `setInterval` + DOM manipülasyonu YASAK.
- Identifier'lar İngilizce, UI metinleri Türkçe. Component max ~200 satır.
- Renkler `term.*` token'larından; canvas'ta mevcut `cssVar` deseni (fallback'ler `tailwind.config.ts` değerleriyle birebir: green `#00ff66`, red `#ff3366`, text `#a3b8cc`).
- Domain modülleri yalnız `money.ts` + kendi type'larına bağımlı; API çağrıları yalnız `src/lib/api/`.
- Zaman formatlaması: **sabit UTC+3 (TSİ) aritmetiği + elle Türkçe kısaltma dizileri** — `Intl`/ICU KULLANMA (CI=UTC determinizmi; `format.ts`'teki `TR_MONTHS_SHORT` emsali).
- Her task sonunda commit; commit mesajı Türkçe, repo stilinde (`feat(...)`/`refactor(...)`/`test(...)`).
- Testte sabit sayı iddiası yazma (toplam test sayısı gibi) — dosya bazında koş.

---

### Task 1: BAĞLAM satırını kaldır

**Files:**
- Delete: `src/lib/components/ContextCard.svelte`
- Delete: `src/lib/data/contextCard.ts`
- Delete: `src/lib/data/contextCard.test.ts`
- Modify: `src/routes/+page.svelte` (import ~satır 34, kullanım ~satır 706)

**Interfaces:**
- Consumes: —
- Produces: — (salt silme; başka task buna bağımlı değil)

- [ ] **Step 1: `+page.svelte`'den kullanımı ve import'u sök**

`src/routes/+page.svelte` içinde şu iki satırı SİL (Edit ile, satır numaraları kayabilir — içerikle eşle):

```svelte
	import ContextCard from '$lib/components/ContextCard.svelte';
```

ve header içindeki:

```svelte
				<ContextCard />
```

- [ ] **Step 2: Üç dosyayı sil**

```bash
git rm "src/lib/components/ContextCard.svelte" "src/lib/data/contextCard.ts" "src/lib/data/contextCard.test.ts"
```

- [ ] **Step 3: Doğrula**

Run: `npm run test` → PASS (contextCard testleri artık listede yok, kalan her şey yeşil).
Run: `npm run check` → 0 error.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(ui): BAĞLAM bağlam satırını kaldır (spec 2026-07-14 §1)"
```

---

### Task 2: Domain — zaman etiketleri, crosshair indeksi, seri birimi (TDD)

**Files:**
- Modify: `src/lib/domain/series/series.ts` (dosya sonuna ekle)
- Test: `src/lib/domain/series/series.test.ts` (dosya sonuna ekle)

**Interfaces:**
- Consumes: mevcut `PricePoint`, `PeriodId` (aynı dosyada).
- Produces (sonraki task'lar bunları import eder):
  - `interface TimeTick { readonly index: number; readonly label: string }`
  - `timeTicks(points: ReadonlyArray<PricePoint>, period: PeriodId, maxTicks: number): TimeTick[]`
  - `tickLabel(t: number, period: PeriodId): string`
  - `tooltipTimeLabel(t: number, period: PeriodId): string`
  - `nearestIndex(n: number, xRatio: number): number`
  - `seriesCurrency(source: 'crypto' | 'yahoo'): 'USD' | 'TRY'`
  - `seriesChangePct(points: ReadonlyArray<PricePoint>): number | undefined`

- [ ] **Step 1: Failing testleri yaz**

`src/lib/domain/series/series.test.ts` sonuna ekle:

```ts
import {
	timeTicks,
	tickLabel,
	tooltipTimeLabel,
	nearestIndex,
	seriesCurrency,
	seriesChangePct,
} from './series';

describe('tickLabel / tooltipTimeLabel (TSİ = sabit UTC+3, ICU yok)', () => {
	// 2026-07-14 12:30 UTC → TSİ 15:30, Salı.
	const T = Date.UTC(2026, 6, 14, 12, 30);
	it('15D/1G: HH:MM', () => {
		expect(tickLabel(T, '15D')).toBe('15:30');
		expect(tickLabel(T, '1G')).toBe('15:30');
	});
	it('1H: kısa gün + saat', () => {
		expect(tickLabel(T, '1H')).toBe('Sal 15:30');
	});
	it('1A: gün + kısa ay', () => {
		expect(tickLabel(T, '1A')).toBe('14 Tem');
	});
	it('1Y: kısa ay + 2 haneli yıl', () => {
		expect(tickLabel(T, '1Y')).toBe('Tem 26');
	});
	it('tooltip 1Y: gün dahil; 1H tooltip dakika dahil', () => {
		expect(tooltipTimeLabel(T, '1Y')).toBe('14 Tem 26');
		expect(tooltipTimeLabel(T, '1H')).toBe('Sal 15:30');
		expect(tooltipTimeLabel(T, '1G')).toBe('15:30');
		expect(tooltipTimeLabel(T, '1A')).toBe('14 Tem');
	});
	it('gün sınırı: 22:00 UTC → TSİ ertesi gün 01:00', () => {
		const t = Date.UTC(2026, 6, 14, 22, 0); // Salı 22:00 UTC → Çarşamba 01:00 TSİ
		expect(tickLabel(t, '1H')).toBe('Çar 01:00');
		expect(tickLabel(t, '1A')).toBe('15 Tem');
	});
	it('epoch 0: 1 Oca 1970 Perşembe 03:00 TSİ', () => {
		expect(tickLabel(0, '1G')).toBe('03:00');
		expect(tickLabel(0, '1H')).toBe('Per 03:00');
		expect(tickLabel(0, '1Y')).toBe('Oca 70');
	});
});

describe('timeTicks', () => {
	const mk = (n: number): { t: number; price: number }[] =>
		Array.from({ length: n }, (_, i) => ({ t: Date.UTC(2026, 6, 14, 9, 0) + i * 60_000, price: 1 }));
	it('<2 nokta ya da maxTicks<2 → []', () => {
		expect(timeTicks([], '1G', 4)).toEqual([]);
		expect(timeTicks(mk(1), '1G', 4)).toEqual([]);
		expect(timeTicks(mk(10), '1G', 1)).toEqual([]);
	});
	it('ilk ve son nokta hep dahil, eşit aralıklı', () => {
		const ticks = timeTicks(mk(5), '1G', 3);
		expect(ticks.map((x) => x.index)).toEqual([0, 2, 4]);
	});
	it('maxTicks > n → her nokta bir tick', () => {
		expect(timeTicks(mk(2), '1G', 4).map((x) => x.index)).toEqual([0, 1]);
	});
	it('yuvarlama: n=4, maxTicks=3 → [0,2,3]', () => {
		expect(timeTicks(mk(4), '1G', 3).map((x) => x.index)).toEqual([0, 2, 3]);
	});
	it('etiketler tickLabel ile üretilir (TSİ)', () => {
		const ticks = timeTicks(mk(2), '1G', 2);
		expect(ticks[0].label).toBe('12:00'); // 09:00 UTC → 12:00 TSİ
	});
});

describe('nearestIndex', () => {
	it('uçlar ve orta', () => {
		expect(nearestIndex(5, 0)).toBe(0);
		expect(nearestIndex(5, 1)).toBe(4);
		expect(nearestIndex(5, 0.49)).toBe(2);
	});
	it('taşma clamp edilir, n<1 → -1, tek nokta → 0', () => {
		expect(nearestIndex(5, 1.7)).toBe(4);
		expect(nearestIndex(5, -0.3)).toBe(0);
		expect(nearestIndex(0, 0.5)).toBe(-1);
		expect(nearestIndex(1, 0.9)).toBe(0);
	});
});

describe('seriesCurrency', () => {
	it('crypto → USD (Binance USDT), yahoo → TRY', () => {
		expect(seriesCurrency('crypto')).toBe('USD');
		expect(seriesCurrency('yahoo')).toBe('TRY');
	});
});

describe('seriesChangePct', () => {
	it('ilk→son yüzde', () => {
		expect(seriesChangePct([{ t: 0, price: 100 }, { t: 1, price: 110 }])).toBeCloseTo(10, 5);
	});
	it('<2 nokta ya da ilk=0 → undefined', () => {
		expect(seriesChangePct([])).toBeUndefined();
		expect(seriesChangePct([{ t: 0, price: 5 }])).toBeUndefined();
		expect(seriesChangePct([{ t: 0, price: 0 }, { t: 1, price: 5 }])).toBeUndefined();
	});
});
```

- [ ] **Step 2: FAIL doğrula**

Run: `npx vitest run src/lib/domain/series/series.test.ts`
Expected: FAIL — `timeTicks` vb. export edilmiyor (SyntaxError/does not provide an export).

- [ ] **Step 3: Implementasyon**

`src/lib/domain/series/series.ts` sonuna ekle:

```ts
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

/** Serinin HAM para birimi: Binance klines USD(T) bazlı, Yahoo TRY bazlı.
 *  Tarihsel seri bugünkü kurla çevrilmez (yanlış tarih üretir) — etiketler bu birimle. */
export function seriesCurrency(source: 'crypto' | 'yahoo'): 'USD' | 'TRY' {
	return source === 'crypto' ? 'USD' : 'TRY';
}

/** Serinin ilk→son değişim yüzdesi. <2 nokta ya da ilk fiyat 0 → undefined. */
export function seriesChangePct(points: ReadonlyArray<PricePoint>): number | undefined {
	if (points.length < 2) return undefined;
	const first = points[0].price;
	if (first === 0) return undefined;
	return ((points[points.length - 1].price - first) / first) * 100;
}
```

- [ ] **Step 4: PASS doğrula**

Run: `npx vitest run src/lib/domain/series/series.test.ts`
Expected: PASS (tümü yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/series/series.ts src/lib/domain/series/series.test.ts
git commit -m "feat(domain): grafik zaman ekseni + crosshair + seri birimi yardımcıları (TDD)"
```

---

### Task 3: format.ts — birim-dürüst grafik fiyat etiketi (TDD)

**Files:**
- Modify: `src/lib/components/format.ts`
- Test: `src/lib/components/format.test.ts`

**Interfaces:**
- Consumes: `formatMoney`, `usd`, `tryM` (`format.ts` zaten import ediyor).
- Produces: `seriesPriceLabel(price: number, currency: 'USD' | 'TRY'): string` — Task 5 (PriceChart) kullanır.

- [ ] **Step 1: Failing test yaz**

`src/lib/components/format.test.ts` sonuna ekle:

```ts
describe('seriesPriceLabel', () => {
	it('USD → $ formatı (en-US)', () => {
		expect(seriesPriceLabel(62740.36, 'USD')).toBe('$62,740.36');
	});
	it('TRY → ₺ formatı (tr-TR binlik nokta, ondalık virgül)', () => {
		expect(seriesPriceLabel(2950679.13, 'TRY')).toBe('₺2.950.679,13');
	});
});
```

Dosyanın en üstündeki import satırına `seriesPriceLabel` ekle (mevcut `./format` import bloğuna).

- [ ] **Step 2: FAIL doğrula**

Run: `npx vitest run src/lib/components/format.test.ts`
Expected: FAIL — `seriesPriceLabel` export yok.

- [ ] **Step 3: Implementasyon**

`src/lib/components/format.ts` sonuna ekle:

```ts
/** Grafik fiyat etiketi — serinin HAM birimiyle (crypto=USD, yahoo=TRY; bkz. seriesCurrency). */
export function seriesPriceLabel(price: number, currency: 'USD' | 'TRY'): string {
	return currency === 'USD' ? formatMoney(usd(price)) : formatMoney(tryM(price));
}
```

Not: `formatMoney` TRY'de `₺` + `tr-TR` NumberFormat üretir — test beklentileri bununla birebir. Bu test node ortamında Intl kullanır; mevcut `formatMoney` testleriyle aynı koşulda çalışır (yeni ICU riski yok, zaten kullanılan yol).

- [ ] **Step 4: PASS doğrula**

Run: `npx vitest run src/lib/components/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/format.ts src/lib/components/format.test.ts
git commit -m "feat(ui): seriesPriceLabel — grafik etiketlerinde birim dürüstlüğü (TDD)"
```

---

### Task 4: drawChart — DPR ölçekli saf canvas çizim modülü (withAlpha TDD)

**Files:**
- Create: `src/lib/components/chart/drawChart.ts`
- Test: `src/lib/components/chart/drawChart.test.ts`

**Interfaces:**
- Consumes: `ChartGeometry` (`$lib/domain/series/series`).
- Produces (Task 5 kullanır):
  - `interface DrawOptions { readonly w: number; readonly h: number; readonly dpr: number; readonly lineColor: string; readonly refColor: string }`
  - `renderChart(canvas: HTMLCanvasElement, g: ChartGeometry | null, o: DrawOptions): void`
  - `withAlpha(hex: string, alpha: number): string`

- [ ] **Step 1: Failing test yaz (yalnız saf kısım — canvas node'da yok)**

Create `src/lib/components/chart/drawChart.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withAlpha } from './drawChart';

describe('withAlpha', () => {
	it('#rrggbb → rgba', () => {
		expect(withAlpha('#00ff66', 0.18)).toBe('rgba(0,255,102,0.18)');
		expect(withAlpha('#a3b8cc', 0.35)).toBe('rgba(163,184,204,0.35)');
	});
	it('boşluk toleransı + büyük harf', () => {
		expect(withAlpha(' #FF3366 ', 1)).toBe('rgba(255,51,102,1)');
	});
	it('tanınmayan biçim olduğu gibi döner (rgb(...), kısa hex vb.)', () => {
		expect(withAlpha('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)');
		expect(withAlpha('#0f6', 0.5)).toBe('#0f6');
	});
});
```

- [ ] **Step 2: FAIL doğrula**

Run: `npx vitest run src/lib/components/chart/drawChart.test.ts`
Expected: FAIL — modül yok.

- [ ] **Step 3: Implementasyon**

Create `src/lib/components/chart/drawChart.ts`:

```ts
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
	if (!g) return;

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
```

- [ ] **Step 4: PASS doğrula**

Run: `npx vitest run src/lib/components/chart/drawChart.test.ts`
Expected: PASS. (`renderChart` node'da test edilmez — canvas yok; E2E + görsel doğrulama Task 8-9'da.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/chart/drawChart.ts src/lib/components/chart/drawChart.test.ts
git commit -m "feat(chart): drawChart modülü — DPR ölçek + dolgu + referans + son-nokta (withAlpha TDD)"
```

---

### Task 5: PriceChart v2 — etiketler, zaman ekseni, crosshair tooltip

**Files:**
- Modify: `src/lib/components/chart/PriceChart.svelte` (TAM yeniden yazım — aşağıdaki içerikle değiştir)

**Interfaces:**
- Consumes: Task 2 (`timeTicks`, `nearestIndex`, `seriesCurrency`, `tooltipTimeLabel`), Task 3 (`seriesPriceLabel`), Task 4 (`renderChart`, `withAlpha`).
- Produces: `PriceChart` props sözleşmesi — `{ points: PricePoint[]; width?: number; height?: number; source: 'crypto' | 'yahoo'; period: PeriodId }`. **DİKKAT:** `source` ve `period` artık ZORUNLU — Task 6'ya kadar `AssetPopover` eski çağrıyla kırık kalır; bu task'ın check adımı bu yüzden `AssetPopover` güncellemesini de içerir (aşağıda Step 2).

- [ ] **Step 1: PriceChart.svelte'i tamamen değiştir**

`src/lib/components/chart/PriceChart.svelte` yeni içeriği (dosyayı bu içerikle DEĞİŞTİR):

```svelte
<!-- src/lib/components/chart/PriceChart.svelte -->
<script lang="ts">
	import {
		computeChartGeometry,
		timeTicks,
		nearestIndex,
		seriesCurrency,
		tooltipTimeLabel,
		type PricePoint,
		type PeriodId,
	} from '$lib/domain/series/series';
	import { seriesPriceLabel } from '../format';
	import { renderChart, withAlpha } from './drawChart';

	interface Props {
		points: PricePoint[];
		width?: number;
		height?: number;
		source: 'crypto' | 'yahoo';
		period: PeriodId;
	}
	let { points, width = 260, height = 90, source, period }: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let hoverIndex = $state<number | null>(null);

	const geometry = $derived(computeChartGeometry(points, width, height));
	const currency = $derived(seriesCurrency(source));
	// Genişliğe göre 2-6 eksen etiketi (~90px başına bir).
	const ticks = $derived(timeTicks(points, period, Math.max(2, Math.min(6, Math.floor(width / 90)))));

	// term.* token'larının gerçek renk değerlerini computed style'dan al
	// (fallback'ler tailwind.config.ts değerleriyle birebir; hard-coded tema rengi yazma).
	function cssVar(name: string, fallback: string): string {
		if (typeof window === 'undefined' || !canvas) return fallback;
		const v = getComputedStyle(canvas).getPropertyValue(name).trim();
		return v || fallback;
	}

	$effect(() => {
		const g = geometry;
		const c = canvas;
		if (!c) return;
		const lineColor =
			g === null || g.rising
				? cssVar('--color-term-green', '#00ff66')
				: cssVar('--color-term-red', '#ff3366');
		renderChart(c, g, {
			w: width,
			h: height,
			dpr: window.devicePixelRatio || 1,
			lineColor,
			refColor: withAlpha(cssVar('--color-term-text', '#a3b8cc'), 0.35),
		});
	});

	function onPointerMove(e: PointerEvent) {
		if (points.length < 2) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		hoverIndex = nearestIndex(points.length, (e.clientX - rect.left) / rect.width);
	}
	function onPointerLeave() {
		hoverIndex = null;
	}

	// Crosshair/tooltip modeli — points kısalırsa stale-index koruması.
	const hover = $derived.by(() => {
		if (hoverIndex === null || geometry === null || hoverIndex >= points.length) return null;
		const pt = points[hoverIndex];
		const xy = geometry.points[hoverIndex];
		return {
			x: xy.x,
			y: xy.y,
			priceLabel: seriesPriceLabel(pt.price, currency),
			timeLabel: tooltipTimeLabel(pt.t, period),
		};
	});
</script>

<div
	class="relative select-none"
	style="width:{width}px;height:{height}px;touch-action:none"
	onpointermove={onPointerMove}
	onpointerleave={onPointerLeave}
>
	<canvas bind:this={canvas} class="block w-full h-full"></canvas>
	{#if geometry !== null}
		<span class="absolute top-0.5 left-1 text-[9px] leading-none text-term-text opacity-70 bg-term-panel/70 px-0.5 pointer-events-none">
			{seriesPriceLabel(geometry.max, currency)}
		</span>
		<span class="absolute bottom-0.5 left-1 text-[9px] leading-none text-term-text opacity-70 bg-term-panel/70 px-0.5 pointer-events-none">
			{seriesPriceLabel(geometry.min, currency)}
		</span>
		{#if hover !== null}
			<div class="absolute top-0 bottom-0 w-px bg-term-text opacity-30 pointer-events-none" style="left:{hover.x}px"></div>
			<div class="absolute w-1.5 h-1.5 rounded-full bg-term-blue pointer-events-none" style="left:{hover.x - 3}px;top:{hover.y - 3}px"></div>
			<div
				class="absolute top-1 text-[9px] leading-tight bg-term-bg border border-term-border px-1 py-0.5 pointer-events-none whitespace-nowrap z-10"
				style={hover.x > width * 0.55 ? `right:${width - hover.x + 6}px` : `left:${hover.x + 6}px`}
			>
				<div class="text-term-text font-bold">{hover.priceLabel}</div>
				<div class="text-term-text opacity-60">{hover.timeLabel}</div>
			</div>
		{/if}
	{:else}
		<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px] italic">
			veri yok
		</div>
	{/if}
</div>
{#if geometry !== null && ticks.length > 0}
	<!-- Zaman ekseni: canvas altında ince HTML satırı (indeks-tabanlı x, çizgiyle aynı ölçek) -->
	<div class="relative h-3.5 text-[9px] text-term-text opacity-50 pointer-events-none font-mono" style="width:{width}px">
		{#each ticks as tk (tk.index)}
			{@const x = geometry.points[tk.index].x}
			<span
				class="absolute top-0.5 leading-none whitespace-nowrap"
				style={x < 24 ? `left:${x}px` : x > width - 32 ? `right:${width - x}px` : `left:${x}px;transform:translateX(-50%)`}
			>{tk.label}</span>
		{/each}
	</div>
{/if}
```

- [ ] **Step 2: AssetPopover çağrısını geçici uyumla** (derleme kırılmasın; tam refactor Task 6'da)

`src/lib/components/AssetPopover.svelte` içindeki PriceChart satırını bul:

```svelte
		<PriceChart {points} width={variant === 'mobile' ? 320 : 274} height={90} />
```

şununla değiştir:

```svelte
		<PriceChart {points} width={variant === 'mobile' ? 320 : 274} height={90} source={row.source} {period} />
```

- [ ] **Step 3: Doğrula**

Run: `npm run check` → 0 error.
Run: `npm run test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/chart/PriceChart.svelte src/lib/components/AssetPopover.svelte
git commit -m "feat(chart): PriceChart v2 — DPR keskinlik, min/max, zaman ekseni, crosshair tooltip"
```

---

### Task 6: PeriodTabs + useSeries + PositionSummary; popover'a ⤢ BÜYÜT

**Files:**
- Create: `src/lib/components/chart/PeriodTabs.svelte`
- Create: `src/lib/components/chart/useSeries.svelte.ts`
- Create: `src/lib/components/PositionSummary.svelte`
- Modify: `src/lib/components/AssetPopover.svelte` (TAM yeniden yazım — aşağıda)

**Interfaces:**
- Consumes: Task 2 (`seriesChangePct`, `PeriodId`), mevcut `fetchPriceSeries`, `PERIODS`, `dailyChangeBadge`.
- Produces (Task 7 kullanır):
  - `PeriodTabs` props: `{ period: PeriodId; onSelect: (p: PeriodId) => void; changePct?: number }`
  - `createSeriesLoader(params: () => { id: string; source: 'crypto' | 'yahoo'; period: PeriodId }): { readonly points: PricePoint[]; readonly loading: boolean }` — **component init sırasında çağrılmalı** (`$effect` kuralı).
  - `PositionSummary` props: `{ store: LiveGameStore; assetId: string }`
  - `AssetPopover` YENİ opsiyonel prop: `onExpand?: () => void` (verilirse başlıkta `⤢ BÜYÜT` düğmesi görünür — düğme metni budur, `aria-label` EKLEME: E2E accessible-name ile bulur).

- [ ] **Step 1: useSeries.svelte.ts oluştur**

Create `src/lib/components/chart/useSeries.svelte.ts`:

```ts
import type { PricePoint, PeriodId } from '$lib/domain/series/series';
import { fetchPriceSeries } from '$lib/api/seriesClient';

export interface SeriesLoader {
	readonly points: PricePoint[];
	readonly loading: boolean;
}

/** id+source+period değişince talep üzerine seri çeker (iptal korumalı; hata → boş dizi).
 *  Component init sırasında çağrılmalı ($effect kuralı) — AssetPopover + ChartOverlay ortak. */
export function createSeriesLoader(
	params: () => { id: string; source: 'crypto' | 'yahoo'; period: PeriodId },
): SeriesLoader {
	let points = $state<PricePoint[]>([]);
	let loading = $state(false);

	$effect(() => {
		const { id, source, period } = params();
		loading = true;
		let cancelled = false;
		fetchPriceSeries(id, source, period)
			.then((s) => { if (!cancelled) points = s; })
			.catch(() => { if (!cancelled) points = []; })
			.finally(() => { if (!cancelled) loading = false; });
		return () => { cancelled = true; };
	});

	return {
		get points() { return points; },
		get loading() { return loading; },
	};
}
```

- [ ] **Step 2: PeriodTabs.svelte oluştur**

Create `src/lib/components/chart/PeriodTabs.svelte`:

```svelte
<!-- src/lib/components/chart/PeriodTabs.svelte -->
<script lang="ts">
	import { PERIODS, type PeriodId } from '$lib/domain/series/series';
	import { dailyChangeBadge } from '../format';

	interface Props {
		period: PeriodId;
		onSelect: (p: PeriodId) => void;
		/** Seçili periyodun ilk→son değişim yüzdesi (seriesChangePct); veri yoksa undefined. */
		changePct?: number;
	}
	let { period, onSelect, changePct }: Props = $props();
	const badge = $derived(dailyChangeBadge(changePct));
</script>

<div class="flex items-center gap-1">
	{#each PERIODS as p (p.id)}
		<button
			type="button"
			onclick={() => onSelect(p.id)}
			class="flex-1 py-0.5 text-[10px] border transition-colors
			       {period === p.id
				? 'border-term-green text-term-green bg-term-panelLight'
				: 'border-term-border text-term-text opacity-60 hover:opacity-100'}"
		>
			{p.label}
		</button>
	{/each}
	{#if badge}
		<span class="shrink-0 text-[10px] font-bold {badge.cls} pl-1" title="Seçili periyot değişimi">{badge.text}</span>
	{/if}
</div>
```

- [ ] **Step 3: PositionSummary.svelte oluştur** (popover'daki Bende/maliyet bloğunun birebir taşınmışı — overlay ile ortak)

Create `src/lib/components/PositionSummary.svelte`:

```svelte
<!-- src/lib/components/PositionSummary.svelte -->
<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { displayUsd, dailyChangeBadge, heldUnits, positionPnl, pnlClass, signedUsd } from './format';

	interface Props {
		store: LiveGameStore;
		assetId: string;
	}
	let { store, assetId }: Props = $props();

	const held = $derived(heldUnits(store.positions, assetId));
	const heldUsd = $derived(store.positions.find((p) => p.assetId === assetId)?.valueUsd);
	// Maliyet + K/Z (WalletSummary ile aynı hesap) — pozisyon yoksa undefined, satır gizlenir.
	const posPnl = $derived.by(() => {
		const avgCostUsd = store.positions.find((p) => p.assetId === assetId)?.avgCostUsd;
		if (avgCostUsd === undefined || heldUsd === undefined) return undefined;
		return { avgCostUsd, ...positionPnl(held, avgCostUsd, heldUsd) };
	});
</script>

<div class="text-[10px] text-term-text opacity-70 border-t border-term-border pt-1">
	Bende: <span class="opacity-100 font-bold">{held.toFixed(4)}</span> adet
	{#if heldUsd !== undefined} · {displayUsd(usd(heldUsd))}{/if}
</div>
{#if posPnl}
	{@const pctBadge = dailyChangeBadge(posPnl.pnlPct)}
	<div class="text-[10px] text-term-text opacity-70 flex items-center gap-1.5">
		<span>Maliyet: {displayUsd(usd(posPnl.avgCostUsd))}/adet</span>
		<span class="opacity-40">·</span>
		<span class={pnlClass(posPnl.pnl ?? null)}>
			{signedUsd(posPnl.pnl === undefined ? null : usd(posPnl.pnl))}
		</span>
		{#if pctBadge}<span class={pctBadge.cls}>({pctBadge.text})</span>{/if}
	</div>
{/if}
```

- [ ] **Step 4: AssetPopover'ı yeni parçalarla yeniden yaz**

`src/lib/components/AssetPopover.svelte` yeni içeriği (dosyayı bu içerikle DEĞİŞTİR):

```svelte
<!-- src/lib/components/AssetPopover.svelte -->
<script lang="ts">
	import type { LiveGameStore, PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { type PeriodId, seriesChangePct } from '$lib/domain/series/series';
	import { displayTry, dailyChangeBadge } from './format';
	import PriceChart from './chart/PriceChart.svelte';
	import PeriodTabs from './chart/PeriodTabs.svelte';
	import PositionSummary from './PositionSummary.svelte';
	import TradeForm from './TradeForm.svelte';
	import { createSeriesLoader } from './chart/useSeries.svelte';

	interface Props {
		store: LiveGameStore;
		row: PriceRow;
		variant?: 'desktop' | 'mobile';
		onClose: () => void;
		/** Verilirse başlıkta ⤢ BÜYÜT düğmesi — tam boy ChartOverlay'i açar. */
		onExpand?: () => void;
		onTradeSuccess?: (message: string) => void;
	}
	let { store, row, variant = 'desktop', onClose, onExpand, onTradeSuccess }: Props = $props();

	let period = $state<PeriodId>('1G');
	// row.id + period değişince talep üzerine seri çek (yalnız bu sembol → ucuz).
	const series = createSeriesLoader(() => ({ id: row.id, source: row.source, period }));
	const changePct = $derived(seriesChangePct(series.points));
	const chg = $derived(dailyChangeBadge(row.changePct));
</script>

<div
	class="bg-term-panel border border-term-borderGlow font-mono text-xs p-3 space-y-2
	       {variant === 'mobile' ? 'w-full rounded-t-lg' : 'w-[300px] shadow-lg'}"
>
	<!-- Başlık + büyüt + kapat -->
	<div class="flex items-start justify-between gap-2 border-b border-term-border pb-1">
		<div class="min-w-0">
			<div class="text-term-text font-bold truncate">
				{row.label} <span class="opacity-50 text-[10px]">({row.id})</span>
			</div>
			<div class="flex items-baseline gap-2">
				<span class="text-term-green font-bold">{displayTry(row.priceTry)}</span>
				{#if chg}<span class="text-[10px] {chg.cls} font-bold">{chg.text}</span>{/if}
			</div>
		</div>
		<div class="flex items-center gap-1 shrink-0">
			{#if onExpand}
				<button
					type="button"
					onclick={onExpand}
					class="text-term-blue opacity-70 hover:opacity-100 px-1 text-[10px] font-bold"
				>⤢ BÜYÜT</button>
			{/if}
			<button
				type="button"
				onclick={onClose}
				class="text-term-text opacity-50 hover:opacity-100 px-1"
				aria-label="Kapat"
			>✕</button>
		</div>
	</div>

	<!-- Grafik -->
	<div class="relative">
		<PriceChart points={series.points} width={variant === 'mobile' ? 320 : 274} height={90} source={row.source} {period} />
		{#if series.loading}
			<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px]">
				yükleniyor…
			</div>
		{/if}
	</div>

	<PeriodTabs {period} onSelect={(p) => (period = p)} {changePct} />

	<PositionSummary {store} assetId={row.id} />

	<!-- Gerçek işlem -->
	<TradeForm {store} assetId={row.id} {onTradeSuccess} />
</div>
```

- [ ] **Step 5: Doğrula**

Run: `npm run check` → 0 error.
Run: `npm run test` → PASS.
Run: `npm run build` → başarılı.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/chart/PeriodTabs.svelte src/lib/components/chart/useSeries.svelte.ts src/lib/components/PositionSummary.svelte src/lib/components/AssetPopover.svelte
git commit -m "refactor(chart): PeriodTabs + useSeries + PositionSummary ortaklaştı; popover'a ⤢ BÜYÜT"
```

---

### Task 7: ChartOverlay + +page.svelte kablolaması

**Files:**
- Create: `src/lib/components/ChartOverlay.svelte`
- Modify: `src/routes/+page.svelte` (import bloğu; popover fonksiyonlarının altı ~satır 153; popover render bloğunun altı ~satır 801)

**Interfaces:**
- Consumes: Task 5-6'nın tamamı (`PriceChart`, `PeriodTabs`, `PositionSummary`, `createSeriesLoader`, `seriesChangePct`), mevcut `TradeForm`, `store.prices: PriceRow[]`.
- Produces: `ChartOverlay` props: `{ store: LiveGameStore; row: PriceRow; onClose: () => void; onTradeSuccess?: (message: string) => void }`. Overlay `role="dialog"` + `aria-label="{row.label} grafiği"` taşır (E2E bununla bulur).

- [ ] **Step 1: ChartOverlay.svelte oluştur**

Create `src/lib/components/ChartOverlay.svelte`:

```svelte
<!-- src/lib/components/ChartOverlay.svelte — ⤢ BÜYÜT tam boy grafik + işlem modalı -->
<script lang="ts">
	import type { LiveGameStore, PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { type PeriodId, seriesChangePct } from '$lib/domain/series/series';
	import { displayTry, dailyChangeBadge } from './format';
	import PriceChart from './chart/PriceChart.svelte';
	import PeriodTabs from './chart/PeriodTabs.svelte';
	import PositionSummary from './PositionSummary.svelte';
	import TradeForm from './TradeForm.svelte';
	import { createSeriesLoader } from './chart/useSeries.svelte';

	interface Props {
		store: LiveGameStore;
		row: PriceRow;
		onClose: () => void;
		onTradeSuccess?: (message: string) => void;
	}
	let { store, row, onClose, onTradeSuccess }: Props = $props();

	let period = $state<PeriodId>('1G');
	const series = createSeriesLoader(() => ({ id: row.id, source: row.source, period }));
	const changePct = $derived(seriesChangePct(series.points));
	const chg = $derived(dailyChangeBadge(row.changePct));

	// Grafik genişliği konteynerden (masaüstü ~geniş panel / mobil tam ekran).
	let boxWidth = $state(0);
	const chartWidth = $derived(Math.max(240, Math.floor(boxWidth)));
	const CHART_HEIGHT = 340;

	let closeBtn: HTMLButtonElement | null = $state(null);
	$effect(() => {
		closeBtn?.focus();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Arka örtü -->
<button type="button" class="fixed inset-0 bg-black/70 z-[60]" aria-label="Kapat" onclick={onClose}></button>

<div
	class="fixed z-[70] bg-term-panel border border-term-borderGlow font-mono text-xs
	       inset-0 overflow-y-auto p-3 space-y-3
	       md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2
	       md:w-[min(90vw,48rem)] md:max-h-[90vh] md:shadow-lg md:p-4"
	role="dialog"
	aria-modal="true"
	aria-label="{row.label} grafiği"
>
	<!-- Başlık -->
	<div class="flex items-start justify-between gap-2 border-b border-term-border pb-2">
		<div class="min-w-0">
			<div class="text-term-text font-bold text-sm truncate">
				{row.label} <span class="opacity-50 text-[10px]">({row.id})</span>
			</div>
			<div class="flex items-baseline gap-2">
				<span class="text-term-green font-bold text-base">{displayTry(row.priceTry)}</span>
				{#if chg}<span class="text-[10px] {chg.cls} font-bold">{chg.text}</span>{/if}
			</div>
		</div>
		<button
			bind:this={closeBtn}
			type="button"
			onclick={onClose}
			class="shrink-0 text-term-text opacity-50 hover:opacity-100 px-1"
			aria-label="Kapat"
		>✕</button>
	</div>

	<!-- Büyük grafik -->
	<div class="relative" bind:clientWidth={boxWidth}>
		{#if boxWidth > 0}
			<PriceChart points={series.points} width={chartWidth} height={CHART_HEIGHT} source={row.source} {period} />
		{/if}
		{#if series.loading}
			<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px]">
				yükleniyor…
			</div>
		{/if}
	</div>

	<PeriodTabs {period} onSelect={(p) => (period = p)} {changePct} />

	<PositionSummary {store} assetId={row.id} />

	<TradeForm {store} assetId={row.id} {onTradeSuccess} />
</div>
```

- [ ] **Step 2: +page.svelte kablolaması**

(a) Import bloğuna (AssetPopover import'unun yanına) ekle:

```svelte
	import ChartOverlay from '$lib/components/ChartOverlay.svelte';
```

(b) `onKeydown` fonksiyonunun (popover Escape) hemen ALTINA ekle:

```ts
	// ⤢ BÜYÜT: tam boy grafik overlay'i — popover kapanır, overlay açılır (spec grafik-iyilestirme §3).
	// Satır store.prices'tan derived akar; varlık listeden kalkarsa overlay kendini kapatır.
	let overlayAssetId = $state<string | null>(null);
	const overlayRow = $derived(
		overlayAssetId === null ? null : (store?.prices.find((p) => p.id === overlayAssetId) ?? null),
	);
	function openOverlay() {
		if (popoverRow) overlayAssetId = popoverRow.id;
		closePopover();
	}
	function closeOverlay() {
		overlayAssetId = null;
	}
```

(c) Her İKİ `<AssetPopover ...>` kullanımına (mobil + masaüstü varyantları, ~satır 784 ve ~798) `onExpand={openOverlay}` prop'u ekle. Örnek (mobil):

```svelte
					<AssetPopover {store} row={popoverRow} variant="mobile" onClose={closePopover} onExpand={openOverlay} onTradeSuccess={showToast} />
```

(d) Popover render bloğunun kapanışından (`{/if}`) SONRA, ClosingCard bloğundan ÖNCE ekle:

```svelte
		{#if overlayRow && store}
			<ChartOverlay {store} row={overlayRow} onClose={closeOverlay} onTradeSuccess={showToast} />
		{/if}
```

Not: sayfa düzeyindeki `onKeydown` Escape'te `closePopover()` çağırır — overlay açıkken popover zaten kapalı, çakışma yok; overlay kendi Escape'ini kendi `svelte:window`'unda dinler.

- [ ] **Step 3: Doğrula**

Run: `npm run check` → 0 error.
Run: `npm run test` → PASS.
Run: `npm run build` → başarılı.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ChartOverlay.svelte src/routes/+page.svelte
git commit -m "feat(chart): ChartOverlay — ⤢ BÜYÜT tam boy grafik + işlem modalı"
```

---

### Task 8: E2E — deterministik series fixture + overlay smoke senaryosu

**Files:**
- Modify: `tests/e2e/fixtures/market.ts` (sona export ekle)
- Modify: `tests/e2e/helpers/market-mocks.ts` (series route'u fixture'a bağla)
- Create: `tests/e2e/chart-overlay.spec.ts`

**Interfaces:**
- Consumes: Task 6'nın `⤢ BÜYÜT` düğmesi (accessible name: `⤢ BÜYÜT`), Task 7'nin `role="dialog"` + `aria-label="Bitcoin grafiği"` sözleşmesi, mevcut `enterOffline`/`stubTurnstile`/`mockMarketData` helper'ları.
- Produces: `SERIES_FIXTURE: Array<{ t: number; price: number }>` (30 nokta; min fiyat TAM `62000` → etiket `$62,000.00`).

- [ ] **Step 1: Fixture ekle**

`tests/e2e/fixtures/market.ts` sonuna ekle:

```ts
/** /api/series fixture — 30 nokta, 5 dk aralıklı, hafif yükselen testere.
 *  Taban: 2026-07-14 09:00 UTC (TSİ 12:00) — eksen etiketleri deterministik.
 *  Min fiyat TAM 62000 (i=0) → grafik min etiketi '$62,000.00' (chart-overlay.spec bunu asserts eder). */
export const SERIES_FIXTURE = Array.from({ length: 30 }, (_, i) => ({
  t: Date.UTC(2026, 6, 14, 9, 0) + i * 300_000,
  price: 62_000 + i * 25 + (i % 3) * 40,
}));
```

- [ ] **Step 2: Series mock'unu fixture'a bağla**

`tests/e2e/helpers/market-mocks.ts` içinde:

Import satırını genişlet:

```ts
import { FX_FIXTURE, CRYPTO_FIXTURE, SERIES_FIXTURE } from '../fixtures/market';
```

Mevcut series route'unu:

```ts
  await page.route(/\/api\/series\?/, (route) =>
    route.fulfill({ json: { value: [], asOf: Date.now(), stale: false } }),
  );
```

şununla değiştir:

```ts
  await page.route(/\/api\/series\?/, (route) =>
    route.fulfill({ json: { value: SERIES_FIXTURE, asOf: Date.now(), stale: false } }),
  );
```

(Mevcut senaryolar seri içeriğine assertion yapmıyor — davranış değişmez, sadece grafikler artık dolu çizilir.)

- [ ] **Step 3: Smoke senaryosunu yaz**

Create `tests/e2e/chart-overlay.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('grafik overlay: popover → ⤢ BÜYÜT → dialog + etiketler + TradeForm; Escape kapatır', async ({ page }) => {
  await enterOffline(page);

  // Masaüstünde popover 1 sn hover ile açılır (PriceRow.handleEnter'daki kasıtlı gecikme).
  await page.getByText('Bitcoin').first().hover();
  const expandBtn = page.getByRole('button', { name: '⤢ BÜYÜT' });
  await expect(expandBtn).toBeVisible({ timeout: 5_000 });
  await expandBtn.click();

  const dialog = page.getByRole('dialog', { name: 'Bitcoin grafiği' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('canvas')).toBeVisible();
  // Min fiyat etiketi — SERIES_FIXTURE min'i tam 62000, kaynak crypto → USD biçimi.
  await expect(dialog.getByText('$62,000.00').first()).toBeVisible();
  // TradeForm overlay içinde (ana panel/popover'la olası id çakışmasına karşı dialog'a scope).
  await expect(dialog.getByRole('button', { name: 'AL', exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
```

- [ ] **Step 4: Koş ve doğrula**

Önkoşul: Docker Desktop açık + `npx supabase start` (CLAUDE.md Test Disiplini).

Run: `npx playwright test tests/e2e/chart-overlay.spec.ts`
Expected: 1 passed.

Run: `npm run e2e`
Expected: 11 senaryonun tamamı passed (mevcut 10 + yeni 1; series fixture değişikliği eskileri kırmamalı).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/market.ts tests/e2e/helpers/market-mocks.ts tests/e2e/chart-overlay.spec.ts
git commit -m "test(e2e): grafik overlay smoke + deterministik series fixture"
```

---

### Task 9: Kapanış — tam doğrulama, görsel kontrol, CLAUDE.md senkronu

**Files:**
- Modify: `CLAUDE.md` (Test Disiplini bölümündeki E2E satırı)

**Interfaces:**
- Consumes: önceki tüm task'lar.
- Produces: — (kapanış).

- [ ] **Step 1: Tam doğrulama** (verification-before-completion)

```bash
npm run test
npm run check
npm run build
```
Expected: üçü de yeşil/0 error.

- [ ] **Step 2: Görsel doğrulama** (dev server + tarayıcı)

`npm run dev` → `http://localhost:5173` (DİKKAT: `.env.local` PROD Supabase'i gösterir — kayıt akışına girme, MİSAFİR/offline yolunu kullan). Kontrol listesi:
1. Üstte BAĞLAM satırı YOK.
2. Bir varlığa hover (1 sn) → pop-up: grafik keskin (bulanık değil), dolgu + kesikli referans çizgisi + son-nokta dot'u, min/max etiketleri, altta zaman etiketleri, periyot düğmeleri yanında renkli % rozeti.
3. Grafik üstünde gezin → crosshair + fiyat/zaman tooltip'i; BTC'de fiyatlar `$`, THYAO'da `₺`.
4. ⤢ BÜYÜT → overlay: büyük grafik, periyotlar, Bende/maliyet, AL/SAT çalışıyor; Escape/backdrop/✕ kapatıyor.
5. Pencereyi daralt (mobil genişlik) → overlay tam ekran, kaydırılabilir.

- [ ] **Step 3: CLAUDE.md E2E satırını senkronla**

`CLAUDE.md` Test Disiplini bölümünde `10 senaryo:` ile başlayan cümleyi bul ve `11 senaryo:` yapıp senaryo listesinin sonuna `+ grafik overlay smoke (popover → BÜYÜT → dialog/Escape)` ekle. (Bölümün geri kalanına dokunma.)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md E2E senaryo sayısı senkronu (10→11, grafik overlay smoke)"
```

- [ ] **Step 5: Push** (kullanıcı onayı varsa — CI `test` + `e2e` job'larının yeşilini bekle)

```bash
git push
```
