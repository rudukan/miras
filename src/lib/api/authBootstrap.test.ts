import { describe, it, expect, vi } from 'vitest';
import { ensureSession } from './authBootstrap';

function makeAuth(session: object | null) {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session } }),
    signInAnonymously: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe('ensureSession', () => {
  it('oturum varsa captcha/signIn hiç çağrılmaz', async () => {
    const auth = makeAuth({ user: {} });
    const getToken = vi.fn();
    await ensureSession(auth, getToken);
    expect(getToken).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('oturum yoksa captcha token alıp anonim giriş yapar', async () => {
    const auth = makeAuth(null);
    const getToken = vi.fn().mockResolvedValue('tok-123');
    await ensureSession(auth, getToken);
    expect(auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'tok-123' } });
  });

  it('signIn hatası fırlatılır (çağıran karar verir)', async () => {
    const auth = makeAuth(null);
    auth.signInAnonymously.mockResolvedValue({ error: new Error('captcha fail') });
    await expect(ensureSession(auth, async () => 't')).rejects.toThrow('captcha fail');
  });
});
