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

describe('fetchSeries — 15D gercekten dilimler', () => {
	it('1d/1m yanitindan son 15 dakikayi alir, eskileri atar', async () => {
		const fetchFn = vi.fn(async () =>
			resp({
				chart: {
					result: [
						{
							// saniye cinsinden: 0, 5, 10, 15, 20 dakika
							timestamp: [0, 300, 600, 900, 1200],
							indicators: { quote: [{ close: [10, 11, 12, 13, 14] }] },
						},
					],
				},
			}),
		) as unknown as typeof fetch;
		const out = await fetchSeries('THYAO', 'yahoo', '15D', fetchFn);
		// son noktadan (t=1200000ms) geriye 15dk (900000ms) penceresi: t=0 (300000ms'den eski) atilir.
		expect(out).toEqual([
			{ t: 300_000, price: 11 },
			{ t: 600_000, price: 12 },
			{ t: 900_000, price: 13 },
			{ t: 1_200_000, price: 14 },
		]);
	});
});

describe('fetchSeries — HTTP hata yollari', () => {
	it('Yahoo HTTP hatasi -> symbol+status iceren throw', async () => {
		const fetchFn = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
		await expect(fetchSeries('THYAO', 'yahoo', '1G', fetchFn)).rejects.toThrow('Yahoo THYAO.IS: HTTP 500');
	});
	it('Binance HTTP hatasi -> symbol+status iceren throw', async () => {
		const fetchFn = vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
		await expect(fetchSeries('BTC', 'crypto', '1G', fetchFn)).rejects.toThrow('Binance BTCUSDT: HTTP 404');
	});
});
