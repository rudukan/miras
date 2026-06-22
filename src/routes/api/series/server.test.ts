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
