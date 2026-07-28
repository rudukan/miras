import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from './$types';

// Admin client (SUPABASE_SECRET_KEY ile) gerçekten kurulmasın — projedeki TEK secret-key
// kullanımı burası, testte ağa/DB'ye çıkmamalı.
const { deleteUser, createClientSpy } = vi.hoisted(() => {
	const deleteUser = vi.fn(() => Promise.resolve({ error: null as { message: string } | null }));
	const createClientSpy = vi.fn(() => ({ auth: { admin: { deleteUser } } }));
	return { deleteUser, createClientSpy };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientSpy }));

const { POST } = await import('./+server');

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
	opts: { origin?: string | null; user?: { id: string } | null; body?: unknown } = {},
): RequestEvent {
	const origin = opts.origin === undefined ? 'http://localhost' : opts.origin;
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (origin !== null) headers.origin = origin;
	return {
		request: new Request('http://localhost/api/account/delete', {
			method: 'POST',
			body: JSON.stringify(opts.body ?? {}),
			headers,
		}),
		url: new URL('http://localhost/api/account/delete'),
		locals: {
			safeGetSession: () =>
				Promise.resolve({ user: opts.user === undefined ? SESSION_USER : opts.user }),
		},
	} as unknown as RequestEvent;
}

beforeEach(() => {
	deleteUser.mockClear();
	createClientSpy.mockClear();
	deleteUser.mockResolvedValue({ error: null });
});

describe('POST /api/account/delete — kapılar (secret key ASLA yetkisiz yolda kullanılmaz)', () => {
	it('origin uyuşmaz → 403, admin client hiç KURULMAZ', async () => {
		await expectStatus(POST(makeEvent({ origin: 'https://evil.example' })), 403);
		expect(createClientSpy).not.toHaveBeenCalled();
		expect(deleteUser).not.toHaveBeenCalled();
	});

	it('origin header yoksa → 403', async () => {
		await expectStatus(POST(makeEvent({ origin: null })), 403);
		expect(deleteUser).not.toHaveBeenCalled();
	});

	it('oturum yoksa → 401, admin client hiç KURULMAZ', async () => {
		await expectStatus(POST(makeEvent({ user: null })), 401);
		expect(createClientSpy).not.toHaveBeenCalled();
		expect(deleteUser).not.toHaveBeenCalled();
	});
});

describe('POST /api/account/delete — silme', () => {
	it('YALNIZ oturumdaki kullanıcıyı siler — gövdeden gelen id yok sayılır', async () => {
		const res = await POST(makeEvent({ body: { id: 'kurbanin-idsi', userId: 'kurbanin-idsi' } }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(deleteUser).toHaveBeenCalledWith('user-abc');
	});

	it('tek çağrı yapar (çift silme yok)', async () => {
		await POST(makeEvent());
		expect(deleteUser).toHaveBeenCalledTimes(1);
	});

	it('silme hatası → 500, sessizce başarılı DÖNMEZ', async () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		deleteUser.mockResolvedValue({ error: { message: 'admin api down' } });
		const msg = await expectStatus(POST(makeEvent()), 500);
		expect(msg).toBe('Hesap silinemedi');
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});
});
