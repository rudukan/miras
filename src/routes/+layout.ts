import { createBrowserClient } from '@supabase/ssr';
import { browser } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, depends }) => {
  depends('supabase:auth');
  // Bu universal load() SSR sirasinda sunucuda da calisir (createBrowserClient adina ragmen).
  // Gercek tarayicida native WebSocket var; sunucuda yok - RealtimeClient (hic kullanmadigimiz
  // halde constructor'da eagerly kuruluyor) crash eder. Yalniz sunucu tarafinda ws transport'u
  // ver (bkz. hooks.server.ts'teki ayni fix); tarayici bundle'ina 'ws' hic girmesin.
  const realtime = browser ? undefined : { transport: (await import('ws')).WebSocket as unknown as typeof WebSocket };
  const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch },
    ...(realtime ? { realtime } : {}),
  });
  return { supabase };
};
