import { describe, it, expect, vi } from 'vitest';
import { GET } from './+server';

function call(url: string, verifyResult: { error: Error | null }) {
  const verifyOtp = vi.fn().mockResolvedValue(verifyResult);
  const event = { url: new URL(url), locals: { supabase: { auth: { verifyOtp } } } } as any;
  return { event, verifyOtp };
}
async function expectRedirect(p: Promise<unknown> | Response, location: string) {
  try {
    await p;
    expect.unreachable('redirect fırlatmalıydı');
  } catch (e) {
    expect((e as { status: number }).status).toBe(303);
    expect((e as { location: string }).location).toBe(location);
  }
}

describe('GET /auth/confirm', () => {
  it('recovery doğrulaması → /?pw_reset=1', async () => {
    const { event, verifyOtp } = call('http://x/auth/confirm?token_hash=th&type=recovery', { error: null });
    await expectRedirect(GET(event), '/?pw_reset=1');
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'recovery' });
  });
  it('email doğrulaması → /', async () => {
    const { event } = call('http://x/auth/confirm?token_hash=th&type=email', { error: null });
    await expectRedirect(GET(event), '/');
  });
  it('verifyOtp hatası ya da eksik parametre → /?auth_error=1', async () => {
    const bad = call('http://x/auth/confirm?token_hash=th&type=email', { error: new Error('expired') });
    await expectRedirect(GET(bad.event), '/?auth_error=1');
    const missing = call('http://x/auth/confirm?type=email', { error: null });
    await expectRedirect(GET(missing.event), '/?auth_error=1');
    expect(missing.verifyOtp).not.toHaveBeenCalled();
  });
});
