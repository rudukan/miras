import { describe, it, expect, vi } from 'vitest';
import { GET } from './+server';

function call(url: string, exchangeResult: { error: Error | null }) {
  const exchange = vi.fn().mockResolvedValue(exchangeResult);
  const event = {
    url: new URL(url),
    locals: { supabase: { auth: { exchangeCodeForSession: exchange } } },
  } as any;
  return { event, exchange };
}
async function expectRedirect(p: Promise<unknown>, location: string) {
  try {
    await p;
    expect.unreachable('redirect fırlatmalıydı');
  } catch (e) {
    expect((e as { status: number }).status).toBe(303);
    expect((e as { location: string }).location).toBe(location);
  }
}

describe('GET /auth/callback', () => {
  it('code takası başarılı → 303 /', async () => {
    const { event, exchange } = call('http://localhost/auth/callback?code=abc', { error: null });
    await expectRedirect(GET(event), '/');
    expect(exchange).toHaveBeenCalledWith('abc');
  });
  it('takas hatası → 303 /?auth_error=1', async () => {
    const { event } = call('http://localhost/auth/callback?code=abc', { error: new Error('bad') });
    await expectRedirect(GET(event), '/?auth_error=1');
  });
  it('code yok (kullanıcı vazgeçti / ?error döndü) → 303 /?auth_error=1', async () => {
    const { event, exchange } = call('http://localhost/auth/callback?error=access_denied', { error: null });
    await expectRedirect(GET(event), '/?auth_error=1');
    expect(exchange).not.toHaveBeenCalled();
  });
});
