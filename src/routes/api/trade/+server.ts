import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSameOrigin } from '$lib/server/csrf';
import { createAdminClient } from '$lib/server/league/admin';
import { stampPrices } from '$lib/server/league/prices';
import { leagueWeekKey, leagueLockMoment, leagueWeekStart } from '$lib/domain/league/week';
import { replayTrades, type StampedTrade } from '$lib/domain/league/replay';

const SYMBOL_RE = /^[A-Z0-9]{1,12}$/;
const ORDER_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_UNITS = 1e12;
const MAX_AMOUNT_USD = 1e12;

export interface TradeRequest {
  assetId: string;
  side: 'buy' | 'sell';
  units: number | null;
  amountUsd: number | null;
  clientOrderId: string;
}

export type ParseResult =
  | { ok: true; value: TradeRequest }
  | { ok: false; reason: string };

function positiveFinite(n: unknown, max: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max;
}

/** Girdi şema doğrulaması — endpoint'ten ayrı export edilir ki test edilebilsin. */
export function _parseTradeRequest(body: unknown): ParseResult {
  if (body === null || typeof body !== 'object') return { ok: false, reason: 'Geçersiz istek' };
  const b = body as Record<string, unknown>;

  if (typeof b.assetId !== 'string' || !SYMBOL_RE.test(b.assetId))
    return { ok: false, reason: 'Geçersiz sembol' };
  if (b.side !== 'buy' && b.side !== 'sell') return { ok: false, reason: 'Geçersiz yön' };
  if (typeof b.clientOrderId !== 'string' || !ORDER_ID_RE.test(b.clientOrderId))
    return { ok: false, reason: 'Geçersiz emir kimliği' };

  const hasUnits = b.units !== undefined && b.units !== null;
  const hasAmount = b.amountUsd !== undefined && b.amountUsd !== null;
  if (hasUnits === hasAmount) return { ok: false, reason: 'Adet ya da tutardan yalnız biri verilmeli' };
  if (hasAmount && b.side !== 'buy') return { ok: false, reason: 'Tutar bazlı emir yalnız alışta geçerli' };
  if (hasUnits && !positiveFinite(b.units, MAX_UNITS)) return { ok: false, reason: 'Geçersiz adet' };
  if (hasAmount && !positiveFinite(b.amountUsd, MAX_AMOUNT_USD))
    return { ok: false, reason: 'Geçersiz tutar' };

  return {
    ok: true,
    value: {
      assetId: b.assetId,
      side: b.side,
      units: hasUnits ? (b.units as number) : null,
      amountUsd: hasAmount ? (b.amountUsd as number) : null,
      clientOrderId: b.clientOrderId,
    },
  };
}

/** Kullanıcı başına, kayan 10 saniyelik pencerede izin verilen azami işlem sayısı. */
export const _RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10_000;

export function _withinRateLimit(recentCount: number): boolean {
  return recentCount < _RATE_LIMIT_MAX;
}

/** Aday işlemi, o ana kadarki damgalı işlemlerin replay'i üstünde dener.
 *  Not: Bu kontrol eşzamanlı iki istekte teorik olarak yarışabilir — nihai otorite
 *  kapanış replay'idir (bakiyeyi aşan işlem orada da reddedilir ve skora girmez). */
export function _validateAgainstReplay(
  prior: readonly StampedTrade[],
  candidate: StampedTrade,
  startedAt: number,
  userId: string,
): { ok: true } | { ok: false; reason: string } {
  const { rejected } = replayTrades([...prior, candidate], { userId, startedAt });
  const failed = rejected.find((r) => r.trade === candidate);
  if (!failed) return { ok: true };
  return {
    ok: false,
    reason: failed.reason.includes('units') ? 'Yetersiz pozisyon' : 'Yetersiz bakiye',
  };
}

/** `trades` insert satırının tek düz şekli — iki dal (queued/filled) FARKLI anahtar
 *  kümeleriyle ayrık union üretirse supabase-js'in generic `insert<T>()` çözümlemesi
 *  T'yi tek bir union üyesinden sabitleyip tüm union'ı ona karşı denetliyor (`status`
 *  literal'i uyuşmadığı için patlıyor) — bu tip bildirimi her iki dalı da AYNI şekle
 *  genişletip o çıkarımı önler. Çalışma zamanı davranışı değişmez. */
type TradeRow = {
  league_id: string;
  user_id: string;
  client_order_id: string;
  asset_id: string;
  side: 'buy' | 'sell';
  units: number | null;
  amount_usd: number | null;
  status: 'pending' | 'filled';
  server_price_usd: number | null;
  server_ts: string | null;
};

