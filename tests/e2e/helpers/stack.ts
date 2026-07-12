import { execSync } from 'node:child_process';

export const SUPABASE_URL = 'http://127.0.0.1:54321';
export const MAILPIT_URL = 'http://127.0.0.1:54324';
export const PORT = 5199;
export const BASE_URL = `http://localhost:${PORT}`;

let cached: { anonKey: string; serviceRoleKey: string } | null = null;

/** Lokal Supabase stack'inden anahtarları okur. Stack kapalıysa anlaşılır hata verir.
 *  Prod'a karşı koşmak BY DESIGN imkânsız — URL'ler bu dosyada 127.0.0.1'e sabit. */
export function supabaseEnv(): { anonKey: string; serviceRoleKey: string } {
  if (cached) return cached;
  let out: string;
  try {
    out = execSync('npx supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('Lokal Supabase kapalı görünüyor — önce `npx supabase start` çalıştır.');
  }
  const get = (name: string): string => {
    const m = out.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?`, 'm'));
    if (!m) throw new Error(`\`supabase status -o env\` çıktısında ${name} yok — CLI sürümü isimleri değiştirmiş olabilir`);
    return m[1];
  };
  cached = { anonKey: get('ANON_KEY'), serviceRoleKey: get('SERVICE_ROLE_KEY') };
  return cached;
}
