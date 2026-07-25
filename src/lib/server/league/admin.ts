/**
 * service_role Supabase client'i. `trades` tablosuna `authenticated` INSERT yetkisi
 * BİLİNÇLİ olarak verilmiyor (hile korumasının çekirdeği) — o yüzden lig yazımları
 * bu client'tan geçer. CLAUDE.md'nin "hep locals.supabase" kuralından planda belgeli
 * esnetme; emsali `src/routes/api/account/delete/+server.ts`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { SUPABASE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export function createAdminClient(): SupabaseClient {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Vercel serverless'te native WebSocket yok; RealtimeClient constructor'da eagerly
    // kuruluyor ve transport verilmezse tüm rota 500 döner (SP1 dersi).
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}