export const POST: RequestHandler = async ({ request, locals, url, fetch }) => {
  if (!isSameOrigin(request.headers.get('origin'), url.origin)) error(403, 'Geçersiz kaynak');
  const { user } = await locals.safeGetSession();
  if (!user) error(401, 'Oturum gerekli');
  if (user.is_anonymous === true) error(403, 'Lig işlemi için kayıtlı hesap gerekli');

  const parsed = _parseTradeRequest(await request.json().catch(() => null));
  if (!parsed.ok) error(400, parsed.reason);
  const req = parsed.value;

  const at = new Date();
  const weekKey = leagueWeekKey(at);
  if (at.getTime() >= leagueLockMoment(weekKey).getTime())
    error(409, 'Hafta kapandı — bu işlem skora girmez');

  const admin = createAdminClient();

  const { data: league } = await admin
    .from('leagues')
    .select('id, status')
    .eq('week_key', weekKey)
    .maybeSingle();
  if (!league || league.status !== 'open') error(409, 'Lig haftası henüz açılmadı');

  const { data: entry } = await admin
    .from('league_entries')
    .select('user_id')
    .eq('league_id', league.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!entry) error(403, 'Lige katılmadınız');

  const { count: recentCount } = await admin
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('placed_at', new Date(at.getTime() - RATE_LIMIT_WINDOW_MS).toISOString());
  if (!_withinRateLimit(recentCount ?? 0)) error(429, 'Çok hızlı işlem — biraz bekleyin');

  const stamped = (await stampPrices([req.assetId], fetch, at))[req.assetId];

  // Fiyat yok ya da bayat/kapalı → emir kuyruğa girer (kapalı piyasa mekaniğinin sunucu ikizi).
  const queued = stamped === undefined || !stamped.fresh;

  // Anlık dolacak emirler bakiyeye karşı doğrulanır. Kuyruğa giren emir doğrulanmaz:
  // dolum anındaki fiyat/bakiye bilinmiyor — settle sırasında (Task 8) denenir ve
  // yetmezse iptal edilir (istemcideki settlePendingOrders ile aynı semantik).
  if (!queued) {
    const units = req.units ?? Math.floor((req.amountUsd! / stamped!.priceUsd) * 1e4) / 1e4;
    if (!(units > 0)) error(400, 'Tutar bu fiyatta işleme yetmiyor');
    const { data: priorRows } = await admin
      .from('trades')
      .select('asset_id, side, units, server_price_usd, server_ts')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .eq('status', 'filled')
      .order('server_ts', { ascending: true });
    const prior: StampedTrade[] = (priorRows ?? []).map((r) => ({
      assetId: r.asset_id as string,
      side: r.side as 'buy' | 'sell',
      units: Number(r.units),
      priceUsd: Number(r.server_price_usd),
      ts: Date.parse(r.server_ts as string),
    }));
    const verdict = _validateAgainstReplay(
      prior,
      { assetId: req.assetId, side: req.side, units, priceUsd: stamped!.priceUsd, ts: at.getTime() },
      leagueWeekStart(at).getTime(),
      user.id,
    );
    if (!verdict.ok) error(422, verdict.reason);
  }

  const row: TradeRow = queued
    ? {
        league_id: league.id,
        user_id: user.id,
        client_order_id: req.clientOrderId,
        asset_id: req.assetId,
        side: req.side,
        units: req.units,
        amount_usd: req.amountUsd,
        status: 'pending' as const,
        server_price_usd: null,
        server_ts: null,
      }
    : {
        league_id: league.id,
        user_id: user.id,
        client_order_id: req.clientOrderId,
        asset_id: req.assetId,
        side: req.side,
        units: req.units ?? Math.floor((req.amountUsd! / stamped!.priceUsd) * 1e4) / 1e4,
        amount_usd: req.amountUsd,
        status: 'filled' as const,
        server_price_usd: stamped!.priceUsd,
        server_ts: at.toISOString(),
      };

  const { data: inserted, error: dbError } = await admin
    .from('trades')
    .insert(row)
    .select('id, status, units, server_price_usd, server_ts')
    .single();

  if (dbError) {
    // Idempotency: aynı clientOrderId ikinci kez geldi — mevcut satır aynen döner.
    if (dbError.code === '23505') {
      const { data: existing } = await admin
        .from('trades')
        .select('id, status, units, server_price_usd, server_ts')
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .eq('client_order_id', req.clientOrderId)
        .single();
      if (existing) return json(toResponse(existing));
    }
    console.error('[api/trade] insert hatası', dbError);
    error(500, 'İşlem kaydedilemedi');
  }

  return json(toResponse(inserted));
};

function toResponse(row: {
  id: string;
  status: string;
  units: number | null;
  server_price_usd: number | null;
  server_ts: string | null;
}) {
  if (row.status === 'filled')
    return {
      status: 'filled' as const,
      orderId: row.id,
      units: row.units,
      priceUsd: row.server_price_usd,
      serverTs: row.server_ts,
    };
  return { status: 'queued' as const, orderId: row.id };
}
