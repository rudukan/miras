import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { WebSocket } from 'ws';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: '/' });
        });
      },
    },
    // Bu uygulama realtime kullanmiyor (SP1 kapsam disi); ama SupabaseClient
    // constructor'i her zaman bir RealtimeClient kuruyor, o da native WebSocket
    // arayip bulamayinca (Vercel'in bazi Node serverless ortamlarinda gorulen bir
    // durum) tum istekleri 500'letiyordu. transport hicbir zaman baglanmiyor,
    // yalnizca crash'i onlemek icin veriliyor.
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });

  // Guvenlik kurali (spec §6): sunucuda kimlik dogrulamasi getUser() ile yapilir;
  // getSession() sunucuda JWT imzasini dogrulamaz, tek basina yetkilendirmede kullanilmaz.
  event.locals.safeGetSession = async () => {
    const {
      data: { user },
      error,
    } = await event.locals.supabase.auth.getUser();
    if (error || !user) return { session: null, user: null };
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession();
    return { session, user };
  };

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    },
  });
};
