import { createClient } from '@supabase/supabase-js';
import { supabaseEnv, SUPABASE_URL } from './stack';

/** Service-role client — YALNIZ test seed'i için, YALNIZ lokal stack'e karşı.
 *  (CLAUDE.md "yeni server-side client yaratma" kuralı uygulama koduna aittir;
 *  test harness'i uygulama değildir.) */
function adminClient() {
  const { serviceRoleKey } = supabaseEnv();
  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Doğrulanmış (email_confirm) kullanıcı üretir — giriş/reset testlerinin başlangıç durumu. */
export async function seedConfirmedUser(): Promise<{ email: string; password: string }> {
  const email = `e2e-seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'e2e-Sifre-123';
  const { error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`test kullanıcısı üretilemedi: ${error.message}`);
  return { email, password };
}

/** saves satırını service-role ile (RLS bypass) okur — Task 4: çıkış sonrası "request gitti"
 *  değil "veri gerçekten kalıcı" kanıtı için fresh select. Satır yoksa/birden fazlaysa throw eder. */
export async function getSaveRow(userId: string): Promise<{ payload: unknown }> {
  const { data, error } = await adminClient()
    .from('saves')
    .select('payload')
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`saves satırı okunamadı (user_id=${userId}): ${error.message}`);
  return data;
}
