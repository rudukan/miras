import { describe, it, expect, vi } from 'vitest';
import { _authorizeTick as authorizeTick, _weekRowFor as weekRowFor } from './+server';

describe('authorizeTick', () => {
  it('doğru sırrı kabul, yanlışı/eksiği reddeder', () => {
    expect(authorizeTick('s3cret', 's3cret')).toBe(true);
    expect(authorizeTick('wrong', 's3cret')).toBe(false);
    expect(authorizeTick(null, 's3cret')).toBe(false);
    expect(authorizeTick('s3cret', '')).toBe(false); // sır yapılandırılmamış → daima ret
  });

  it('uzunluk farkında da sabit sonuç verir (kısa/uzun girdi çökmez)', () => {
    expect(authorizeTick('a', 's3cret')).toBe(false);
    expect(authorizeTick('s3cretlonger', 's3cret')).toBe(false);
  });
});

describe('weekRowFor', () => {
  it('verilen an için hafta satırını üretir', () => {
    expect(weekRowFor(new Date('2026-07-22T12:00:00Z'))).toEqual({
      week_key: '2026-07-20',
      opens_at: '2026-07-19T21:00:00.000Z',
      locks_at: '2026-07-24T20:00:00.000Z',
    });
  });
});

import { _settleDecision as settleDecision } from './+server';
import { replayTrades } from '$lib/domain/league/replay';

const emptyState = () => replayTrades([], { userId: 'u1', startedAt: 0 }).state;

describe('settleDecision', () => {
  it('fiyat yoksa bekletir', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, undefined, emptyState())).toEqual({ action: 'wait' });
  });

  it('fiyat bayat/kapalıysa bekletir', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 10, fresh: false }, emptyState())).toEqual({ action: 'wait' });
  });

  it('taze fiyatta units emrini doldurur', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 10, fresh: true }, emptyState())).toEqual({
      action: 'fill',
      units: 10,
      priceUsd: 10,
    });
  });

  it('amountUsd emrini dolum anındaki fiyattan adede çevirir', () => {
    const o = { asset_id: 'BTC', side: 'buy' as const, units: null, amount_usd: 1000 };
    expect(settleDecision(o, { priceUsd: 400, fresh: true }, emptyState())).toEqual({
      action: 'fill',
      units: 2.5,
      priceUsd: 400,
    });
  });

  it('bakiye yetmiyorsa iptal eder', () => {
    const o = { asset_id: 'BTC', side: 'buy' as const, units: 1000, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 95000, fresh: true }, emptyState())).toEqual({
      action: 'cancel',
      reason: 'Yetersiz bakiye',
    });
  });

  it('elde olmayanı satma emrini iptal eder', () => {
    const o = { asset_id: 'BTC', side: 'sell' as const, units: 1, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 95000, fresh: true }, emptyState())).toEqual({
      action: 'cancel',
      reason: 'Yetersiz pozisyon',
    });
  });

  it('taze fiyatta tutar 1 adede bile yetmiyorsa iptal eder', () => {
    const o = { asset_id: 'BTC', side: 'buy' as const, units: null, amount_usd: 0.01 };
    expect(settleDecision(o, { priceUsd: 95000, fresh: true }, emptyState())).toEqual({
      action: 'cancel',
      reason: 'Tutar bu fiyatta işleme yetmiyor',
    });
  });
});

import { _rankScores as rankScores } from './+server';

describe('rankScores', () => {
  it('skora göre azalan sıralar, 1\'den başlar', () => {
    expect(
      rankScores([
        { userId: 'a', scoreUsd: 1_000_000 },
        { userId: 'b', scoreUsd: 1_200_000 },
        { userId: 'c', scoreUsd: 900_000 },
      ]),
    ).toEqual([
      { userId: 'b', scoreUsd: 1_200_000, rank: 1 },
      { userId: 'a', scoreUsd: 1_000_000, rank: 2 },
      { userId: 'c', scoreUsd: 900_000, rank: 3 },
    ]);
  });

  it('eşit skorlara aynı rank verir, sonraki rank atlanır (standart rekabet sıralaması)', () => {
    expect(
      rankScores([
        { userId: 'a', scoreUsd: 1_000_000 },
        { userId: 'b', scoreUsd: 1_000_000 },
        { userId: 'c', scoreUsd: 900_000 },
      ]),
    ).toEqual([
      { userId: 'a', scoreUsd: 1_000_000, rank: 1 },
      { userId: 'b', scoreUsd: 1_000_000, rank: 1 },
      { userId: 'c', scoreUsd: 900_000, rank: 3 },
    ]);
  });

  it('boş listede boş döner', () => {
    expect(rankScores([])).toEqual([]);
  });
});

