import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from './+server';
import type { RequestEvent } from './$types';

function postReq(body: unknown): RequestEvent {
  return {
    request: new Request('http://localhost/api/telemetry', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
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
    const req = {
      request: new Request('http://localhost/api/telemetry', { method: 'POST', body: '{bozuk' }),
    } as unknown as RequestEvent;
    const res = await POST(req);
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
});
