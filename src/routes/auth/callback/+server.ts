import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// OAuth/PKCE donusu (spec §4.C): takas SUNUCUDA, locals.supabase ile (ws-transport'lu,
// yeni client yaratma). Hedef SABIT '/' — kullanici-kontrollu redirect yok (open-redirect kapali).
export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(303, '/');
  }
  redirect(303, '/?auth_error=1');
};
