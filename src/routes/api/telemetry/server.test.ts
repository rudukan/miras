import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from './+server';
import type { RequestEvent } from './$types';

function fakeSupabase(insertError: { message: string } | null = null) {
  const insert = vi.fn(() => Promise.resolve({ error: insertError }));
  return { insert, client: { from: () => ({ insert }) } };
}

function postReq(
  body: unknown,
  opts: { origin?: string | null; supabase?: unknown } = {},
): RequestEvent {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const origin = opts.origin === undefined ? 'http://localhost' : opts.origin;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin !== null) headers.origin = origin;
  return {
    request: new Request('http://localhost/api/telemetry', {
      method: 'POST',
      body: rawBody,
      headers,
    }),
    url: new URL('http://localhost/api/telemetry'),
    locals: { supabase: opts.supabase ?? fakeSupabase().client },
  } as unknown as RequestEvent;
}

const VALID = { playerId: 'p1', event: 'visit', tsISO: new Date().toISOString() };

afterEach(() => {
  delete process.env.TELEMETRY_WEBHOOK_URL;
  vi.restoreAllMocks();
});

describe('POST /api/telemetry', () => {
  it('geçerli payload (visit) → 204', async () => {
    const res = await POST(postReq(VALID));
    expect(res.status).toBe(204);
  });

  it('geçerli payload (share_click/share_done) → 204', async () => {
    expect((await POST(postReq({ ...VALID, event: 'share_click' }))).status).toBe(204);
    expect((await POST(postReq({ ...VALID, event: 'share_done' }))).status).toBe(204);
  });

  it('geçerli payload (first_trade) → 204', async () => {
    expect((await POST(postReq({ ...VALID, event: 'first_trade' }))).status).toBe(204);
  });

  it('şema dışı event → 400', async () => {
    const res = await POST(postReq({ ...VALID, event: 'bogus' }));
    expect(res.status).toBe(400);
  });

  it('eksik alan → 400', async () => {
    const res = await POST(postReq({ playerId: 'p1' }));
    expect(res.status).toBe(400);
  });

  it('geçersiz tsISO → 400', async () => {
    const res = await POST(postReq({ ...VALID, tsISO: 'not-a-date' }));
    expect(res.status).toBe(400);
  });

  it('bozuk JSON → 400', async () => {
    const res = await POST(postReq('{bozuk'));
    expect(res.status).toBe(400);
  });

  it('webhook env yokken fetch çağrılmaz', async () => {
    const fetchMock = vi.fn();
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await POST(postReq(VALID));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = real;
    }
  });

  it('webhook env varsa fire-and-forget POST gönderir (await edilmez, hata yutulur)', async () => {
    process.env.TELEMETRY_WEBHOOK_URL = 'https://discord.example/webhook';
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const res = await POST(postReq(VALID));
      expect(res.status).toBe(204);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledWith(
        'https://discord.example/webhook',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      globalThis.fetch = real;
    }
  });

  it('mention/markdown içeren playerId → 400 (Discord relay enjeksiyonu kapalı)', async () => {
    expect((await POST(postReq({ ...VALID, playerId: '@everyone' }))).status).toBe(400);
    expect((await POST(postReq({ ...VALID, playerId: '`nuke`' }))).status).toBe(400);
    expect((await POST(postReq({ ...VALID, playerId: 'a\nb' }))).status).toBe(400);
  });

  it('aşırı uzun playerId → 400', async () => {
    expect((await POST(postReq({ ...VALID, playerId: 'x'.repeat(65) }))).status).toBe(400);
  });

  it('gerçek UUID playerId → 204', async () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect((await POST(postReq({ ...VALID, playerId: uuid }))).status).toBe(204);
  });

  it('webhook body allowed_mentions.parse boş dizi içerir', async () => {
    process.env.TELEMETRY_WEBHOOK_URL = 'https://discord.example/webhook';
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await POST(postReq(VALID));
      await new Promise((r) => setTimeout(r, 0));
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.allowed_mentions).toEqual({ parse: [] });
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('CSRF guard + DB insert (migration 0006)', () => {
  it('origin uyuşmaz → 403', async () => {
    const res = await POST(postReq(VALID, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });

  it('origin header yoksa (null) → 403', async () => {
    const res = await POST(postReq(VALID, { origin: null }));
    expect(res.status).toBe(403);
  });

  it('geçerli payload → locals.supabase.insert player_id/event/ts ile çağrılır (received_at/id YOK)', async () => {
    const { insert, client } = fakeSupabase();
    const res = await POST(postReq(VALID, { supabase: client }));
    expect(res.status).toBe(204);
    expect(insert).toHaveBeenCalledWith({ player_id: 'p1', event: 'visit', ts: VALID.tsISO });
  });

  it('insert hatası yutulur — endpoint yine 204 döner', async () => {
    const { client } = fakeSupabase({ message: 'db down' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(postReq(VALID, { supabase: client }));
    expect(res.status).toBe(204);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
