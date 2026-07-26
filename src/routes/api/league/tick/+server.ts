import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { createAdminClient } from '$lib/server/league/admin';
import { leagueWeekKey, leagueWeekStart, leagueLockMoment } from '$lib/domain/league/week';

/** Zamanlayıcı kimliği. Sır yapılandırılmamışsa (boş) DAİMA reddeder — açık kapı bırakmaz. */
export function _authorizeTick(header: string | null, secret: string): boolean {
  if (secret.length === 0 || header === null) return false;
  if (header.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= header.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export interface WeekRow {
  week_key: string;
  opens_at: string;
  locks_at: string;
}

/** Verilen anın ait olduğu hafta için `leagues` satırı. */
export function _weekRowFor(at: Date): WeekRow {
  const weekKey = leagueWeekKey(at);
  return {
    week_key: weekKey,
    opens_at: leagueWeekStart(at).toISOString(),
    locks_at: leagueLockMoment(weekKey).toISOString(),
  };
}

export const POST: RequestHandler = async ({ request }) => {
  if (!_authorizeTick(request.headers.get('x-cron-secret'), CRON_SECRET)) error(401, 'Yetkisiz');

  const at = new Date();
  const admin = createAdminClient();

  // 1) Hafta aç — idempotent: week_key unique, çakışma yok sayılır.
  const row = _weekRowFor(at);
  const { error: openError } = await admin
    .from('leagues')
    .upsert(row, { onConflict: 'week_key', ignoreDuplicates: true });
  if (openError) {
    console.error('[api/league/tick] hafta açma hatası', openError);
    error(500, 'Hafta açılamadı');
  }

  return json({ opened: row.week_key, settled: 0, closed: null });
};
