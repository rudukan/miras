import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { createAdminClient } from '$lib/server/league/admin';
import { leagueWeekKey, leagueWeekStart, leagueLockMoment } from '$lib/domain/league/week';
import { stampPrices, type StampedPrice } from '$lib/server/league/prices';
import { replayTrades, type StampedTrade } from '$lib/domain/league/replay';
import { buyAsset, sellAsset, type GameState } from '$lib/stores/gameState';
import { usd } from '$lib/domain/money';

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

export interface PendingRow {
  asset_id: string;
  side: 'buy' | 'sell';
  units: number | null;
  amount_usd: number | null;
}

export type SettleAction =
  | { action: 'fill'; units: number; priceUsd: number }
  | { action: 'wait' }
  | { action: 'cancel'; reason: string };

/** Bekleyen emrin bu turdaki kaderi. İstemcideki `settlePendingOrders` ile AYNI semantik:
 *  taze fiyat yoksa bekle; varsa dene; reducer reddederse iptal (kuyrukta sonsuza kalmaz). */
export function _settleDecision(
  order: PendingRow,
  stamped: StampedPrice | undefined,
  state: GameState,
): SettleAction {
  if (stamped === undefined || !stamped.fresh) return { action: 'wait' };
  const priceUsd = stamped.priceUsd;
  const units =
    order.units ?? Math.floor((Number(order.amount_usd) / priceUsd) * 1e4) / 1e4;
  if (!(units > 0)) return { action: 'cancel', reason: 'Tutar bu fiyatta işleme yetmiyor' };
  const oracle = { assetUsd: () => usd(priceUsd) };
  try {
    if (order.side === 'buy') buyAsset(state, oracle, order.asset_id, units);
    else sellAsset(state, oracle, order.asset_id, units);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { action: 'cancel', reason: msg.includes('units') ? 'Yetersiz pozisyon' : 'Yetersiz bakiye' };
  }
  return { action: 'fill', units, priceUsd };
}

export const POST: RequestHandler = async ({ request, fetch }) => {
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

  // 2) Bekleyen emirleri settle et. Erken çıkış: bekleyen yoksa upstream fiyat çekilmez
  //    (tick 5 dakikada bir koşuyor — boş turlar tek ucuz DB sorgusuna iner).
  let settled = 0;
  const { data: openLeague } = await admin
    .from('leagues')
    .select('id, week_key, opens_at')
    .eq('week_key', row.week_key)
    .maybeSingle();

  if (openLeague) {
    const { data: pending } = await admin
      .from('trades')
      .select('id, user_id, asset_id, side, units, amount_usd')
      .eq('league_id', openLeague.id)
      .eq('status', 'pending');

    if (pending && pending.length > 0) {
      const prices = await stampPrices(
        pending.map((p) => p.asset_id as string),
        fetch,
        at,
      );
      const startedAt = Date.parse(openLeague.opens_at as string);
      // Kullanıcı başına gruplanır: her emir, aynı kullanıcının o ana kadarki state'i
      // üstünde denenir (aynı turda dolan emirler birbirini etkiler).
      const byUser = new Map<string, typeof pending>();
      for (const p of pending) {
        const list = byUser.get(p.user_id as string) ?? [];
        list.push(p);
        byUser.set(p.user_id as string, list);
      }

      for (const [userId, orders] of byUser) {
        const { data: filledRows } = await admin
          .from('trades')
          .select('asset_id, side, units, server_price_usd, server_ts')
          .eq('league_id', openLeague.id)
          .eq('user_id', userId)
          .eq('status', 'filled')
          .order('server_ts', { ascending: true });
        const prior: StampedTrade[] = (filledRows ?? []).map((r) => ({
          assetId: r.asset_id as string,
          side: r.side as 'buy' | 'sell',
          units: Number(r.units),
          priceUsd: Number(r.server_price_usd),
          ts: Date.parse(r.server_ts as string),
        }));
        let state = replayTrades(prior, { userId, startedAt }).state;

        for (const order of orders) {
          const decision = _settleDecision(order as PendingRow, prices[order.asset_id as string], state);
          if (decision.action === 'wait') continue;
          if (decision.action === 'cancel') {
            await admin
              .from('trades')
              .update({ status: 'cancelled', cancel_reason: decision.reason })
              .eq('id', order.id);
            settled++;
            continue;
          }
          const oracle = { assetUsd: () => usd(decision.priceUsd) };
          state =
            order.side === 'buy'
              ? buyAsset(state, oracle, order.asset_id as string, decision.units)
              : sellAsset(state, oracle, order.asset_id as string, decision.units);
          await admin
            .from('trades')
            .update({
              status: 'filled',
              units: decision.units,
              server_price_usd: decision.priceUsd,
              server_ts: at.toISOString(),
            })
            .eq('id', order.id);
          settled++;
        }
      }
    }
  }

  return json({ opened: row.week_key, settled, closed: null });
};
