# Market Grafik + İşlem Pop-up'ı — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Markette varlık üstüne gelince (masaüstü 1 sn hover / mobil dokunma) açılan, canvas fiyat grafiği + periyot seçimi + "bende ne kadar var" + gerçek AL/SAT içeren bir pop-up eklemek.

**Architecture:** Saf domain (`series/`) seri tipleri + çizim geometrisi sağlar; `api/seriesSource` upstream'i (Yahoo chart / Binance klines) parse eder; cache'li `/api/series` proxy'si bunu yüzeyler; bileşenler (`PriceChart`, `AssetPopover`, ortak `TradeForm`) bu veriyi gösterir ve işlem yaptırır. İşlem formu TradePanel'den `TradeForm`'a çıkarılıp pop-up ile paylaşılır → tek doğrulama, tekrar yok.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TypeScript (strict) + Tailwind (`term.*` token) + Vitest. Canvas (bağımlılıksız) grafik. Yahoo Finance + Binance upstream.

## Global Constraints

- Para: ham `number` değil; `Money` tipi + `usd()` (`src/lib/domain/money.ts`). Seri fiyatları grafik için ham `number` olabilir (gösterim/şekil); cüzdan/işlem `Money` kalır.
- Domain modülleri UI'sız + saf; yalnız `money.ts` + kendi tiplerine bağımlı. TDD zorunlu.
- API çağrıları yalnız `src/lib/api/` + proxy route altında. Yahoo proxy ≥5s server cache (CLAUDE.md).
- Svelte 5 runes (`$state`/`$derived`/`$effect`/`$props`). `setInterval` + DOM manipülasyonu YASAK; fiyat/çizim güncellemesi `$derived`/`$effect`.
- Renkler `term.*` token'ları (hard-coded #hex yok). Font `font-mono`.
- Identifier İngilizce, UI metni Türkçe. Component ≤ ~200 satır (geçerse parçala).
- Periyotlar: `15D / 1G / 1H / 1A / 1Y` (15 dakika / gün / hafta / ay / yıl).
- "tamam" demeden önce `npm run test` + `npm run build` geçmeli (build'de bilinen Windows-only adapter-vercel symlink EPERM hatası kabul; derleme kısmı temiz olmalı).

## File Structure

| Dosya | Sorumluluk |
|-------|-----------|
| `src/lib/domain/series/series.ts` (yeni) | Saf: `PricePoint`, `PeriodId`, `PERIODS`, `sliceLast`, `computeChartGeometry`. |
| `src/lib/domain/series/series.test.ts` (yeni) | Yukarısının birim testleri. |
| `src/lib/api/seriesSource.ts` (yeni) | Upstream seçimi (`upstreamFor`) + Yahoo/Binance parse → `PricePoint[]`. |
| `src/lib/api/seriesSource.test.ts` (yeni) | Sahte fetch ile parse + eşleme testleri. |
| `src/routes/api/series/+server.ts` (yeni) | Cache'li proxy: `?symbol=&source=&period=`. |
| `src/routes/api/series/server.test.ts` (yeni) | Cache + kaynak-dağıtım testi. |
| `src/lib/api/seriesClient.ts` (yeni) | Tarayıcı → `/api/series` ince istemci (`fetchPriceSeries`). |
| `src/lib/components/chart/PriceChart.svelte` (yeni) | Canvas çizgi grafik (geometriden). |
| `src/lib/components/TradeForm.svelte` (yeni) | TradePanel'den çıkarılan gerçek AL/SAT formu (`assetId` prop'lu). |
| `src/lib/components/TradePanel.svelte` (değişir) | İnce sarmalayıcı: başlık + `TradeForm`. |
| `src/lib/components/AssetPopover.svelte` (yeni) | Pop-up: başlık + grafik + periyot + bakiye + `TradeForm`. |
| `src/lib/components/PriceRow.svelte` (değişir) | 1 sn hover timer / mobil tap → `onOpenPopover`. |
| `src/lib/components/PriceList.svelte` (değişir) | `onOpenPopover`'ı PriceRow'a geçir. |
| `src/routes/+page.svelte` (değişir) | Pop-up state + pin/dış-tık/Esc + montaj. |

---

## Task 1: Domain `series/` — tipler, periyotlar, çizim geometrisi (saf, TDD)

**Files:**
- Create: `src/lib/domain/series/series.ts`
- Test: `src/lib/domain/series/series.test.ts`

