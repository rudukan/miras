import { describe, it, expect } from 'vitest';
import { handle } from './hooks.server';
import type { RequestEvent } from '@sveltejs/kit';

function mockEvent(): RequestEvent {
  return {
    cookies: { getAll: () => [], set: () => {} },
    locals: {},
    request: new Request('http://localhost/'),
  } as unknown as RequestEvent;
}

// resolve() gövdeyi döndürür; hook'un üstüne başlık eklemesi beklenir.
const resolve = (async () =>
  new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })) as unknown as Parameters<
  typeof handle
>[0]['resolve'];

describe('handle — güvenlik başlıkları', () => {
  it('yanıta clickjacking + derinlemesine savunma başlıklarını ekler', async () => {
    const res = await handle({ event: mockEvent(), resolve });

    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toBeTruthy();
  });

  it('gövdeyi ve içerik tipini korur (yalnız başlık ekler)', async () => {
    const res = await handle({ event: mockEvent(), resolve });
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toContain('<!doctype html>');
  });
});
