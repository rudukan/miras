import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { EmailOtpType } from '@supabase/supabase-js';

// E-posta linkleri (dogrulama + sifre kurtarma, spec §4.J): token_hash SUNUCUDA dogrulanir.
// Mail sablonlari bu rotaya isaret eder (Task 14). Hedefler SABIT — open-redirect yok.
export const GET: RequestHandler = async ({ url, locals }) => {
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  if (token_hash && type) {
    const { error } = await locals.supabase.auth.verifyOtp({ token_hash, type });
    if (!error) redirect(303, type === 'recovery' ? '/?pw_reset=1' : '/');
  }
  redirect(303, '/?auth_error=1');
};
