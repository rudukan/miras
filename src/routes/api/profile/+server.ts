import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateNickname } from '$lib/domain/nickname/nickname';
import { isSameOrigin } from '$lib/server/csrf';

// Takma ad client'tan dogrudan tabloya yazilmaz: filtre sunucuda da kosar
// (defense in depth), insert kullanicinin KENDI JWT'siyle yapilir — RLS gecerli kalir.
export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (!isSameOrigin(request.headers.get('origin'), url.origin)) error(403, 'Geçersiz kaynak');
  const { user } = await locals.safeGetSession();
  if (!user) error(401, 'Oturum gerekli');

  const body = (await request.json().catch(() => null)) as { nickname?: unknown } | null;
  const raw = typeof body?.nickname === 'string' ? body.nickname : '';
  const verdict = validateNickname(raw);
  if (!verdict.ok) error(400, verdict.reason);

  const { error: dbError } = await locals.supabase
    .from('profiles')
    .upsert({ id: user.id, nickname: verdict.value });
  if (dbError) {
    if (dbError.code === '23505') error(409, 'Bu takma ad alınmış');
    console.error('[api/profile] upsert hatası', dbError);
    error(500, 'Profil kaydedilemedi');
  }
  return json({ ok: true, nickname: verdict.value });
};
