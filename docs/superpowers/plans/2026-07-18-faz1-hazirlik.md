# Faz 1 — Hazırlık Kapısı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Funnel telemetrisi (`first_trade` aktivasyonu + `telemetry_events` tablosu), dürüst bir "Veri Hakkında" notu ve bir kaynak-zehirlenmesi düzeltmesiyle, 10-15 kişilik GO/NO-GO deneyini çalıştırılabilir hale getirmek.

**Architecture:** Mevcut katmanlar korunur — yeni bir Supabase migration'ı (`telemetry_events`), `src/lib/api/telemetry.ts`'e bir yeni fonksiyon (`pingFirstTrade`), `liveGameStore.svelte.ts`'teki `apply()` seam'ine opsiyonel bir `onOk` callback'i, `/api/telemetry` endpoint'ine gerçek DB insert + CSRF guard, ve `src/lib/components/ui/` altında yeni bir modal component. Kod dışı iki teslim: bir deney runbook'u (`docs/faz1-gonogo-runbook.md`) ve `memory.md`'de tek satırlık bir hijyen düzeltmesi.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes) + TypeScript strict + Supabase (`@supabase/ssr`, `locals.supabase`) + Vitest + Playwright.

## Global Constraints

- Para asla `number` değil (`Money` tipi) — **bu plandaki `usdTry`/`liveUsdTry` bir para TUTARI değil, bir kur ORANI olduğu için mevcut kod gibi `number` kalır** (WalletSummary.svelte:17'deki emsal).
- Identifier'lar İngilizce, UI metinleri Türkçe.
- Renkler yalnız `tailwind.config.ts`'deki `term.*` token'ları — hard-coded `#hex` yasak.
- Svelte component boyutu max ~200 satır (yaklaşık — bu planda PriceList.svelte ~200'ü birkaç satır aşabilir, küçük bir buton eklemek için ayrı dosyaya bölmek gereksiz soyutlama olur).
- Svelte 5 runes kullanılır (`$state`, `$derived`, `$effect`, `$props`).
- **Supabase kuralı: yeni server-side client YARATILMAZ** — hep `locals.supabase`.
- TDD zorunlu: davranış değişen her adımda önce başarısız test.
- Yeni migration numarası **0006** (0001-0005 dolu).
- Sistemler arası iletişim yalnız `src/lib/stores/`; API çağrıları yalnız `src/lib/api/` altında.

---

## Task 1: Migration 0006 — `telemetry_events` tablosu

**Files:**
- Create: `supabase/migrations/0006_telemetry_events.sql`

**Interfaces:**
- Produces: `public.telemetry_events` tablosu — kolonlar `id bigint`, `player_id text`, `event text`, `ts timestamptz`, `received_at timestamptz`. `anon`+`authenticated` rolleri yalnız `insert (player_id, event, ts)` yetkisine sahip. Sonraki task'lar (`/api/telemetry` insert'i, Task 5) bu tabloyu ve bu üç kolonu hedefler.

Bu bir SQL şema değişikliği — Vitest ile test edilemez; doğrulama gerçek/lokal Postgres üzerinde `relacl` sorgusuyla yapılır (adım 3-4).

- [ ] **Step 1: Migration dosyasını yaz**

`supabase/migrations/0006_telemetry_events.sql`:

```sql
-- 0006_telemetry_events: Faz 1 GO/NO-GO deneyi icin funnel tablosu (visit -> first_trade -> D1).
-- Mevcut /api/telemetry yalniz console.log + Discord webhook yapiyordu (Vercel Hobby logu ~1 saat
-- yasiyor) -- gun-farki join'in dayanacagi kalici depo yoktu. Bu tablo o on kosulu karsilar.

create table public.telemetry_events (
  id          bigint generated always as identity primary key,
  player_id   text        not null,
  event       text        not null,
  ts          timestamptz not null,          -- istemci saati (guvenilmez)
  received_at timestamptz not null default now(),  -- sunucu saati -- gun kovasi bundan
  constraint player_id_format check (player_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint event_valid check (event in ('visit','share_click','share_done','first_trade'))
);
alter table public.telemetry_events enable row level security;

-- REVOKE-FIRST (derinlemesine savunma) + GRANT (yuk tasiyan). auto_expose_new_tables
-- lokalde + yeni cloud default'ta KAPALI (config.toml:24 unset) -> yeni tablo hicbir default
-- grant ile dogmaz; bu yuzden asagidaki `grant insert` ZORUNLU (savunma degil, on kosul).
-- `revoke all` legacy auto-expose'a karsi savunma (prod o davranisla yaratilmis olabilir --
-- 0001 anon/authenticated'i revoke etmek zorunda kalmisti) + service_role'u kapatir.
revoke all on table public.telemetry_events from anon, authenticated, service_role;

-- SONRA GEREKENI AC: yalniz INSERT, yalniz client'in yazmasi mesru kolonlar.
-- received_at + id GRANT'TE YOK -> sunucu saati/kimligi client'a birakilmaz (0001:18 gerekcesi).
grant insert (player_id, event, ts) on table public.telemetry_events to anon, authenticated;

create policy telemetry_insert_any on public.telemetry_events
  for insert to anon, authenticated with check (true);
-- SELECT grant/policy YOK -> okuma yalniz owner (postgres / SQL editor).
```

- [ ] **Step 2: Lokal Supabase stack çalışıyorsa migration'ı uygula**

Ön koşul: Docker Desktop + `npx supabase start` (CLAUDE.md Test Disiplini). Stack çalışmıyorsa bu adımı ve Step 3-4'ü atla, bir sonraki oturumda tamamla — Task 2'den itibaren migration dosyası olmadan da (dosya diskte hazır) devam edilebilir, çünkü sonraki task'lar mock'lu birim testleriyle çalışır.

Çalıştır:
```bash
npx supabase start
npx supabase db reset
```
Beklenen: `Applying migration 0006_telemetry_events.sql...` satırı hatasız geçer.

- [ ] **Step 3: Grant'leri doğrula (`information_schema`, `relacl` DEĞİL)**

> **Düzeltme (2026-07-18, bu plan çalıştırılırken doğrulandı):** `pg_class.relacl` yalnız
> TABLO-düzeyi grant'leri gösterir. Bu migration'ın esas mekanizması olan `grant insert
> (player_id, event, ts) ...` bir KOLON-düzeyi grant'tir ve `relacl`'da HİÇ görünmez — o sorgu
> boş/yalnız `postgres=arwdDxtm/postgres` döner, bu YANLIŞ ALARM değildir ama yanlış sorudur.
> Doğru kontrol `information_schema.column_privileges` + `information_schema.table_privileges`.

Çalıştır (lokal Postgres, Docker container adı `supabase_db_<project_id>` — `docker ps` ile
teyit et, bu projede `supabase_db_miras_oyun`):
```bash
docker exec supabase_db_miras_oyun psql -U postgres -d postgres -c \
  "select grantee, column_name, privilege_type from information_schema.column_privileges where table_name='telemetry_events' order by grantee, column_name;"
docker exec supabase_db_miras_oyun psql -U postgres -d postgres -c \
  "select grantee, privilege_type from information_schema.table_privileges where table_name='telemetry_events' order by grantee, privilege_type;"
```
Beklenen: ilk sorguda `anon` ve `authenticated` yalnız `player_id`/`event`/`ts` kolonlarında
`INSERT` satırı taşır (`id`/`received_at` YOK); ikinci sorguda `anon`/`authenticated`/
`service_role` HİÇ satır döndürmez (yalnız `postgres` tam CRUD görünür, tablo sahibi olduğu için).

**Doğrulandı (2026-07-18, lokal stack):** tam bu şekilde — 6/6 satır `anon`+`authenticated`×
`player_id`/`event`/`ts` INSERT; tablo-düzeyinde `anon`/`authenticated`/`service_role` sıfır satır.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_telemetry_events.sql
git commit -m "feat(supabase): telemetry_events tablosu (Faz 1 funnel)"
```

**Not — prod push bu task'ın kapsamı DIŞINDA:** migration dosyası hazır olduğunda prod'a push (`supabase db push` veya CLI akışı) **elle, kullanıcı onayıyla** yapılır — **yalnız migration dosyasından**, ad-hoc/geniş bir komutla DEĞİL (0005'in dersi: prod'a migration dosyası dışında bir komutla `service_role`'e yanlışlıkla geniş yetki verilmişti). Push sonrası aynı `relacl` sorgusu prod'da da koşulup doğrulanmalı (spec Bölüm 4) — bu, planın son adımı değil, ayrı bir kullanıcı kararı.

---

## Task 2: Event union'a `first_trade` eklenir (client + server)

**Files:**
- Modify: `src/lib/api/telemetry.ts:1`
- Modify: `src/routes/api/telemetry/+server.ts:3,11`
- Modify: `src/routes/api/telemetry/server.test.ts` (yeni test eklenir, mevcutlar değişmez)

**Interfaces:**
- Consumes: yok (bu task bağımsız).
- Produces: `TelemetryEvent` tipi artık `'first_trade'`i kapsar — Task 3 (`pingFirstTrade`) bunu tüketir. `VALID_EVENTS` sunucu tarafında `'first_trade'`i kabul eder — Task 5 bunun üstüne DB insert'i inşa eder.

- [ ] **Step 1: Başarısız test yaz — sunucu `first_trade` payload'ını reddediyor (henüz)**

`src/routes/api/telemetry/server.test.ts` — mevcut `describe('POST /api/telemetry', ...)` bloğunun içine, "geçerli payload (share_click/share_done) → 204" testinden hemen sonra ekle:

```ts
  it('geçerli payload (first_trade) → 204', async () => {
    expect((await POST(postReq({ ...VALID, event: 'first_trade' }))).status).toBe(204);
  });
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Çalıştır: `npm run test -- server.test.ts`
Beklenen: FAIL — `first_trade` `VALID_EVENTS`'te olmadığından `isValidPayload` false döner, status 400 gelir, `toBe(204)` başarısız olur.

- [ ] **Step 3: `telemetry.ts` tipini genişlet**

`src/lib/api/telemetry.ts:1` değiştir:

```ts
export type TelemetryEvent = 'visit' | 'share_click' | 'share_done';
```
→
```ts
export type TelemetryEvent = 'visit' | 'share_click' | 'share_done' | 'first_trade';
```

- [ ] **Step 4: `+server.ts` union'ını ve `VALID_EVENTS`'i genişlet**

`src/routes/api/telemetry/+server.ts:3` değiştir:

```ts
export type TelemetryEvent = 'visit' | 'share_click' | 'share_done';
```
→
```ts
export type TelemetryEvent = 'visit' | 'share_click' | 'share_done' | 'first_trade';
```

`src/routes/api/telemetry/+server.ts:11` değiştir:

```ts
const VALID_EVENTS = new Set<TelemetryEvent>(['visit', 'share_click', 'share_done']);
```
→
```ts
const VALID_EVENTS = new Set<TelemetryEvent>(['visit', 'share_click', 'share_done', 'first_trade']);
```

- [ ] **Step 5: Testi çalıştır, geçtiğini doğrula**

Çalıştır: `npm run test -- server.test.ts`
Beklenen: PASS (yeni test dahil, mevcut tüm testler de yeşil).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/telemetry.ts src/routes/api/telemetry/+server.ts src/routes/api/telemetry/server.test.ts
git commit -m "feat(telemetry): first_trade event union'a eklendi"
```

---

## Task 3: `pingFirstTrade` — `src/lib/api/telemetry.ts`

**Files:**
- Modify: `src/lib/api/telemetry.ts`
- Test: `src/lib/api/telemetry.test.ts`

**Interfaces:**
- Consumes: `TelemetryEvent` (Task 2'den `'first_trade'` dahil), `sendTelemetry(playerId, event)` (mevcut, aynı dosyada).
- Produces: `pingFirstTrade(storage: Storage, playerId: string): void` — Task 6 (`+page.svelte`) bunu `onFirstTrade` callback'i içinde çağırır.

- [ ] **Step 1: Başarısız testler yaz**

`src/lib/api/telemetry.test.ts` — dosyanın sonuna, mevcut `describe('pingDailyVisit', ...)` bloğundan sonra ekle:

```ts
describe('pingFirstTrade', () => {
  it('ilk çağrıda gönderir ve bayrağı kaydeder', () => {
    const storage = makeStorage();
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      pingFirstTrade(storage, 'p1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.event).toBe('first_trade');
      expect(storage.getItem('miras.firstTradeSent')).toBe('1');
    } finally {
      globalThis.fetch = real;
    }
  });

  it('ikinci çağrıda göndermez (kalıcı, günlük değil)', () => {
    const storage = makeStorage();
    storage.setItem('miras.firstTradeSent', '1');
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      pingFirstTrade(storage, 'p1');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = real;
    }
  });
});
```

Dosyanın en üstündeki import satırını güncelle:
```ts
import { sendTelemetry, pingDailyVisit } from './telemetry';
```
→
```ts
import { sendTelemetry, pingDailyVisit, pingFirstTrade } from './telemetry';
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Çalıştır: `npm run test -- telemetry.test.ts`
Beklenen: FAIL — `pingFirstTrade` tanımlı değil (`telemetry.ts`'den export edilmiyor).

- [ ] **Step 3: Minimal implementasyon**

`src/lib/api/telemetry.ts` sonuna ekle (mevcut `pingDailyVisit`'ten hemen sonra):

```ts
const FIRST_TRADE_KEY = 'miras.firstTradeSent';

/** İlk aktivasyon pingi (buy/sell/openDeposit'ten biri) — kalıcı bayrak, pingDailyVisit'in
 *  aksine günlük değil: aktivasyon oyuncu başına bir kez sayılır. */
export function pingFirstTrade(storage: Storage, playerId: string): void {
  if (storage.getItem(FIRST_TRADE_KEY) === '1') return;
  sendTelemetry(playerId, 'first_trade');
  storage.setItem(FIRST_TRADE_KEY, '1');
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Çalıştır: `npm run test -- telemetry.test.ts`
Beklenen: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/telemetry.ts src/lib/api/telemetry.test.ts
git commit -m "feat(telemetry): pingFirstTrade eklendi"
```

---

## Task 4: `apply(fn, onOk?)` seam + `onFirstTrade` — `liveGameStore.svelte.ts`

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts:59-79` (interface), `:332-371` (apply/buy/sell/openDeposit)
- Test: `src/lib/stores/liveGameStore.test.ts`

**Interfaces:**
- Consumes: mevcut `apply`/`buy`/`sell`/`openDepositAction` (aynı dosya).
- Produces: `LiveGameStoreOptions.onFirstTrade?: () => void` — Task 6 (`+page.svelte`) bu opsiyonu `createLiveGameStore(...)` çağrısına verir.

- [ ] **Step 1: Başarısız testler yaz**

`src/lib/stores/liveGameStore.test.ts` — dosyanın sonuna yeni bir `describe` bloğu ekle (mevcut `setup()` helper'ı `overrides` alanıyla zaten `onFirstTrade` gibi ek option'ları `createLiveGameStore`'a geçirir, değişiklik gerekmez):

```ts
describe('onFirstTrade (Faz 1 funnel aktivasyonu)', () => {
  it('ilk başarılı buy sonrası bir kez çağrılır', async () => {
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 100);
    flushSync();
    expect(t.store.lastError).toBeNull();
    expect(onFirstTrade).toHaveBeenCalledTimes(1);
  });

  it('yetersiz bakiyeli (başarısız) buy çağırmaz', async () => {
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 1_000_000); // 100M×$7.5 >> $1M bakiye
    flushSync();
    expect(t.store.lastError).not.toBeNull();
    expect(onFirstTrade).not.toHaveBeenCalled();
  });

  it('piyasa kapalıyken bloklu buy çağırmaz', async () => {
    // BIST hafta içi 10:00-18:00 (Istanbul) açık — 22:00 kapanış sonrası.
    const CLOSED_NOW = new Date('2026-06-01T22:00:00+03:00').getTime();
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade, now: () => CLOSED_NOW });
    await t.store.start();
    flushSync();
    t.store.buy('THYAO', 1);
    flushSync();
    expect(t.store.lastError).toContain('PİYASA KAPALI');
    expect(onFirstTrade).not.toHaveBeenCalled();
  });

  it('sell ve openDeposit de tetikler (idempotent sayaç pingFirstTrade tarafında, burada her çağrı sayılır)', async () => {
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.openDeposit(1000);
    flushSync();
    t.store.buy('THYAO', 1);
    flushSync();
    t.store.sell('THYAO', 1);
    flushSync();
    expect(onFirstTrade).toHaveBeenCalledTimes(3);
  });

  it('buyProperty/breakDeposit gibi diğer aksiyonlar çağırmaz', async () => {
    const onFirstTrade = vi.fn();
    const t = setup({ onFirstTrade });
    await t.store.start();
    flushSync();
    t.store.openDeposit(1000);
    flushSync();
    onFirstTrade.mockClear();
    t.store.breakDeposit();
    flushSync();
    expect(onFirstTrade).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

Çalıştır: `npm run test -- liveGameStore.test.ts`
Beklenen: FAIL — `onFirstTrade` option'ı `LiveGameStoreOptions`'ta yok (TS derleme hatası) ve/veya çağrılmıyor.

- [ ] **Step 3: `LiveGameStoreOptions`'a `onFirstTrade` ekle**

`src/lib/stores/liveGameStore.svelte.ts` içinde şunu bul:

```ts
  /** Her snapshot upsert'inden sonra çağrılır — history persistence buradan yapılır. */
  onPersistHistory?: (history: DailySnapshot[]) => void;
  // --- test/SSR enjeksiyonu ---
```

Şununla değiştir:

```ts
  /** Her snapshot upsert'inden sonra çağrılır — history persistence buradan yapılır. */
  onPersistHistory?: (history: DailySnapshot[]) => void;
  /** İlk aktivasyon (buy/sell/openDeposit) başarıyla tamamlanınca çağrılır — funnel telemetrisi
   *  (Faz 1 GO/NO-GO deneyi) buradan tetiklenir; idempotent bayrak çağıranın sorumluluğundadır. */
  onFirstTrade?: () => void;
  // --- test/SSR enjeksiyonu ---
```

- [ ] **Step 4: `apply` seam'ini ve `buy`/`sell`/`openDepositAction`'ı güncelle**

`src/lib/stores/liveGameStore.svelte.ts` içinde şunu bul:

```ts
  // --- yazma aksiyonları (guard → reducer → immutable reassign + updatedAt damga → hata yüzeyle) ---
  function apply(fn: () => GameState): void {
    try {
      game = { ...fn(), updatedAt: now() };
      lastError = null;
      persist();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
```

Şununla değiştir:

```ts
  // --- yazma aksiyonları (guard → reducer → immutable reassign + updatedAt damga → hata yüzeyle) ---
  // onOk (Faz 1): yalnız başarılı fn() sonrası, try'ın DIŞINDA çağrılır. İçeride olsaydı
  // storage.setItem (Safari private mode/kota) throw ettiğinde apply'ın catch'i yakalar ve
  // game/persist() zaten atanmış olmasına rağmen lastError'a sahte bir hata yazardı.
  function apply(fn: () => GameState, onOk?: () => void): void {
    try {
      game = { ...fn(), updatedAt: now() };
      lastError = null;
      persist();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      return;
    }
    try {
      onOk?.();
    } catch {
      /* telemetri best-effort — oyunu bozmaz */
    }
  }
```

Sonra, aynı dosyada şunu bul:

```ts
  const buy = (assetId: string, units: number) =>
    apply(() => {
      const blocked = tradeBlockReason(assetId);
      if (blocked) throw new Error(blocked);
      return buyAsset(game, oracle, assetId, units);
    });
  const sell = (assetId: string, units: number) =>
    apply(() => {
      const blocked = tradeBlockReason(assetId);
      if (blocked) throw new Error(blocked);
      return sellAsset(game, oracle, assetId, units);
    });
  const openDepositAction = (usdAmount: number) =>
    apply(() => openDeposit(game, sealedUsdTry(), usdAmount, now()));
```

Şununla değiştir:

```ts
  const buy = (assetId: string, units: number) =>
    apply(() => {
      const blocked = tradeBlockReason(assetId);
      if (blocked) throw new Error(blocked);
      return buyAsset(game, oracle, assetId, units);
    }, opts.onFirstTrade);
  const sell = (assetId: string, units: number) =>
    apply(() => {
      const blocked = tradeBlockReason(assetId);
      if (blocked) throw new Error(blocked);
      return sellAsset(game, oracle, assetId, units);
    }, opts.onFirstTrade);
  const openDepositAction = (usdAmount: number) =>
    apply(() => openDeposit(game, sealedUsdTry(), usdAmount, now()), opts.onFirstTrade);
```

(`buyPropertyAction`/`sellPropertyAction`/`collectRentAction`/`breakDepositAction` DEĞİŞMEZ — `apply(fn)` çağrılarına ikinci argüman eklenmez, spec §1.3 kapsamı yalnız `buy | sell | openDeposit`.)

- [ ] **Step 5: Testleri çalıştır, geçtiklerini doğrula**

Çalıştır: `npm run test -- liveGameStore.test.ts`
Beklenen: PASS (yeni 5 test dahil, mevcut tüm testler de yeşil — özellikle testler #2/#3 gibi `buy`'ın hâlâ `lastError: null` ve doğru bakiye düşüşü verdiğini doğrulayanlar).

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "feat(store): apply onOk seam + onFirstTrade (buy/sell/openDeposit)"
```

---

## Task 5: `/api/telemetry` — DB insert + CSRF guard

**Files:**
- Modify: `src/routes/api/telemetry/+server.ts`
- Modify: `src/routes/api/telemetry/server.test.ts` (harness yeniden yazılır)

**Interfaces:**
- Consumes: `isSameOrigin(originHeader, appOrigin)` (`src/lib/server/csrf.ts`, mevcut, değişmez), `locals.supabase` (SvelteKit `Locals`, mevcut).
- Produces: yok (uç nokta — kimse tüketmez).

- [ ] **Step 1: Test harness'ı yeniden yaz + başarısız testler ekle**

`src/routes/api/telemetry/server.test.ts` içindeki mevcut `postReq` fonksiyonunu VE üstündeki import'u tamamen şununla değiştir (dosyanın başı, `describe` bloğundan önceki her şey):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from './+server';
import type { RequestEvent } from './$types';

function fakeSupabase(insertError: { message: string } | null = null) {
  const insert = vi.fn(() => Promise.resolve({ error: insertError }));
  return { insert, client: { from: () => ({ insert }) } };
}

function postReq(
  body: unknown,
  opts: { origin?: string | null; supabase?: unknown } = {},
): RequestEvent {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const origin = opts.origin === undefined ? 'http://localhost' : opts.origin;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin !== null) headers.origin = origin;
  return {
    request: new Request('http://localhost/api/telemetry', {
      method: 'POST',
      body: rawBody,
      headers,
    }),
    url: new URL('http://localhost/api/telemetry'),
    locals: { supabase: opts.supabase ?? fakeSupabase().client },
  } as unknown as RequestEvent;
}

const VALID = { playerId: 'p1', event: 'visit', tsISO: new Date().toISOString() };

afterEach(() => {
  delete process.env.TELEMETRY_WEBHOOK_URL;
  vi.restoreAllMocks();
});
```

Mevcut `'bozuk JSON → 400'` testini şununla değiştir (artık `postReq` string body'yi olduğu gibi geçirir, `url`/`locals` otomatik eklenir):

```ts
  it('bozuk JSON → 400', async () => {
    const res = await POST(postReq('{bozuk'));
    expect(res.status).toBe(400);
  });
```

Dosyanın sonuna (mevcut son test — "webhook body allowed_mentions..." — bitiminden sonra) ekle:

```ts
describe('CSRF guard + DB insert (migration 0006)', () => {
  it('origin uyuşmaz → 403', async () => {
    const res = await POST(postReq(VALID, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });

  it('origin header yoksa (null) → 403', async () => {
    const res = await POST(postReq(VALID, { origin: null }));
    expect(res.status).toBe(403);
  });

  it('geçerli payload → locals.supabase.insert player_id/event/ts ile çağrılır (received_at/id YOK)', async () => {
    const { insert, client } = fakeSupabase();
    const res = await POST(postReq(VALID, { supabase: client }));
    expect(res.status).toBe(204);
    expect(insert).toHaveBeenCalledWith({ player_id: 'p1', event: 'visit', ts: VALID.tsISO });
  });

  it('insert hatası yutulur — endpoint yine 204 döner', async () => {
    const { client } = fakeSupabase({ message: 'db down' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(postReq(VALID, { supabase: client }));
    expect(res.status).toBe(204);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

Çalıştır: `npm run test -- server.test.ts`
Beklenen: FAIL — mevcut `POST` handler'ı hâlâ `{ request }` imzalı (yeni `url`/`locals` alanlarını okumuyor, CSRF guard yok, DB insert yok); CSRF/insert testleri özellikle başarısız olur. (Diğer mevcut testler de yeni `postReq` şekliyle derleme/çalışma açısından uyumlu olmalı ama davranış testleri henüz karşılıksız kalan `locals`/`url` nedeniyle bir kısmı hâlâ eski davranışla PASS olabilir — asıl kanıt CSRF/insert testlerinin FAIL vermesidir.)

- [ ] **Step 3: `+server.ts`'i güncelle**

`src/routes/api/telemetry/+server.ts` dosyasının TAMAMINI şununla değiştir:

```ts
import type { RequestHandler } from './$types';
import { isSameOrigin } from '$lib/server/csrf';

export type TelemetryEvent = 'visit' | 'share_click' | 'share_done' | 'first_trade';

interface TelemetryPayload {
  playerId: string;
  event: TelemetryEvent;
  tsISO: string;
}

const VALID_EVENTS = new Set<TelemetryEvent>(['visit', 'share_click', 'share_done', 'first_trade']);

/** playerId whitelist: crypto.randomUUID() + 'restored'/'local-player' fallback'lerini karşılar;
 *  Discord mention (@), markdown (`), newline ve aşırı uzunluğu reddeder (güvenlik denetimi B1). */
const PLAYER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isValidPayload(body: unknown): body is TelemetryPayload {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.playerId === 'string' &&
    PLAYER_ID_RE.test(b.playerId) &&
    typeof b.event === 'string' &&
    VALID_EVENTS.has(b.event as TelemetryEvent) &&
    typeof b.tsISO === 'string' &&
    !Number.isNaN(Date.parse(b.tsISO))
  );
}

/**
 * Vercel Hobby runtime logları ~1 saat saklanır → console.log tek başına yetmez.
 * TELEMETRY_WEBHOOK_URL varsa Discord'a fire-and-forget POST (await edilmez, hata yutulur).
 * DB insert best-effort: hata yutulur, oyunu/isteği asla bloklamaz (migration 0006).
 * received_at/id CLIENT'tan GÖNDERİLMEZ — grant bu kolonları kapsamıyor, sunucu saati/kimliği
 * client'a bırakılmaz.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (!isSameOrigin(request.headers.get('origin'), url.origin)) {
    return new Response(null, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!isValidPayload(body)) return new Response(null, { status: 400 });

  console.log('[telemetry]', body.event, body.playerId, body.tsISO);

  const { error: dbError } = await locals.supabase
    .from('telemetry_events')
    .insert({ player_id: body.playerId, event: body.event, ts: body.tsISO });
  if (dbError) console.error('[api/telemetry] insert hatası', dbError);

  const webhookUrl = process.env.TELEMETRY_WEBHOOK_URL;
  if (webhookUrl) {
    void fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: `[${body.event}] ${body.playerId} @ ${body.tsISO}`,
        allowed_mentions: { parse: [] },
      }),
    }).catch(() => {});
  }

  return new Response(null, { status: 204 });
};
```

- [ ] **Step 4: Testleri çalıştır, geçtiklerini doğrula**

Çalıştır: `npm run test -- server.test.ts`
Beklenen: PASS — tüm mevcut testler + yeni CSRF/insert testleri yeşil.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/telemetry/+server.ts src/routes/api/telemetry/server.test.ts
git commit -m "feat(api): /api/telemetry DB insert + isSameOrigin guard (migration 0006)"
```

---

## Task 6: `+page.svelte` — `onFirstTrade` kablolaması

**Files:**
- Modify: `src/routes/+page.svelte:25` (import), `:72-89` (`makeStore`)

**Interfaces:**
- Consumes: `pingFirstTrade` (Task 3, `$lib/api/telemetry`), `onFirstTrade` option (Task 4, `LiveGameStoreOptions`), sayfa-seviyesi `playerId` state (mevcut, `+page.svelte:52`).
- Produces: yok (uç kablolama — bu task'tan sonra tüketen yok).

Bu task saf UI kablolaması; birim testi yok (Svelte component'lar bu projede Vitest ile test edilmiyor — bkz. `src/lib/components/**/*.test.ts` yalnız saf `.ts` yardımcıları kapsıyor). Doğrulama: `npm run build` + Task 11'deki manuel tarayıcı kontrolü.

- [ ] **Step 1: Import satırını güncelle**

`src/routes/+page.svelte:25` bul:

```ts
	import { sendTelemetry, pingDailyVisit } from '$lib/api/telemetry';
```

Değiştir:

```ts
	import { sendTelemetry, pingDailyVisit, pingFirstTrade } from '$lib/api/telemetry';
```

- [ ] **Step 2: `makeStore`'a `onFirstTrade` ekle**

`src/routes/+page.svelte` içinde şunu bul:

```ts
	function makeStore(env: SaveEnvelopeV1 | null, pid?: string): LiveGameStore {
		return createLiveGameStore({
			playerId: pid ?? 'restored', // yalnız fresh oyunda okunur (liveGameStore:156,169)
			initial: env,
			initialHistory: env ? initialHistory : undefined,
			onPersist: (envelope) => {
				if (!browser) return;
				lastPersistAllowed = persistAllowed(localStorage, envelope.game.createdAt);
				if (!lastPersistAllowed) return; // ölü jenerasyon geri yazılamaz (spec §4.E)
				saveGame(localStorage, envelope);
				localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
				cloudPush.schedule(envelope);
			},
			onPersistHistory: (history) => {
				if (browser && lastPersistAllowed) saveHistory(localStorage, { v: 1, history });
			},
		});
	}
```

Değiştir:

```ts
	function makeStore(env: SaveEnvelopeV1 | null, pid?: string): LiveGameStore {
		return createLiveGameStore({
			playerId: pid ?? 'restored', // yalnız fresh oyunda okunur (liveGameStore:156,169)
			initial: env,
			initialHistory: env ? initialHistory : undefined,
			onPersist: (envelope) => {
				if (!browser) return;
				lastPersistAllowed = persistAllowed(localStorage, envelope.game.createdAt);
				if (!lastPersistAllowed) return; // ölü jenerasyon geri yazılamaz (spec §4.E)
				saveGame(localStorage, envelope);
				localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
				cloudPush.schedule(envelope);
			},
			onPersistHistory: (history) => {
				if (browser && lastPersistAllowed) saveHistory(localStorage, { v: 1, history });
			},
			onFirstTrade: () => {
				// playerId SAYFADAN okunur, store'un iç playerId'sinden DEĞİL — kayıtlı oyunda
				// store'un playerId'si 'restored' olur (share handler'larıyla aynı kalıp, :214).
				if (browser && playerId) pingFirstTrade(localStorage, playerId);
			},
		});
	}
```

- [ ] **Step 3: Tip kontrolü + build**

Çalıştır: `npm run check`
Beklenen: hatasız geçer (yeni `onFirstTrade` alanı `LiveGameStoreOptions`'ta Task 4'te tanımlandığı için tip uyumlu).

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(page): onFirstTrade kablolaması (buy/sell/openDeposit -> pingFirstTrade)"
```

---

## Task 7: `DataInfoModal.svelte` + `PriceList` info butonu

**Files:**
- Create: `src/lib/components/ui/DataInfoModal.svelte`
- Modify: `src/lib/components/PriceList.svelte:1-18` (import + state), `:92-94` (başlık bloğu), dosya sonu (modal render)
- Test: `tests/e2e/data-info-modal.spec.ts` (yeni)

**Interfaces:**
- Consumes: yok (yeni, bağımsız presentational component).
- Produces: `DataInfoModal` — `{ onClose: () => void }` props. `PriceList` bunu yerel `infoOpen` state'iyle açar/kapar.

- [ ] **Step 1: `DataInfoModal.svelte`'i yaz**

`src/lib/components/ui/DataInfoModal.svelte` (yeni dosya — `ChartOverlay.svelte`'in dialog iskeletinin aynısı: örtü butonu + `role="dialog"`/`aria-modal` + Escape + closeBtn focus):

```svelte
<!-- src/lib/components/ui/DataInfoModal.svelte — "Veri Hakkında" notu (Faz 1 veri dili) -->
<script lang="ts">
	interface Props {
		onClose: () => void;
	}
	let { onClose }: Props = $props();

	let closeBtn: HTMLButtonElement | null = $state(null);
	$effect(() => {
		closeBtn?.focus();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<button type="button" class="fixed inset-0 bg-black/70 z-[60]" aria-label="Kapat" onclick={onClose}></button>

<div
	class="fixed z-[70] bg-term-panel border border-term-borderGlow font-mono text-xs
	       inset-0 overflow-y-auto p-3 space-y-3
	       md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2
	       md:w-[min(90vw,32rem)] md:max-h-[85vh] md:shadow-lg md:p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Veri hakkında"
>
	<div class="flex items-start justify-between gap-2 border-b border-term-border pb-2">
		<div class="text-term-text font-bold text-sm">VERİ HAKKINDA</div>
		<button
			bind:this={closeBtn}
			type="button"
			onclick={onClose}
			class="shrink-0 text-term-text opacity-50 hover:opacity-100 px-1"
			aria-label="Kapat"
		>✕</button>
	</div>

	<div class="space-y-2.5 text-term-text opacity-90 leading-relaxed">
		<p><span class="text-term-green font-bold">Kripto:</span> WebSocket ile canlı (500 ms güncelleme); 24 saatlik yüzde değişim 20 saniyede bir yenilenen ayrı bir kaynaktan gelir. Bağlantı koparsa 3 saniyede bir yeniden denenir, o sırada son bilinen fiyat gösterilmeye devam eder.</p>
		<p><span class="text-term-green font-bold">BIST hisseleri:</span> ~15 dakika gecikmeli (ücretsiz veri kaynağı). İstemci 20 saniyede bir tazeler.</p>
		<p><span class="text-term-green font-bold">Altın/gümüş:</span> ons cinsinden vadeli fiyattan grama ve TL'ye çevrilir — anlık spot fiyat değil, türetilmiş bir değerdir.</p>
		<p><span class="text-term-green font-bold">Döviz:</span> piyasa parite verisinden gelir.</p>
		<p><span class="text-term-green font-bold">Günlük kur:</span> işlemlerde kullanılan operatif kur her gün bir kez mühürlenir; kur gün içinde mühürden belirgin sapınca (%0.75'ten fazla) aynı gün yeniden mühürlenir. Anlık piyasa kuru Binance'teki USDT/TRY (dolar karşılığı stablecoin) işlem fiyatından gelir — TL'nin resmi USD paritesi değil, ona yakın bir piyasa göstergesidir; cüzdan panelinde mühürlü kurla birlikte ayrıca gösterilir.</p>
		<p class="text-term-amber">Bu oyun bir simülasyondur. Hiçbir bilgi yatırım tavsiyesi değildir.</p>
	</div>
</div>
```

- [ ] **Step 2: `PriceList.svelte`'e info butonunu ekle**

`src/lib/components/PriceList.svelte` içinde import bloğunun sonuna ekle (mevcut `import PriceRow from './PriceRow.svelte';` satırından hemen sonra):

```ts
	import DataInfoModal from './ui/DataInfoModal.svelte';
```

`let q = $state('');` satırından hemen önce/sonra fark etmez, `let tab = $state('all');` satırının hemen altına ekle:

```ts
	let infoOpen = $state(false);
```

Başlık bloğunu bul:

```svelte
	<div class="px-3 pt-3 pb-2 border-b border-term-border">
		<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold mb-2">
			PİYASA FİYATLARI
		</div>
```

Değiştir:

```svelte
	<div class="px-3 pt-3 pb-2 border-b border-term-border">
		<div class="flex items-center justify-between mb-2">
			<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold">
				PİYASA FİYATLARI
			</div>
			<button
				type="button"
				onclick={() => (infoOpen = true)}
				class="text-term-text opacity-50 hover:opacity-100 text-[10px] border border-term-border rounded-full w-4 h-4 flex items-center justify-center shrink-0"
				aria-label="Veri hakkında"
			>i</button>
		</div>
```

Dosyanın sonundaki kapanışı bul:

```svelte
		{/if}
	</div>
</div>
```

Değiştir:

```svelte
		{/if}
	</div>
</div>

{#if infoOpen}
	<DataInfoModal onClose={() => (infoOpen = false)} />
{/if}
```

- [ ] **Step 3: E2E smoke test yaz**

`tests/e2e/data-info-modal.spec.ts` (yeni dosya — `chart-overlay.spec.ts`'in birebir kalıbı):

```ts
import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('veri hakkında modalı: info butonu → dialog açılır, içerik görünür; Escape kapatır', async ({ page }) => {
  await enterOffline(page);

  await page.getByRole('button', { name: 'Veri hakkında' }).click();

  const dialog = page.getByRole('dialog', { name: 'Veri hakkında' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('VERİ HAKKINDA')).toBeVisible();
  await expect(dialog.getByText(/USDT\/TRY/)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
```

- [ ] **Step 4: Testi çalıştır (lokal Supabase stack gerekir — Docker Desktop + `npx supabase start`)**

Çalıştır: `npm run e2e -- data-info-modal.spec.ts`
Beklenen: PASS. Stack çalışmıyorsa bu adımı atla, Task 11'de toplu `npm run e2e` ile birlikte doğrula.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/ui/DataInfoModal.svelte src/lib/components/PriceList.svelte tests/e2e/data-info-modal.spec.ts
git commit -m "feat(ui): DataInfoModal + PriceList info butonu (veri metodolojisi dili)"
```

---

## Task 8: `WalletSummary` — "mühürlü · piyasa" ikinci satırı

**Files:**
- Modify: `src/lib/components/WalletSummary.svelte:7-17` (props), `:34-37` (template)
- Modify: `src/routes/+page.svelte:771-777` (çağrı sitesi)

**Interfaces:**
- Consumes: `store.liveUsdTry` (mevcut getter, `liveGameStore.svelte.ts:597`).
- Produces: yok (yaprak component).

Bu task saf UI değişikliği; birim testi yok (bkz. Task 6 notu). Doğrulama: `npm run build` + Task 11 manuel kontrol.

- [ ] **Step 1: Props'a `liveUsdTry` ekle**

`src/lib/components/WalletSummary.svelte` içinde şunu bul:

```ts
	interface Props {
		game: GameState;
		usdTry: number;
		positions: PositionRow[];
		onSelect?: (assetId: string) => void;
		highlightAssetId?: string | null;
	}

	let { game, usdTry, positions, onSelect, highlightAssetId }: Props = $props();

	const usdRate = $derived(usdTry.toFixed(2));
```

Değiştir:

```ts
	interface Props {
		game: GameState;
		usdTry: number;
		liveUsdTry: number;
		positions: PositionRow[];
		onSelect?: (assetId: string) => void;
		highlightAssetId?: string | null;
	}

	let { game, usdTry, liveUsdTry, positions, onSelect, highlightAssetId }: Props = $props();

	const usdRate = $derived(usdTry.toFixed(2));
	const liveRate = $derived(liveUsdTry.toFixed(2));
```

- [ ] **Step 2: Template satırını güncelle**

Şunu bul:

```svelte
		<div class="flex justify-between items-center pt-0.5">
			<span class="text-term-text opacity-50 text-[10px]">USD/TRY</span>
			<span class="text-term-blue text-[10px]">₺{usdRate}</span>
		</div>
```

Değiştir:

```svelte
		<div class="flex justify-between items-center pt-0.5">
			<span class="text-term-text opacity-50 text-[10px]">mühürlü ₺{usdRate}</span>
			<span class="text-term-blue text-[10px]">piyasa ₺{liveRate}</span>
		</div>
```

- [ ] **Step 3: `+page.svelte` çağrı sitesine `liveUsdTry` prop'unu ekle**

`src/routes/+page.svelte:771-777` bul:

```svelte
						<WalletSummary
							game={store.game}
							usdTry={store.usdTry}
							positions={store.positions}
							onSelect={handleSelectAsset}
							highlightAssetId={hoveredAssetId}
						/>
```

Değiştir:

```svelte
						<WalletSummary
							game={store.game}
							usdTry={store.usdTry}
							liveUsdTry={store.liveUsdTry}
							positions={store.positions}
							onSelect={handleSelectAsset}
							highlightAssetId={hoveredAssetId}
						/>
```

- [ ] **Step 4: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hatasız (yeni zorunlu prop her iki tarafta da eşleşiyor).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/WalletSummary.svelte src/routes/+page.svelte
git commit -m "feat(ui): WalletSummary mühürlü/piyasa kur ikinci satırı"
```

---

## Task 9: GO/NO-GO deneyi runbook'u (süreç dokümanı, kod değil)

**Files:**
- Create: `docs/faz1-gonogo-runbook.md`

**Interfaces:** yok — bu bir insan tarafından takip edilecek belge, kod tarafından tüketilmez.

- [ ] **Step 1: Runbook'u yaz**

`docs/faz1-gonogo-runbook.md`:

```markdown
# Faz 1 — GO/NO-GO Deneyi Runbook'u (10-15 Kullanıcı)

Bağlam ve kilitli kararlar: [docs/superpowers/specs/2026-07-17-faz1-hazirlik-design.md](superpowers/specs/2026-07-17-faz1-hazirlik-design.md)

Tek soru: **Gerçek bir kullanıcı, yardımsız, oyunu anlıyor ve haftalık ligde oynamak istiyor mu?**

---

## 0. Testçi Havuzu

- **10-15 kişi**, en az **3-4 "yabancı"** (arkadaşın arkadaşı — arkadaşlar fazla naziktir, ölçümü öldürür).
- Karışık finans-okuryazarlığı: kur/enflasyon takip eden meraklılar + tamamen acemiler. Onboarding
  ancak acemide gerçekten test edilir.
- **Fikir sorma, davranış ölç.** Moderatörlü seansta "beğendin mi?" YASAK. Anket anonim.

## 1. Erişim ve Pencere

- Prod URL (`miras-one.vercel.app`) — ayrı staging kurulmaz, telemetri prod'da toplanır.
- ~1 hafta davet penceresi + her testçi için kendi katılımından itibaren D1/D7 ölçümü →
  toplam ~2 hafta.

## 2. Moderatörlü Seans Protokolü (3-4 kişi, ~30-40 dk)

- Ekran paylaşımı + think-aloud (sesli düşünme).
- **Görev tabanlı, yardım YOK.** Açılış cümlesi: *"Linki aç, sana hiçbir şey anlatmayacağım,
  sesli düşün."*
- Soru gelirse moderatör cevaplamaz: *"Sen ne yapardın?"* diye geri sorar. Yardım = ölçüm ölür.
- Not alınacak davranışsal anlar:
  1. Karşılama ekranını geçti mi, ne kadar sürede?
  2. İlk işlemi (al/sat/mevduat) **yardımsız** yapabildi mi, kaç dakikada?
  3. Net servet panelini doğru okudu mu (sordurma — panele bakarken "şu an ne kadar kazandın/
     kaybettin" diye sor, cevabı doğrula)?
  4. Nerede takıldı (varsa) — ekran + saniye + kendi sözleriyle ne dedi?
- Sonda (anlama/niyet) soruları **yalnız seans sonunda** sorulur, görev sırasında değil.

## 3. Anket (10+ kişi, anonim, ≤10 soru)

1. *"Oyunun amacını 1 cümlede yaz."* (açık uçlu — anlamayı KANITLAT, sorma)
2. *"Haftalık lig olsa oynar mıydın? Neden?"* (niyet + gerekçe)
3. *"Nerede takıldın / kafan karıştı?"* (açık uçlu)
4. *"Verinin gecikmeli olduğunu fark ettin mi?"* (Bölüm 3 veri dilinin işe yarayıp
   yaramadığını doğrudan test eder)
5-10. (opsiyonel ek sorular — demografi/cihaz/finansal-okuryazarlık öz-değerlendirmesi gibi,
   toplamı 10'u geçmeyecek şekilde)

## 4. GO/NO-GO Rubriği

| Kapı | Kriter | Sonuç |
|------|--------|-------|
| **Teknik (sert, ikili)** | Sıfır kritik hata: veri kaybı, yanlış para hesabı, crash | Herhangi biri → **NO-GO** (taviz yok) |
| **Anlama** | Seansların ≥3/4'ünde ilk işlem **yardımsız**; ankette çoğunluk amacı doğru yazıyor | Sistematik aynı-noktada takılma → **ITERATE** |
| **Niyet** | Çoğunluk (≈≥%60) "ligde oynardım" — nedeni **oyunun kendisi** ("arkadaşım yaptı" değil) | Düşükse → **ITERATE/NO-GO** |
| **Funnel** (`visit → first_trade` + D1, ham SQL — bkz. spec §1.6) | **Yalnız sanity.** | Nitel okumayla çelişirse uyarı işareti; tek başına kapı DEĞİL |

Eşikler "insan" kriterleri, sert nicel değil — N=10-15'te saf yüzde istatistiksel olarak
dürüst değil (her kişi ≈%7-10 temsil eder).

## 5. Sonuç Şablonu

Deney bitince şunu doldur ve `memory.md`'ye (proje hafızası) işle:

```
Tarih: ____
Katılımcı sayısı: ___ (moderatörlü: ___, yalnız anket: ___)
Teknik kapı: GEÇTİ / NO-GO (varsa hangi hata)
Anlama: ___/4 seansta yardımsız ilk işlem; ankette amacı doğru yazan: ___/___
Niyet: "ligde oynardım" diyen: ___/___ (gerekçe özeti: ____)
Funnel (sanity): visit=___ first_trade=___ D1=___
Takılma noktaları (adım + kaç kişi): ____
HÜKÜM: GO / ITERATE / NO-GO
Gerekçe (2-3 cümle): ____
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/faz1-gonogo-runbook.md
git commit -m "docs: Faz 1 GO/NO-GO deneyi runbook'u"
```

---

## Task 10: `memory.md` — kaynak zehirlenmesi düzeltmesi

> **DURUM: DIŞARIDAN TAMAMLANDI, YENİDEN DİSPATCH ETME.** Bu plan yazıldıktan (Task 1-9/11
> dispatch edilmeden) hemen önce, paralel bir oturum commit `3e5fd30`de
> (`chore(hygiene): memory.md drift düzeltmeleri + Codex dosyaları gitignore + spec phantom-0004
> notu`) bu düzeltmeyi zaten uyguladı — daha kapsamlı bir sürümüyle: başlığa
> `— ⚠️ LEGACY (v3.1.0, SvelteKit'e PORTLANMADI)` eklendi VE altına `macro2025.ts`/`noise.ts`'e
> atıfla bir uyarı bloğu eklendi (aşağıdaki Step 1'in tek satırlık planından daha geniş). Aşağıdaki
> adımlar artık `memory.md`'nin güncel içeriğiyle eşleşmiyor (old_string bulunamaz) — **atla**.

**Files:**
- ~~Modify: `memory.md:37`~~ (dış commit'te zaten yapıldı)

**Interfaces:** yok.

- [x] ~~**Step 1: Başlığa LEGACY etiketi ekle**~~ — commit `3e5fd30` ile karşılandı, farklı ama denk bir metinle.

`memory.md:37` bul:

```markdown
#### A. Tarihsel Veri Seti (Jan 2024 - Jan 2025)
```

Değiştir:

```markdown
#### A. Tarihsel Veri Seti (Jan 2024 - Jan 2025) — LEGACY (portlanmadı; `macro2025.ts`'teki 2025 TAHMİNİ verilerle KARIŞTIRILMASIN — bu bölüm 2024 GERÇEK verisini tarif eder, farklı bir veri seti)
```

- [ ] **Step 2: Commit**

```bash
git add memory.md
git commit -m "docs(memory): Tarihsel Veri Seti bölümüne LEGACY etiketi (kaynak zehirlenmesi düzeltmesi)"
```

---

## Task 11: Toplu doğrulama

**Files:** yok (yalnız komut çalıştırma).

- [ ] **Step 1: Birim testleri**

Çalıştır: `npm run test`
Beklenen: tüm testler PASS (yeni telemetry/liveGameStore/server testleri dahil).

- [ ] **Step 2: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hatasız.

- [ ] **Step 3: Build**

Çalıştır: `npm run build`
Beklenen: hatasız tamamlanır. (Windows-yerel `EPERM` olasılığı için `[Lokal build EPERM]` hafıza notuna bak — Developer Mode açıksa sorun olmamalı.)

- [ ] **Step 4: E2E (lokal Supabase stack varsa)**

Çalıştır: `npx supabase start` (çalışmıyorsa) ardından `npm run e2e`
Beklenen: tüm senaryolar PASS (yeni `data-info-modal.spec.ts` dahil).

- [ ] **Step 5: Gerçek tarayıcıda telemetri insert'ini doğrula**

`npm run dev` ile lokal sunucuyu aç, tarayıcıda oyuna gir, bir işlem yap (al/sat/mevduat).
Lokal Supabase Studio'dan (`npx supabase status` çıktısındaki Studio URL) `telemetry_events`
tablosuna bak: `visit` VE `first_trade` satırlarının düştüğünü doğrula (`player_id` sayfa
state'indeki UUID ile eşleşmeli, `received_at` sunucu tarafından otomatik dolmuş olmalı).

- [ ] **Step 6: Prod push hatırlatması (kullanıcı kararı — bu adım otomatik ÇALIŞTIRILMAZ)**

Migration 0006 prod'a **yalnız migration dosyasıyla** (elle geniş komut YOK) push edildikten
sonra `relacl` doğrulaması prod'da tekrarlanmalı (Task 1'in son notuna bak, spec Bölüm 4).
Bu, kullanıcının onaylayacağı ayrı bir adım.

---

## Self-Review Notları

- **Spec kapsaması:** Bölüm 1 (telemetri) → Task 1-6; Bölüm 2 (deney) → Task 9; Bölüm 3 (veri
  dili) → Task 7-8; Bölüm 4 (doğrulama) → Task 1 Step 2-3 + Task 11; Bölüm 5 (kaynak
  zehirlenmesi) → Task 10. İş kalemleri listesindeki 10 madde + doğrulama tamamı bir task'a
  karşılık geliyor.
- **Tip/isim tutarlılığı:** `onFirstTrade` adı Task 4 (`LiveGameStoreOptions`), Task 6
  (`+page.svelte` çağrı sitesi) ve Task 9'un rubriğinde (kavramsal, "aktivasyon") boyunca aynı.
  `pingFirstTrade(storage, playerId)` imzası Task 3'te tanımlanır, Task 6'da birebir bu imzayla
  çağrılır. `liveUsdTry` prop adı Task 8'de hem component hem çağrı sitesinde aynı.
