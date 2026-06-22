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
