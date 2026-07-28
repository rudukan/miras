import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server';
import type { RequestEvent } from './$types';

/** SvelteKit `error()` fırlatır (telemetry'nin aksine Response DÖNMEZ) — status'u
 *  yakalayıp doğrulamak için. auth/confirm/server.test.ts'teki redirect emsalinin eşleniği. */
async function expectStatus(p: unknown, status: number): Promise<string> {
	try {
		await p;
		expect.unreachable(`${status} fırlatmalıydı`);
	} catch (e) {
		expect((e as { status: number }).status).toBe(status);
		return (e as { body?: { message?: string } }).body?.message ?? '';
	}
}

const SESSION_USER = { id: 'user-abc' };

function makeEvent(
	body: unknown,
	opts: {
		origin?: string | null;
		user?: { id: string } | null;
		dbError?: { code?: string; message: string } | null;
	} = {},
) {
	const origin = opts.origin === undefined ? 'http://localhost' : opts.origin;
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (origin !== null) headers.origin = origin;
	const upsert = vi.fn(() => Promise.resolve({ error: opts.dbError ?? null }));
	const user = opts.user === undefined ? SESSION_USER : opts.user;
	const event = {
		request: new Request('http://localhost/api/profile', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body),
			headers,
		}),
		url: new URL('http://localhost/api/profile'),
		locals: {
			safeGetSession: () => Promise.resolve({ user }),
			supabase: { from: () => ({ upsert }) },
		},
	} as unknown as RequestEvent;
	return { event, upsert };
}

describe('POST /api/profile — kapı kontrolleri', () => {
	it('origin uyuşmaz → 403', async () => {
		const { event, upsert } = makeEvent({ nickname: 'durukan' }, { origin: 'https://evil.example' });
		await expectStatus(POST(event), 403);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('origin header yoksa → 403', async () => {
		const { event } = makeEvent({ nickname: 'durukan' }, { origin: null });
		await expectStatus(POST(event), 403);
	});

	it('oturum yoksa → 401 (CSRF kapısından SONRA)', async () => {
		const { event, upsert } = makeEvent({ nickname: 'durukan' }, { user: null });
		await expectStatus(POST(event), 401);
		expect(upsert).not.toHaveBeenCalled();
	});
});

describe('POST /api/profile — girdi doğrulama sunucuda da koşar', () => {
	it('çok kısa takma ad → 400, kullanıcı dostu mesajla', async () => {
		const { event, upsert } = makeEvent({ nickname: 'ab' });
		const msg = await expectStatus(POST(event), 400);
		expect(msg).toBe('Takma ad 3-20 karakter olmalı');
		expect(upsert).not.toHaveBeenCalled();
	});

	it('boşluklu/biçimsiz takma ad → 400', async () => {
		const msg = await expectStatus(POST(makeEvent({ nickname: 'ali veli' }).event), 400);
		expect(msg).toBe('Yalnız harf, rakam ve alt çizgi kullanılabilir');
	});

	it('küfür blocklist TR-normalize ile yakalanır → 400', async () => {
		await expectStatus(POST(makeEvent({ nickname: 'SaLaK123' }).event), 400);
		await expectStatus(POST(makeEvent({ nickname: 'gerizekali' }).event), 400);
	});

	it('nickname alanı yok / string değil → 400 (çökmez)', async () => {
		await expectStatus(POST(makeEvent({}).event), 400);
		await expectStatus(POST(makeEvent({ nickname: 42 }).event), 400);
		await expectStatus(POST(makeEvent({ nickname: null }).event), 400);
	});

	it('bozuk JSON → 400 (çökmez)', async () => {
		await expectStatus(POST(makeEvent('{bozuk').event), 400);
	});
});

describe('POST /api/profile — yazma', () => {
	it('geçerli ad → upsert OTURUMDAKİ kullanıcının id sine yazar, gövdeden id alınmaz', async () => {
		const { event, upsert } = makeEvent({ nickname: 'durukan', id: 'baskasinin-idsi' });
		const res = await POST(event);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, nickname: 'durukan' });
		expect(upsert).toHaveBeenCalledWith({ id: 'user-abc', nickname: 'durukan' });
	});

	it('baştaki/sondaki boşluk kırpılarak yazılır', async () => {
		const { event, upsert } = makeEvent({ nickname: '  durukan  ' });
		await POST(event);
		expect(upsert).toHaveBeenCalledWith({ id: 'user-abc', nickname: 'durukan' });
	});

	it('takma ad çakışması (23505) → 409', async () => {
		const { event } = makeEvent({ nickname: 'durukan' }, { dbError: { code: '23505', message: 'dup' } });
		const msg = await expectStatus(POST(event), 409);
		expect(msg).toBe('Bu takma ad alınmış');
	});

	it('diğer DB hatası → 500', async () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { event } = makeEvent({ nickname: 'durukan' }, { dbError: { code: '42501', message: 'rls' } });
		await expectStatus(POST(event), 500);
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});
});