**Interfaces:**
- Produces:
  - `interface PricePoint { t: number; price: number }`
  - `type PeriodId = '15D' | '1G' | '1H' | '1A' | '1Y'`
  - `interface Period { id: PeriodId; label: string }`
  - `const PERIODS: ReadonlyArray<Period>`
  - `function sliceLast(points: PricePoint[], windowMs: number): PricePoint[]`
  - `interface ChartGeometry { points: ReadonlyArray<{ x: number; y: number }>; min: number; max: number; first: number; last: number; changePct: number; rising: boolean }`
  - `function computeChartGeometry(points: ReadonlyArray<PricePoint>, w: number, h: number): ChartGeometry | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/domain/series/series.test.ts
import { describe, it, expect } from 'vitest';
import { PERIODS, sliceLast, computeChartGeometry, type PricePoint } from './series';

describe('PERIODS', () => {
	it('5 periyot, doğru sıra ve etiketler', () => {
		expect(PERIODS.map((p) => p.id)).toEqual(['15D', '1G', '1H', '1A', '1Y']);
		expect(PERIODS.map((p) => p.label)).toEqual(['15D', '1G', '1H', '1A', '1Y']);
	});
});

describe('sliceLast', () => {
	const pts: PricePoint[] = [
		{ t: 1000, price: 1 },
		{ t: 2000, price: 2 },
		{ t: 3000, price: 3 },
	];
	it('pencere içindeki son noktaları döner (son t referans)', () => {
		expect(sliceLast(pts, 1500)).toEqual([{ t: 2000, price: 2 }, { t: 3000, price: 3 }]);
	});
	it('pencere her şeyi kapsıyorsa hepsini döner', () => {
		expect(sliceLast(pts, 999999)).toEqual(pts);
	});
	it('boş dizi → boş', () => {
		expect(sliceLast([], 1000)).toEqual([]);
	});
});

describe('computeChartGeometry', () => {
	it('boş dizi → null', () => {
		expect(computeChartGeometry([], 100, 50)).toBeNull();
	});
	it('tek nokta → null (çizgi çizilemez)', () => {
		expect(computeChartGeometry([{ t: 1, price: 5 }], 100, 50)).toBeNull();
	});
	it('yükselen seri: rising=true, ilk x=0 son x=w, y ters (yüksek fiyat küçük y)', () => {
		const g = computeChartGeometry([{ t: 0, price: 10 }, { t: 1, price: 20 }], 100, 50)!;
		expect(g.rising).toBe(true);
		expect(g.first).toBe(10);
		expect(g.last).toBe(20);
		expect(g.min).toBe(10);
		expect(g.max).toBe(20);
		expect(g.changePct).toBeCloseTo(100, 5);
		expect(g.points[0]).toEqual({ x: 0, y: 50 });   // min fiyat → alt (y=h)
		expect(g.points[1]).toEqual({ x: 100, y: 0 });  // max fiyat → üst (y=0)
	});
	it('düşen seri: rising=false', () => {
		const g = computeChartGeometry([{ t: 0, price: 20 }, { t: 1, price: 10 }], 100, 50)!;
		expect(g.rising).toBe(false);
		expect(g.changePct).toBeCloseTo(-50, 5);
	});
	it('düz seri (min==max): y ortada (NaN değil)', () => {
		const g = computeChartGeometry([{ t: 0, price: 5 }, { t: 1, price: 5 }], 100, 50)!;
		expect(g.points.every((p) => Number.isFinite(p.y))).toBe(true);
		expect(g.changePct).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/domain/series/series.test.ts`
Expected: FAIL — `series` modülü yok / export'lar tanımsız.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/domain/series/series.ts

/** Tek fiyat noktası — t: epoch ms, price: ham birim (TRY/USD; grafik şekli için birim önemsiz). */
export interface PricePoint {
	readonly t: number;
	readonly price: number;
}

export type PeriodId = '15D' | '1G' | '1H' | '1A' | '1Y';
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
	readonly points: ReadonlyArray<{ x: number; y: number }>;
	readonly min: number;
	readonly max: number;
	readonly first: number;
	readonly last: number;
	readonly changePct: number;
	readonly rising: boolean;
}

/** Noktaları (w×h) çizim alanına ölçekler. <2 nokta → null. y ekseni ters (yüksek fiyat = küçük y). */
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
	const span = max - min;
	const n = points.length;
	const xy = points.map((p, i) => ({
		x: (i / (n - 1)) * w,
		y: span === 0 ? h / 2 : h - ((p.price - min) / span) * h,
	}));
	const first = points[0].price;
	const last = points[n - 1].price;
	const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
	return { points: xy, min, max, first, last, changePct, rising: last >= first };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/domain/series/series.test.ts`
Expected: PASS (tüm testler yeşil, uyarısız).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/series/series.ts src/lib/domain/series/series.test.ts
git commit -m "feat(series): saf fiyat-serisi tipleri + cizim geometrisi"
```

---

## Task 2: `api/seriesSource.ts` — upstream seçimi + parse (TDD)

**Files:**
- Create: `src/lib/api/seriesSource.ts`
- Test: `src/lib/api/seriesSource.test.ts`

**Interfaces:**
- Consumes: `PricePoint`, `PeriodId` (`$lib/domain/series/series`)
- Produces:
  - `function upstreamFor(assetId: string, source: 'crypto' | 'yahoo'): { kind: 'crypto' | 'yahoo'; symbol: string }`
  - `function fetchSeries(assetId: string, source: 'crypto' | 'yahoo', period: PeriodId, fetchFn: typeof fetch): Promise<PricePoint[]>`
  - `const SERIES_TTL_MS: Record<PeriodId, number>`