// --- POST kapanış fazı: sahte Supabase admin client ile uçtan uca ---
// `createAdminClient` `$lib/server/league/admin`'den geliyor (locals.supabase değil, bkz.
// admin.ts'teki gerekçe) — bu yüzden burada modül seviyesinde mock'lanır. `telemetry`
// rotasının `fakeSupabase`/`postReq` kalıbıyla aynı ruh: minimal sahte client + gerçek
// `POST`'u doğrudan çağırmak.
import { CRON_SECRET } from '$env/static/private';

interface MockResp {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

/** Tablo başına sıralı yanıt kuyruğu: her `.from(table)` çağrısı kuyruktaki bir sonrakini
 *  tüketir (kuyruk biterse sonuncusu tekrar kullanılır). Zincirleme metodlar (`select`,
 *  `eq`, `order`...) hep `this` döner; `update` çağrıları ayrıca `updateCalls`'a kaydedilir
 *  ki testler "bu tabloya hiç update denenmedi" diye doğrudan doğrulayabilsin. */
function makeMockAdmin(script: Record<string, MockResp[]>) {
  const callCounts: Record<string, number> = {};
  const updateCalls: { table: string; payload: unknown }[] = [];
  const from = (table: string) => {
    const idx = callCounts[table] ?? 0;
    callCounts[table] = idx + 1;
    const queue = script[table] ?? [];
    const resp: MockResp = queue[idx] ?? queue[queue.length - 1] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      lte: () => chain,
      order: () => chain,
      limit: () => chain,
      upsert: () => chain,
      maybeSingle: () => chain,
      update: (payload: unknown) => {
        updateCalls.push({ table, payload });
        return chain;
      },
      then: (onFulfilled: (v: MockResp) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(resp).then(onFulfilled, onRejected),
    };
    return chain;
  };
  return { from, updateCalls };
}

let mockAdmin: ReturnType<typeof makeMockAdmin>;
vi.mock('$lib/server/league/admin', () => ({
  createAdminClient: () => mockAdmin,
}));

import { POST } from './+server';
import type { RequestEvent } from './$types';

function tickRequest(): RequestEvent {
  return {
    request: new Request('http://localhost/api/league/tick', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    }),
    fetch: vi.fn(),
  } as unknown as RequestEvent;
}

describe('POST /api/league/tick — kapanış skor yazma hatası', () => {
  it('league_entries güncellemesi hata dönerse ligi kapatmaz (bir kullanıcı başarısız olsa bile), 200 döner ve throw etmez', async () => {
    mockAdmin = makeMockAdmin({
      leagues: [
        { data: null, error: null }, // 1) hafta aç (upsert)
        { data: null, error: null }, // 2) openLeague (maybeSingle) → yok, bekleyen emir fazı atlanır
        {
          data: [{ id: 'league-1', week_key: '2026-07-20', opens_at: '2026-07-19T21:00:00.000Z' }],
          error: null,
        }, // 3) due sorgusu — kilit anı geçmiş lig
        // 4) status='closed' — DÜZELTİLMİŞ kodda hiç çağrılmamalı. Çağrılırsa (kırık kod)
        // CAS başarılı görünsün diye count:1 veriyoruz — testin RED'de doğru sebeple
        // kırılmasını garantiler (kuyruk taşması yüzünden yanlışlıkla değil).
        { data: null, error: null, count: 1 },
      ],
      league_entries: [
        { data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null }, // entries listesi
        { data: null, error: null }, // user-1 skor yazımı → başarılı
        { data: null, error: { message: 'simulated transient db error', code: 'XXCONN' } }, // user-2 → HATA
      ],
      trades: [
        { data: [], error: null }, // kapanış allTrades — pozisyon yok, stampPrices hiç tetiklenmez
      ],
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let res: Response;
    try {
      res = await POST(tickRequest());
    } finally {
      errSpy.mockRestore();
    }
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.closed).toBeNull();
    // CAS-korumalı status='closed' güncellemesi hiç DENENMEMİŞ olmalı — league 'open' kalıp
    // bir sonraki tick'in `due` sorgusuyla tekrar yakalanabilmeli.
    expect(mockAdmin.updateCalls.some((c) => c.table === 'leagues')).toBe(false);
    // İki kullanıcı için de yazma denendi (ilk hata görülünce döngü durmadı).
    expect(mockAdmin.updateCalls.filter((c) => c.table === 'league_entries')).toHaveLength(2);
  });
});
