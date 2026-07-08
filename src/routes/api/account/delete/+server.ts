import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { SUPABASE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

// KVKK hesap silme (spec §7): auth.users satiri silinir; profiles/saves
// "on delete cascade" FK'lariyla otomatik gider. Secret key YALNIZ burada,
// kimligi dogrulanmis kullanicinin KENDI hesabi icin kullanilir.
export const POST: RequestHandler = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) error(401, 'Oturum gerekli');

  const admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Bu route her zaman sunucuda calisir (native WebSocket yok, bkz. hooks.server.ts'teki
    // ayni fix); RealtimeClient hic kullanilmasa da constructor'da eagerly kuruluyor.
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    console.error('[api/account/delete] silme hatası', delError);
    error(500, 'Hesap silinemedi');
  }
  return json({ ok: true });
};
