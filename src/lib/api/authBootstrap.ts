/**
 * Ilk acilista sessiz misafir oturumu (spec §5). Turnstile token'i anonim
 * girise eklenir (spec §6 — anon hesap spam koruması). Supabase client'inin
 * yalniz auth alt-kumesine bagimliyiz ki unit test fake ile yazilabilsin.
 */
export interface AuthLike {
  getSession(): Promise<{ data: { session: object | null } }>;
  signInAnonymously(opts: { options: { captchaToken: string } }): Promise<{ error: Error | null }>;
}

export async function ensureSession(
  auth: AuthLike,
  getCaptchaToken: () => Promise<string>,
): Promise<void> {
  const {
    data: { session },
  } = await auth.getSession();
  if (session) return;
  const captchaToken = await getCaptchaToken();
  const { error } = await auth.signInAnonymously({ options: { captchaToken } });
  if (error) throw error;
}