Notlar: kripto → Binance `{id}USDT`; emtia `XAUGRAM→GC=F`, `XAGGRAM→SI=F`; döviz `EUR→EURTRY=X`; diğer yahoo → `{id}.IS`. Yahoo serisi `chart.result[0].timestamp[]` (saniye) + `indicators.quote[0].close[]` (null'lar atılır). Binance klines `[[openTimeMs, o, h, l, close, ...], ...]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/api/seriesSource.test.ts
import { describe, it, expect, vi } from 'vitest';
import { upstreamFor, fetchSeries } from './seriesSource';

function resp(body: unknown) {
	return { ok: true, status: 200, json: async () => body } as Response;
}

describe('upstreamFor', () => {
	it('kripto → Binance USDT sembolü', () => {
		expect(upstreamFor('BTC', 'crypto')).toEqual({ kind: 'crypto', symbol: 'BTCUSDT' });
	});
	it('altın/gümüş/euro özel yahoo sembolleri', () => {
		expect(upstreamFor('XAUGRAM', 'yahoo')).toEqual({ kind: 'yahoo', symbol: 'GC=F' });
		expect(upstreamFor('XAGGRAM', 'yahoo')).toEqual({ kind: 'yahoo', symbol: 'SI=F' });
		expect(upstreamFor('EUR', 'yahoo')).toEqual({ kind: 'yahoo', symbol: 'EURTRY=X' });
	});
	it('diğer yahoo → BIST .IS', () => {
		expect(upstreamFor('THYAO', 'yahoo')).toEqual({ kind: 'yahoo', symbol: 'THYAO.IS' });
	});
});

describe('fetchSeries — Yahoo', () => {
	it('timestamp+close dizilerini PricePoint[]e çevirir, null close atılır', async () => {
		const fetchFn = vi.fn(async () =>
			resp({
				chart: {
					result: [
						{
							timestamp: [60, 120, 180],
							indicators: { quote: [{ close: [10, null, 12] }] },
						},
					],
				},
			}),
		) as unknown as typeof fetch;
		const out = await fetchSeries('THYAO', 'yahoo', '1G', fetchFn);
		expect(out).toEqual([
			{ t: 60_000, price: 10 },
			{ t: 180_000, price: 12 },
		]);
	});
});

describe('fetchSeries — Binance', () => {
	it('klines[4] (close) alır, openTime ms', async () => {
		const fetchFn = vi.fn(async () =>
			resp([
				[1000, '1', '2', '0.5', '1.5', '9'],
				[2000, '1.5', '3', '1', '2.5', '8'],
			]),
		) as unknown as typeof fetch;
		const out = await fetchSeries('BTC', 'crypto', '1G', fetchFn);
		expect(out).toEqual([
			{ t: 1000, price: 1.5 },
			{ t: 2000, price: 2.5 },
		]);
	});
});

describe('fetchSeries — 15D Yahoo 1d/1m çekiminden dilimlenir', () => {
	it('15D için 1m interval istenir', async () => {
		const fetchFn = vi.fn(async () =>
			resp({ chart: { result: [{ timestamp: [60], indicators: { quote: [{ close: [10] }] } }] } }),
		) as unknown as typeof fetch;
		await fetchSeries('THYAO', 'yahoo', '15D', fetchFn);
		const url = (fetchFn as unknown as vi.Mock).mock.calls[0][0] as string;
		expect(url).toContain('range=1d');
		expect(url).toContain('interval=1m');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/api/seriesSource.test.ts`
Expected: FAIL — `seriesSource` yok.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/api/seriesSource.ts
import type { PricePoint, PeriodId } from '../domain/series/series';
import { sliceLast } from '../domain/series/series';

const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Periyot başına server cache TTL: intraday kısa, uzun barlar uzun. */
export const SERIES_TTL_MS: Record<PeriodId, number> = {
	'15D': 30_000,
	'1G': 30_000,
	'1H': 600_000,
	'1A': 600_000,
	'1Y': 600_000,
};

const YAHOO_SPECIAL: Record<string, string> = { XAUGRAM: 'GC=F', XAGGRAM: 'SI=F', EUR: 'EURTRY=X' };

export function upstreamFor(
	assetId: string,
	source: 'crypto' | 'yahoo',
): { kind: 'crypto' | 'yahoo'; symbol: string } {
	if (source === 'crypto') return { kind: 'crypto', symbol: `${assetId}USDT` };
	if (YAHOO_SPECIAL[assetId]) return { kind: 'yahoo', symbol: YAHOO_SPECIAL[assetId] };
	return { kind: 'yahoo', symbol: `${assetId}.IS` };
}

// Yahoo chart range/interval (15D, 1G ile aynı 1d/1m çekimden dilimlenir).
const YAHOO_RANGE: Record<PeriodId, { range: string; interval: string }> = {
	'15D': { range: '1d', interval: '1m' },
	'1G': { range: '1d', interval: '1m' },
	'1H': { range: '5d', interval: '30m' },
	'1A': { range: '1mo', interval: '1d' },
	'1Y': { range: '1y', interval: '1wk' },
};

// Binance klines interval + limit.
const BINANCE_KLINE: Record<PeriodId, { interval: string; limit: number }> = {
	'15D': { interval: '1m', limit: 15 },
	'1G': { interval: '5m', limit: 288 },
	'1H': { interval: '1h', limit: 168 },
	'1A': { interval: '1d', limit: 30 },
	'1Y': { interval: '1w', limit: 52 },
};

const FIFTEEN_MIN_MS = 15 * 60_000;

function parseYahoo(j: unknown): PricePoint[] {
	const r = (j as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } })
		?.chart?.result?.[0];
	const ts = r?.timestamp;
	const close = r?.indicators?.quote?.[0]?.close;
	if (!Array.isArray(ts) || !Array.isArray(close)) return [];
	const out: PricePoint[] = [];
	for (let i = 0; i < ts.length; i++) {
		const c = close[i];
		if (typeof c === 'number' && Number.isFinite(c)) out.push({ t: ts[i] * 1000, price: c });
	}
	return out;
}

function parseBinance(j: unknown): PricePoint[] {
	if (!Array.isArray(j)) return [];
	const out: PricePoint[] = [];
	for (const k of j as unknown[][]) {
		const t = Number(k[0]);
		const close = Number(k[4]);
		if (Number.isFinite(t) && Number.isFinite(close)) out.push({ t, price: close });
	}
	return out;
}

/** Tek varlığın seçili periyot serisini çeker (kaynak sınıfına göre upstream seçer). */
export async function fetchSeries(
	assetId: string,
	source: 'crypto' | 'yahoo',
	period: PeriodId,
	fetchFn: typeof fetch,
): Promise<PricePoint[]> {
	const up = upstreamFor(assetId, source);
	if (up.kind === 'crypto') {
		const { interval, limit } = BINANCE_KLINE[period];
		const res = await fetchFn(
			`https://api.binance.com/api/v3/klines?symbol=${up.symbol}&interval=${interval}&limit=${limit}`,
		);
		if (!res.ok) throw new Error(`Binance ${up.symbol}: HTTP ${res.status}`);
		return parseBinance(await res.json());
	}
	const { range, interval } = YAHOO_RANGE[period];
	const res = await fetchFn(
		`https://query1.finance.yahoo.com/v8/finance/chart/${up.symbol}?range=${range}&interval=${interval}`,
		{ headers: { 'User-Agent': UA } },
	);
	if (!res.ok) throw new Error(`Yahoo ${up.symbol}: HTTP ${res.status}`);
	const points = parseYahoo(await res.json());
	return period === '15D' ? sliceLast(points, FIFTEEN_MIN_MS) : points;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/api/seriesSource.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/seriesSource.ts src/lib/api/seriesSource.test.ts
git commit -m "feat(series): upstream secimi + Yahoo/Binance seri parse"
```

---

## Task 3: `/api/series` proxy + `seriesClient` (TDD)

**Files:**
- Create: `src/routes/api/series/+server.ts`
- Create: `src/routes/api/series/server.test.ts`
- Create: `src/lib/api/seriesClient.ts`

**Interfaces:**
- Consumes: `fetchSeries`, `SERIES_TTL_MS` (`$lib/api/seriesSource`); `PricePoint`, `PeriodId`, `PERIODS` (`$lib/domain/series/series`); `createTtlCache` (`$lib/api/cachedFetch`); `Cached<T>` (`$lib/api/types`).
- Produces:
  - Route `GET /api/series?symbol=&source=&period=` → `Cached<PricePoint[]>` JSON (`{ value, asOf, stale }`).
  - `function fetchPriceSeries(assetId: string, source: 'crypto' | 'yahoo', period: PeriodId, fetchFn?: typeof fetch): Promise<PricePoint[]>` (`seriesClient.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/api/series/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';

const realFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = realFetch; });

function makeEvent(params: Record<string, string>) {
	const url = new URL('http://localhost/api/series');
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return { url } as Parameters<typeof GET>[0];
}

describe('GET /api/series', () => {
	it('geçersiz period → 400', async () => {
		const res = await GET(makeEvent({ symbol: 'BTC', source: 'crypto', period: 'XX' }));
		expect(res.status).toBe(400);
	});

	it('eksik symbol → 400', async () => {
		const res = await GET(makeEvent({ source: 'crypto', period: '1G' }));
		expect(res.status).toBe(400);
	});

	it('Binance kaynağı için klines çeker ve PricePoint[] döner', async () => {
		globalThis.fetch = vi.fn(async () => ({
			ok: true, status: 200,
			json: async () => [[1000, '1', '2', '0', '1.5', '9']],
		})) as unknown as typeof fetch;
		const res = await GET(makeEvent({ symbol: 'BTC', source: 'crypto', period: '1G' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.value).toEqual([{ t: 1000, price: 1.5 }]);
		expect(body.stale).toBe(false);
	});

	it('aynı symbol+period ikinci çağrı cache (fetch bir kez)', async () => {
		const spy = vi.fn(async () => ({
			ok: true, status: 200,
			json: async () => [[1000, '1', '2', '0', '2', '9']],
		}));
		globalThis.fetch = spy as unknown as typeof fetch;
		await GET(makeEvent({ symbol: 'ETH', source: 'crypto', period: '1A' }));
		await GET(makeEvent({ symbol: 'ETH', source: 'crypto', period: '1A' }));
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/routes/api/series/server.test.ts`
Expected: FAIL — `+server` yok.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routes/api/series/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Cached } from '$lib/api/types';
import type { PricePoint, PeriodId } from '$lib/domain/series/series';
import { PERIODS } from '$lib/domain/series/series';
import { fetchSeries, SERIES_TTL_MS } from '$lib/api/seriesSource';
import { createTtlCache } from '$lib/api/cachedFetch';

const VALID_PERIODS = new Set(PERIODS.map((p) => p.id));
const EMPTY: PricePoint[] = [];

// (symbol+source+period) başına ayrı TTL cache — talep üzerine lazy oluşturulur.
const caches = new Map<string, () => Promise<Cached<PricePoint[]>>>();

function cacheFor(symbol: string, source: 'crypto' | 'yahoo', period: PeriodId) {
	const key = `${source}:${symbol}:${period}`;
	let c = caches.get(key);
	if (!c) {
		c = createTtlCache<PricePoint[]>({
			ttlMs: SERIES_TTL_MS[period],
			fallback: EMPTY,
			fetcher: () => fetchSeries(symbol, source, period, fetch),
		});
		caches.set(key, c);
	}
	return c;
}

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol')?.trim();
	const source = url.searchParams.get('source');
	const period = url.searchParams.get('period') as PeriodId | null;

	if (!symbol || (source !== 'crypto' && source !== 'yahoo') || !period || !VALID_PERIODS.has(period)) {
		return json({ error: 'geçersiz parametre' }, { status: 400 });
	}
	const headers = { 'cache-control': 'public, max-age=5' };
	return json(await cacheFor(symbol, source, period)(), { headers });
};
```

```ts
// src/lib/api/seriesClient.ts
import type { PricePoint, PeriodId } from '../domain/series/series';
import type { Cached } from './types';

/** Tarayıcı → /api/series ince istemci. Hata/boş → boş dizi (grafik "veri yok" gösterir). */
export async function fetchPriceSeries(
	assetId: string,
	source: 'crypto' | 'yahoo',
	period: PeriodId,
	fetchFn: typeof fetch = fetch,
): Promise<PricePoint[]> {
	const res = await fetchFn(
		`/api/series?symbol=${encodeURIComponent(assetId)}&source=${source}&period=${period}`,
	);
	if (!res.ok) return [];
	const body = (await res.json()) as Cached<PricePoint[]>;
	return Array.isArray(body.value) ? body.value : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/routes/api/series/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + commit**

Run: `npm run test`
Expected: tüm dosyalar PASS.

```bash
git add src/routes/api/series/+server.ts src/routes/api/series/server.test.ts src/lib/api/seriesClient.ts
git commit -m "feat(series): cache'li /api/series proxy + tarayici istemcisi"
```

---

## Task 4: `chart/PriceChart.svelte` — canvas çizgi grafik

**Files:**
- Create: `src/lib/components/chart/PriceChart.svelte`

**Interfaces:**
- Consumes: `ChartGeometry`, `computeChartGeometry`, `PricePoint` (`$lib/domain/series/series`).
- Produces: `<PriceChart points={PricePoint[]} width={number} height={number} />` (kendi içinde geometriyi hesaplar; <2 nokta → "veri yok").

- [ ] **Step 1: Implement component**

```svelte
<!-- src/lib/components/chart/PriceChart.svelte -->
<script lang="ts">
	import { computeChartGeometry, type PricePoint } from '$lib/domain/series/series';

	interface Props {
		points: PricePoint[];
		width?: number;
		height?: number;
	}
	let { points, width = 260, height = 90 }: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	const geometry = $derived(computeChartGeometry(points, width, height));

	// term.* token'larının gerçek renk değerlerini computed style'dan al (hard-coded #hex yok).
	function cssVar(name: string, fallback: string): string {
		if (typeof window === 'undefined' || !canvas) return fallback;
		const v = getComputedStyle(canvas).getPropertyValue(name).trim();
		return v || fallback;
	}

	$effect(() => {
		const g = geometry;
		const c = canvas;
		if (!c) return;
		const ctx = c.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);
		if (!g) return;
		ctx.beginPath();
		g.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
		ctx.strokeStyle = g.rising ? cssVar('--color-term-green', '#4ade80') : cssVar('--color-term-red', '#f87171');
		ctx.lineWidth = 1.5;
		ctx.stroke();
	});
</script>

<div class="relative" style="width:{width}px;height:{height}px">
	<canvas bind:this={canvas} {width} {height} class="block"></canvas>
	{#if geometry === null}
		<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px] italic">
			veri yok
		</div>
	{/if}
</div>
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: derleme (vite build) kısmı temiz tamamlanır; yalnız bilinen adapter-vercel symlink EPERM hatası (Windows) görülür.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/chart/PriceChart.svelte
git commit -m "feat(chart): bagimliliksiz canvas cizgi grafik"
```

> NOT: `--color-term-*` CSS değişken adlarının gerçek tanımıyla eşleştiğini Task 7 tarayıcı doğrulamasında teyit et. Tailwind 3 + `term.*` token'ları `tailwind.config.ts`'te tanımlı; eğer `--color-term-green` değişkeni yoksa fallback hex'ler (yeşil/kırmızı) devreye girer ve grafik yine doğru renkte çizilir.

---

## Task 5: `TradeForm.svelte` çıkarımı + `TradePanel` inceltme

**Files:**
- Create: `src/lib/components/TradeForm.svelte`
- Modify: `src/lib/components/TradePanel.svelte`

**Interfaces:**
- Consumes: `LiveGameStore` (`$lib/stores/liveGameStore.svelte`); `usd` (`$lib/domain/money`); `displayUsd, maxUnitsAffordable, heldUnits, tradeToastMessage` (`./format`); `Toast` (`./Toast.svelte`).
- Produces: `<TradeForm {store} assetId={string | null} />` — gerçek AL/SAT (units/dollar + MAX/TÜMÜ + AL/SAT + toast + hata bandı). `assetId === null` → "varlık seç" boş durumu.

- [ ] **Step 1: Create TradeForm with the extracted logic**

```svelte
<!-- src/lib/components/TradeForm.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { CATALOG } from '$lib/catalog/liveAssets';
	import { bistName } from '$lib/catalog/bist100';
	import { maxUnitsAffordable, heldUnits, tradeToastMessage } from './format';
	import Toast from './Toast.svelte';

	interface Props {
		store: LiveGameStore;
		assetId: string | null;
		/** Boş durumda gösterilecek metin (panel: "Soldan bir varlık seç"). */
		emptyText?: string;
	}
	let { store, assetId, emptyText = 'Bir varlık seç' }: Props = $props();

	const chipCls =
		'px-1.5 py-0.5 bg-term-bg border border-term-border text-term-blue text-[10px] ' +
		'hover:border-term-borderGlow hover:text-term-green transition-colors';

	const usdBalance = $derived(store.game.usdBalance.amount);
	const assetUsd = $derived(assetId ? store.assetUsdPrice(assetId) : undefined);
	const heldUnitsSel = $derived(heldUnits(store.positions, assetId));
	const assetLabel = $derived(
		assetId ? (CATALOG[assetId]?.label ?? bistName(assetId)) : null,
	);

	let units = $state(0);
	let dollarAmount = $state(0);

	// Varlık değişince formu sıfırla (pop-up farklı varlık açtığında eski değer kalmasın).
	$effect(() => {
		void assetId;
		units = 0;
		dollarAmount = 0;
	});

	function syncDollarFromUnits() {
		dollarAmount = assetUsd !== undefined ? Math.round(units * assetUsd * 100) / 100 : 0;
	}
	function syncUnitsFromDollar() {
		if (assetUsd !== undefined && assetUsd > 0) {
			units = Math.floor((dollarAmount / assetUsd) * 10000) / 10000;
		}
	}
	function maxUnits() {
		units = maxUnitsAffordable(usdBalance, assetUsd);
		syncDollarFromUnits();
	}
	function allUnits() {
		units = heldUnitsSel;
		syncDollarFromUnits();
	}

	let toastMessage = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	function showToast(message: string) {
		toastMessage = message;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastMessage = null), 5000);
	}
	onDestroy(() => {
		if (toastTimer) clearTimeout(toastTimer);
	});

	function handleBuy() {
		if (!assetId || units <= 0) return;
		const id = assetId;
		const u = units;
		const amt = dollarAmount;
		store.buy(id, u);
		units = 0;
		dollarAmount = 0;
		if (store.lastError === null) showToast(tradeToastMessage('buy', id, u, amt));
	}
	function handleSell() {
		if (!assetId || units <= 0) return;
		const id = assetId;
		const u = units;
		const amt = dollarAmount;
		store.sell(id, u);
		units = 0;
		dollarAmount = 0;
		if (store.lastError === null) showToast(tradeToastMessage('sell', id, u, amt));
	}
</script>

<Toast message={toastMessage} />

{#if assetId === null}
	<div class="text-term-text opacity-40 italic py-2 text-center">{emptyText}</div>
{:else}
	<div class="text-term-green font-bold mb-2">
		{assetLabel}
		<span class="text-term-text opacity-50 font-normal ml-1 text-[10px]">({assetId})</span>
	</div>

	<div class="space-y-1.5">
		<div class="flex items-center gap-2">
			<label for="trade-units-{assetId}" class="text-term-text opacity-50 shrink-0 w-20">Adet</label>
			<input
				type="number"
				min="0"
				id="trade-units-{assetId}"
				step="0.0001"
				bind:value={units}
				oninput={syncDollarFromUnits}
				class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
				       focus:outline-none focus:border-term-borderGlow text-xs w-full"
			/>
			<button type="button" onclick={maxUnits} class="shrink-0 {chipCls}">MAX</button>
			{#if heldUnitsSel > 0}
				<button type="button" onclick={allUnits} class="shrink-0 {chipCls}">TÜMÜ</button>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<label for="trade-dollars-{assetId}" class="text-term-text opacity-50 shrink-0 w-20">Tutar ($)</label>
			<input
				type="number"
				min="0"
				id="trade-dollars-{assetId}"
				step="1"
				bind:value={dollarAmount}
				oninput={syncUnitsFromDollar}
				class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
				       focus:outline-none focus:border-term-borderGlow text-xs w-full"
			/>
		</div>
	</div>

	<div class="flex gap-2 mt-1">
		<button
			type="button"
			onclick={handleBuy}
			class="flex-1 py-1.5 bg-term-bg border border-term-green text-term-green font-bold
			       hover:bg-term-panelLight glow-border-green transition-colors"
		>
			AL
		</button>
		<button
			type="button"
			onclick={handleSell}
			class="flex-1 py-1.5 bg-term-bg border border-term-red text-term-red font-bold
			       hover:bg-term-panelLight transition-colors"
		>
			SAT
		</button>
	</div>

	{#if store.lastError !== null}
		<div class="border border-term-red bg-term-bg px-3 py-2 text-term-red text-[11px] leading-snug mt-2">
			<span class="font-bold mr-1">HATA:</span>{store.lastError}
		</div>
	{/if}
{/if}
```

- [ ] **Step 2: Slim down TradePanel to use TradeForm**

```svelte
<!-- src/lib/components/TradePanel.svelte -->
<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import TradeForm from './TradeForm.svelte';

	interface Props {
		store: LiveGameStore;
		selectedAssetId: string | null;
	}
	let { store, selectedAssetId }: Props = $props();
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-4">
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		İŞLEM PANELI
	</div>

	<div class="space-y-2">
		<div class="text-term-text opacity-60 text-[10px] uppercase tracking-wider">Al / Sat</div>
		<div class="text-term-amber text-[10px] leading-relaxed">
			Tüm işlemler USD nakitten yapılır. BIST/altın/gümüş alımında kur otomatik takas edilir.
		</div>
		<TradeForm {store} assetId={selectedAssetId} emptyText="Soldan bir varlık seç" />
	</div>
</div>
```

- [ ] **Step 3: Verify build + existing tests still pass**

Run: `npm run test`
Expected: 347 test (mevcut) PASS — toast/trade davranışı bozulmadı.
Run: `npm run build`
Expected: derleme temiz (bilinen adapter-vercel EPERM dışında).

- [ ] **Step 4: Browser-verify trade still works (regression)**

Dev sunucu ayağa kaldır (`npm run dev -- --port 5173`), kayıtlı oyunla bir varlık seç → MAX → AL → toast çıkmalı, cüzdan güncellenmeli. (verify skill akışı; geçici script + screenshot, sonra temizle.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/TradeForm.svelte src/lib/components/TradePanel.svelte
git commit -m "refactor(trade): islem formunu TradeForm'a cikar (panel + pop-up paylasimi)"
```

---

## Task 6: `AssetPopover.svelte` — pop-up (grafik + periyot + bakiye + TradeForm)

**Files:**
- Create: `src/lib/components/AssetPopover.svelte`

**Interfaces:**
- Consumes: `LiveGameStore`, `PriceRow` (`$lib/stores/liveGameStore.svelte`); `PERIODS`, `type PeriodId`, `type PricePoint` (`$lib/domain/series/series`); `fetchPriceSeries` (`$lib/api/seriesClient`); `displayTry, displayUsd, dailyChangeBadge, heldUnits` (`./format`); `usd` (`$lib/domain/money`); `PriceChart`, `TradeForm`.
- Produces: `<AssetPopover {store} row={PriceRow} variant={'desktop'|'mobile'} onClose={() => void} />`. Kendi seri-fetch + periyot state'ini tutar. Masaüstü: anchor'a göre `+page` konumlandırır (bu bileşen yalnız içerik + kapsayıcı stilini verir). Mobil: tam-genişlik sheet.

- [ ] **Step 1: Implement component**

```svelte
<!-- src/lib/components/AssetPopover.svelte -->
<script lang="ts">
	import type { LiveGameStore, PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { PERIODS, type PeriodId, type PricePoint } from '$lib/domain/series/series';
	import { fetchPriceSeries } from '$lib/api/seriesClient';
	import { usd } from '$lib/domain/money';
	import { displayTry, displayUsd, dailyChangeBadge, heldUnits } from './format';
	import PriceChart from './chart/PriceChart.svelte';
	import TradeForm from './TradeForm.svelte';

	interface Props {
		store: LiveGameStore;
		row: PriceRow;
		variant?: 'desktop' | 'mobile';
		onClose: () => void;
	}
	let { store, row, variant = 'desktop', onClose }: Props = $props();

	let period = $state<PeriodId>('1G');
	let points = $state<PricePoint[]>([]);
	let loading = $state(false);

	// row.id + period değişince talep üzerine seri çek (yalnız bu sembol → ucuz).
	$effect(() => {
		const id = row.id;
		const src = row.source;
		const p = period;
		loading = true;
		let cancelled = false;
		fetchPriceSeries(id, src, p)
			.then((s) => { if (!cancelled) points = s; })
			.catch(() => { if (!cancelled) points = []; })
			.finally(() => { if (!cancelled) loading = false; });
		return () => { cancelled = true; };
	});

	const chg = $derived(dailyChangeBadge(row.changePct));
	const held = $derived(heldUnits(store.positions, row.id));
	const heldUsd = $derived(() => {
		const pos = store.positions.find((p) => p.assetId === row.id);
		return pos?.valueUsd;
	});
</script>

<div
	class="bg-term-panel border border-term-borderGlow font-mono text-xs p-3 space-y-2
	       {variant === 'mobile' ? 'w-full rounded-t-lg' : 'w-[300px] shadow-lg'}"
>
	<!-- Başlık + kapat -->
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
		<button
			type="button"
			onclick={onClose}
			class="shrink-0 text-term-text opacity-50 hover:opacity-100 px-1"
			aria-label="Kapat"
		>✕</button>
	</div>

	<!-- Grafik -->
	<div class="relative">
		<PriceChart {points} width={variant === 'mobile' ? 320 : 274} height={90} />
		{#if loading}
			<div class="absolute inset-0 flex items-center justify-center text-term-text opacity-40 text-[10px]">
				yükleniyor…
			</div>
		{/if}
	</div>

	<!-- Periyot düğmeleri -->
	<div class="flex gap-1">
		{#each PERIODS as p (p.id)}
			<button
				type="button"
				onclick={() => (period = p.id)}
				class="flex-1 py-0.5 text-[10px] border transition-colors
				       {period === p.id
					? 'border-term-green text-term-green bg-term-panelLight'
					: 'border-term-border text-term-text opacity-60 hover:opacity-100'}"
			>
				{p.label}
			</button>
		{/each}
	</div>

	<!-- Bakiye / pozisyon -->
	<div class="text-[10px] text-term-text opacity-70 border-t border-term-border pt-1">
		Bende: <span class="opacity-100 font-bold">{held.toFixed(4)}</span> adet
		{#if heldUsd() !== undefined} · {displayUsd(usd(heldUsd()!))}{/if}
	</div>

	<!-- Gerçek işlem -->
	<TradeForm {store} assetId={row.id} />
</div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: derleme temiz (adapter-vercel EPERM dışında).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/AssetPopover.svelte
git commit -m "feat(popover): grafik + periyot + bakiye + gercek islem pop-up icerigi"
```

---

## Task 7: Bağlama — 1 sn hover / mobil tap / pin / kapatma

**Files:**
- Modify: `src/lib/components/PriceRow.svelte`
- Modify: `src/lib/components/PriceList.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `AssetPopover` (`$lib/components/AssetPopover.svelte`); mevcut `store`, `PriceRow`.
- Produces: market satırından pop-up açma → `onOpenPopover(row: PriceRow, anchor: DOMRect, variant: 'desktop' | 'mobile')`; `+page` tek aktif pop-up + pin + dış-tık/Esc kapatma.

- [ ] **Step 1: PriceRow — 1 sn hover timer (masaüstü) + tap (mobil)**

`src/lib/components/PriceRow.svelte` script bloğuna `onOpenPopover` prop'u ve timer ekle; mevcut `onHover` (highlight) korunur.

Mevcut:
```svelte
	interface Props {
		row: PriceRow;
		onSelect: (id: string) => void;
		onHover?: (id: string | null) => void;
	}

	let { row, onSelect, onHover }: Props = $props();

	const hasPrice = $derived(row.priceTry !== undefined);
	// Fiyat henüz gelmediyse % rozeti de gizlenir ("—" + canlı rozet tutarsızlığı olmaz).
	const chg = $derived(hasPrice ? dailyChangeBadge(row.changePct) : null);
</script>

<button
	type="button"
	onclick={() => onSelect(row.id)}
	onmouseenter={() => onHover?.(row.id)}
	onmouseleave={() => onHover?.(null)}
	class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
	       hover:bg-term-panelLight hover:border-term-borderGlow
	       focus:outline-none focus:bg-term-panelLight
	       transition-colors duration-75 cursor-pointer {hasPrice ? '' : 'opacity-40'}"
>
```

Yeni:
```svelte
	interface Props {
		row: PriceRow;
		onSelect: (id: string) => void;
		onHover?: (id: string | null) => void;
		onOpenPopover?: (row: PriceRow, anchor: DOMRect, variant: 'desktop' | 'mobile') => void;
	}

	let { row, onSelect, onHover, onOpenPopover }: Props = $props();

	const hasPrice = $derived(row.priceTry !== undefined);
	// Fiyat henüz gelmediyse % rozeti de gizlenir ("—" + canlı rozet tutarsızlığı olmaz).
	const chg = $derived(hasPrice ? dailyChangeBadge(row.changePct) : null);

	let el: HTMLButtonElement | null = $state(null);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

	function handleEnter() {
		onHover?.(row.id);
		if (isMobile() || !el) return;
		// Masaüstü: 1 sn beklet → yanlışlıkla satır üstünden geçişte açılmaz.
		hoverTimer = setTimeout(() => onOpenPopover?.(row, el!.getBoundingClientRect(), 'desktop'), 1000);
	}
	function handleLeave() {
		onHover?.(null);
		if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
	}
	function handleClick() {
		if (isMobile() && el) {
			onOpenPopover?.(row, el.getBoundingClientRect(), 'mobile');
			return;
		}
		onSelect(row.id);
	}
</script>

<button
	type="button"
	bind:this={el}
	onclick={handleClick}
	onmouseenter={handleEnter}
	onmouseleave={handleLeave}
	class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
	       hover:bg-term-panelLight hover:border-term-borderGlow
	       focus:outline-none focus:bg-term-panelLight
	       transition-colors duration-75 cursor-pointer {hasPrice ? '' : 'opacity-40'}"
>
```

- [ ] **Step 2: PriceList — thread `onOpenPopover` to PriceRow**

`src/lib/components/PriceList.svelte`:

Props bloğu (mevcut `onHover` satırından sonra ekle):
```svelte
	interface Props {
		prices: PriceRowData[];
		onSelect: (id: string) => void;
		onAddBist: (symbol: string) => void;
		onHover?: (id: string | null) => void;
		onOpenPopover?: (row: PriceRowData, anchor: DOMRect, variant: 'desktop' | 'mobile') => void;
	}

	let { prices, onSelect, onAddBist, onHover, onOpenPopover }: Props = $props();
```

`PriceRow` kullanımı:
```svelte
				<PriceRow {row} {onSelect} {onHover} {onOpenPopover} />
```

- [ ] **Step 3: +page.svelte — pop-up state + pin + dış-tık/Esc + montaj**

`src/routes/+page.svelte`:

(a) `import` listesine ekle:
```svelte
	import AssetPopover from '$lib/components/AssetPopover.svelte';
	import type { PriceRow } from '$lib/stores/liveGameStore.svelte';
```

(b) state (mevcut `let hoveredAssetId` satırından sonra):
```svelte
	let popoverRow = $state<PriceRow | null>(null);
	let popoverAnchor = $state<DOMRect | null>(null);
	let popoverVariant = $state<'desktop' | 'mobile'>('desktop');
	let popoverPinned = $state(false);

	function openPopover(row: PriceRow, anchor: DOMRect, variant: 'desktop' | 'mobile') {
		popoverRow = row;
		popoverAnchor = anchor;
		popoverVariant = variant;
		popoverPinned = variant === 'mobile'; // mobil sheet zaten kalıcı; masaüstü tıklayınca pinlenir
	}
	function closePopover() {
		popoverRow = null;
		popoverPinned = false;
	}
	// Masaüstü: pop-up dışına çıkınca (ve pinli değilse) kapan.
	function onPopoverLeave() {
		if (!popoverPinned) closePopover();
	}
	// Pencere konumu kayınca anchor bayatlar → basitçe kapat.
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closePopover();
	}

	// Masaüstü konumlandırma: satırın sağına, ekran taşarsa soluna.
	const popoverStyle = $derived.by(() => {
		if (!popoverAnchor || popoverVariant === 'mobile') return '';
		const W = 300, GAP = 8;
		const a = popoverAnchor;
		const left = a.right + GAP + W > window.innerWidth ? a.left - GAP - W : a.right + GAP;
		const top = Math.min(a.top, window.innerHeight - 320);
		return `position:fixed;left:${Math.max(8, left)}px;top:${Math.max(8, top)}px;z-index:50;`;
	});
</script>

<svelte:window onkeydown={onKeydown} />
```
> NOT: `<svelte:window onkeydown>` zaten varsa, mevcut handler'a `onKeydown`'ı dahil et; ikinci bir `<svelte:window>` ekleme.

(c) PriceList'e `onOpenPopover` bağla:
```svelte
						<PriceList
							prices={store.prices}
							onSelect={handleSelectAsset}
							onHover={(id) => (hoveredAssetId = id)}
							onOpenPopover={openPopover}
							onAddBist={(symbol) => {
								store.addBist(symbol);
								handleSelectAsset(symbol);
							}}
						/>
```

(d) Pop-up montajı — ana `{:else}` (playing) bloğunun en sonuna, mevcut `{#if showCard ...}` ClosingCard bloğunun hemen öncesine ekle:
```svelte
		{#if popoverRow}
			{#if popoverVariant === 'mobile'}
				<!-- Mobil: arka örtü + alt sheet -->
				<button type="button" class="fixed inset-0 bg-black/50 z-40" aria-label="Kapat" onclick={closePopover}></button>
				<div class="fixed inset-x-0 bottom-0 z-50">
					<AssetPopover {store} row={popoverRow} variant="mobile" onClose={closePopover} />
				</div>
			{:else}
				<!-- Masaüstü: anchor'a konumlu, içine girince pinle, dışına çıkınca kapat -->
				<div
					style={popoverStyle}
					role="dialog"
					tabindex="-1"
					onmouseenter={() => (popoverPinned = true)}
					onmouseleave={onPopoverLeave}
				>
					<AssetPopover {store} row={popoverRow} variant="desktop" onClose={closePopover} />
				</div>
			{/if}
		{/if}
```

- [ ] **Step 4: Build + full test suite**

Run: `npm run test`
Expected: tüm testler PASS (yeni domain/api testleri + mevcut 347).
Run: `npm run build`
Expected: derleme temiz (adapter-vercel EPERM dışında).

- [ ] **Step 5: Browser verification (desktop + mobile)**

Dev sunucu ayağa kaldır. verify skill akışıyla, kayıtlı oyun enjekte ederek (Playwright):
- **Masaüstü (1280×900):** bir satırın üstüne gel → ~1 sn sonra pop-up açılmalı; grafik çizilmeli; periyot düğmesine bas → grafik değişmeli; pop-up içine gir, MAX → AL → toast + cüzdan güncellenmeli; dışına tıkla/Esc → kapanmalı. (Üstünden hızlı geçişte <1 sn açılmadığını da gözle.)
- **Mobil (390×844):** bir satıra dokun → alt sheet açılmalı; işlem yapılabilmeli; örtüye dokun/✕ → kapanmalı.
- Screenshot'larla kanıtla, geçici dosyaları temizle.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/PriceRow.svelte src/lib/components/PriceList.svelte src/routes/+page.svelte
git commit -m "feat(popover): market satirindan 1sn hover/tap ile pop-up acma + pin/kapatma"
```

---

## Self-Review Notları (plan yazarı)

- **Spec kapsamı:** veri katmanı (T1-3), grafik (T4), TradeForm paylaşımı (T5), pop-up içeriği (T6), tetik/pin/mobil (T7) — spec'teki tüm bölümler bir göreve eşleniyor. ✅
- **Tip tutarlılığı:** `PricePoint`/`PeriodId` T1'de tanımlı, T2/T3/T4/T6'da aynı imzayla tüketiliyor; `source: 'crypto'|'yahoo'` `PriceRow`'dan (mevcut) geliyor; `fetchPriceSeries` imzası T3↔T6 eşleşiyor; `TradeForm` `assetId` prop'u T5↔T6 eşleşiyor. ✅
- **Mevcut davranış korunur:** T5 toast/hata bandı/oto-takas mantığını birebir taşır; mevcut 347 test yeşil kalmalı (regresyon kapısı T5 Step 3). `onHover` highlight (önceki iş) T7'de korunur. ✅
- **Risk/teyit:** PriceChart renkleri `--color-term-*` CSS değişkenine bağlı; değişken yoksa fallback hex devreye girer (T4 notu) ve T7 tarayıcı doğrulamasında teyit edilir.
