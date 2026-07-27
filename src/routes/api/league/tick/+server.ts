import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { createAdminClient } from '$lib/server/league/admin';
import { leagueWeekKey, leagueWeekStart, leagueLockMoment } from '$lib/domain/league/week';
import { stampPrices, type StampedPrice } from '$lib/server/league/prices';
import { replayTrades, valuate, type StampedTrade } from '$lib/domain/league/replay';
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

export interface ScoreEntry {
  userId: string;
  scoreUsd: number;
}

/** Standart rekabet sıralaması (1,1,3): eşit skorlar aynı rank alır, sonraki rank atlanır. */
export function _rankScores(entries: readonly ScoreEntry[]): (ScoreEntry & { rank: number })[] {
  const sorted = [...entries].sort((a, b) => b.scoreUsd - a.scoreUsd);
  const out: (ScoreEntry & { rank: number })[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank = i > 0 && sorted[i].scoreUsd === sorted[i - 1].scoreUsd ? out[i - 1].rank : i + 1;
    out.push({ ...sorted[i], rank });
  }
  return out;
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

  // 3) Kilit anı geçmiş ve henüz mühürlenmemiş haftaları kapat. GEÇMİŞ haftalar da taranır:
  //    tick bir süre çalışmazsa (deploy, kesinti) kapanış atlanmaz.
  let closed: string | null = null;
  const { data: due } = await admin
    .from('leagues')
    .select('id, week_key, opens_at')
    .eq('status', 'open')
    .lte('locks_at', at.toISOString())
    .order('locks_at', { ascending: true })
    .limit(1);

  const league = due?.[0];
  if (league) {
    const { data: entries, error: entriesError } = await admin
      .from('league_entries')
      .select('user_id')
      .eq('league_id', league.id);
    const { data: allTrades, error: tradesError } = await admin
      .from('trades')
      .select('user_id, asset_id, side, units, server_price_usd, server_ts')
      .eq('league_id', league.id)
      .eq('status', 'filled')
      .order('server_ts', { ascending: true });

    // Okuma hatasında bu ligi BU turda ATLA: league.status hâlâ 'open' kaldığı için
    // bir sonraki tick aynı `due` sorgusuyla tekrar dener. Yanlış puanla (entries/
    // allTrades sessizce [] gibi görünüp) kapatıp bir daha asla dönülmemesindense
    // (closed lig bu sorguda hiç görünmez) burada durmak tercih edilir.
    if (entriesError || tradesError) {
      console.error(
        `[api/league/tick] ${league.week_key}: kapanış verisi okunamadı, bu tick atlanır — bir sonrakine bırakılır`,
        entriesError ?? tradesError,
      );
    } else {
      const startedAt = Date.parse(league.opens_at as string);
      const tradesByUser = new Map<string, StampedTrade[]>();
      for (const r of allTrades ?? []) {
        const list = tradesByUser.get(r.user_id as string) ?? [];
        list.push({
          assetId: r.asset_id as string,
          side: r.side as 'buy' | 'sell',
          units: Number(r.units),
          priceUsd: Number(r.server_price_usd),
          ts: Date.parse(r.server_ts as string),
        });
        tradesByUser.set(r.user_id as string, list);
      }

      // Kapanış fiyatları SUNUCUDAN çekilir; tüm katılımcıların pozisyonları tek turda.
      const heldAssets = new Set<string>();
      for (const list of tradesByUser.values()) for (const t of list) heldAssets.add(t.assetId);
      const closePrices: Record<string, number> = {};
      if (heldAssets.size > 0) {
        const stamped = await stampPrices(Array.from(heldAssets), fetch, at);
        for (const [id, s] of Object.entries(stamped)) closePrices[id] = s.priceUsd;
      }

      const scores: ScoreEntry[] = (entries ?? []).map((e) => {
        const userId = e.user_id as string;
        const { state, rejected } = replayTrades(tradesByUser.get(userId) ?? [], { userId, startedAt });
        if (rejected.length > 0)
          console.warn(`[api/league/tick] ${league.week_key}/${userId}: ${rejected.length} işlem replay'de reddedildi`);
        const { scoreUsd, complete } = valuate(state, closePrices);
        if (!complete)
          console.warn(`[api/league/tick] ${league.week_key}/${userId}: kapanış fiyatı eksik pozisyon var`);
        return { userId, scoreUsd };
      });

      // Yazma hatasında CAS'ı ATLA: bir/kaç kullanıcının skoru yazılamadıysa league'i yine de
      // 'closed' yapmak o kullanıcıyı final_score_usd (muhtemelen NULL) ile kalıcı olarak
      // mahsur bırakır — due sorgusu yalnız status='open' arar, kapanmış lig bir daha hiç
      // görünmez. Yazımlar (league_id, user_id) üzerinde idempotent overwrite olduğundan bir
      // sonraki tick'te tüm kapanış fazını (skorlama dahil) tekrar denemek güvenlidir —
      // yukarıdaki okuma-hatası atlamasıyla AYNI desen.
      let writeFailed = false;
      for (const s of _rankScores(scores)) {
        const { error: writeError } = await admin
          .from('league_entries')
          .update({ final_score_usd: s.scoreUsd, rank: s.rank })
          .eq('league_id', league.id)
          .eq('user_id', s.userId);
        if (writeError) {
          writeFailed = true;
          console.error(
            `[api/league/tick] ${league.week_key}/${s.userId}: skor yazılamadı, kapanış bu tick'te atlanır — bir sonrakine bırakılır`,
            writeError,
          );
        }
      }
      if (!writeFailed) {
        // count: bu invocation'ın CAS'i GERÇEKTEN eşleşip satırı kapattıysa 1, başka biri
        // (ya da başka bir tick) zaten kapattıysa 0 döner — closed yalnız gerçek kapanışta set edilir.
        const { count: closedCount } = await admin
          .from('leagues')
          .update({ status: 'closed', closed_at: at.toISOString() }, { count: 'exact' })
          .eq('id', league.id)
          .eq('status', 'open'); // idempotency: eşzamanlı ikinci tick tekrar kapatmaz
        if (closedCount) closed = league.week_key as string;
      }
    }
  }

  return json({ opened: row.week_key, settled, closed });
};
