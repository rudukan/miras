# SP1 — Hesap Altyapısı (Supabase Auth + Bulut Kayıt) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oyuna Google + anonim misafir girişi, benzersiz takma ad, buluta kayıt senkronu ve KVKK hesap silme ekle — oyun motoruna dokunmadan.

**Architecture:** Supabase Auth (httpOnly cookie + PKCE, `@supabase/ssr`) + Postgres (`profiles`, `saves`; RLS + GRANT çift katman). localStorage birincil kayıt kalır; bulut, `onPersist` kancasına debounce'lu push ile eklenir. Kimlik sunucuda daima `getUser()` ile doğrulanır.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript strict, `@supabase/ssr`, `@supabase/supabase-js`, Cloudflare Turnstile, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-04-cok-kullanicili-yayin-design.md` (bölüm 4, 5, 6)

**Kapsam notu:** Spec §6'daki "30 gün hareketsiz anonim hesapların periyodik temizliği" BU PLANDA DEĞİL — cron altyapısıyla birlikte SP2'ye devredildi (aktif misafiri yanlışlıkla silmemek için `saves.updated_at` bazlı dikkatli kriter gerektiriyor; SP2 planı yazılırken ele alınacak).

## Global Constraints

- Para asla `number` değil — bu planda para mantığı YOK, `SaveEnvelopeV1` opak taşınır; içine dokunma.
- Svelte 5 runes (`$state`, `$derived`, `$props`); `setInterval` + DOM manipülasyonu yasak; `{@html}` yasak.
- Identifier'lar İngilizce, UI metinleri Türkçe; renkler `term.*` token'ları (hard-coded #hex yazma); `font-mono`.
- Component max ~200 satır.
- Sunucuda kimlik SADECE `locals.safeGetSession()` (içi `getUser()`) — asla tek başına `getSession()` ile yetkilendirme yapma.
- `SUPABASE_SECRET_KEY` yalnız `$env/static/private` üzerinden; client bundle'a sızarsa build FAIL etmeli (SvelteKit bunu zaten zorlar).
- Her migration sonrası Supabase security advisors kontrolü (MCP `get_advisors` veya Dashboard → Advisors).
- Her task sonunda: `npm run test` + `npm run check` yeşil, sonra commit. (Windows'ta `npm run build` adapter-vercel symlink EPERM verir — bilinen/kabul edilen durum, yalnız Task 9'da build denenir.)

---

### Task 0: Ön Koşullar (kullanıcı aksiyonları — kod yok)

Bu task insan işidir; işaretlenmeden Task 1'e GEÇME. Kanıt: `.env.local` dolu ve `npx vitest run` mevcut 415+ testi yeşil.

- [ ] Supabase Pro satın al, yeni proje aç — **region: eu-central-1 (Frankfurt)** (spec §7: TR'ye en yakın; KVKK yurt dışı aktarım beyanı SP3a metinlerine girecek).
- [ ] Dashboard → Authentication → Sign In / Up: **Anonymous sign-ins: ON**, **Manual linking: ON** (linkIdentity için şart).
- [ ] Google Cloud Console → OAuth client (Web): Authorized redirect URI = `https://<PROJECT_REF>.supabase.co/auth/v1/callback`. Client ID/Secret'ı Supabase → Auth → Providers → Google'a gir. (Consent screen "Testing" modunda kalabilir — prod publish SP3a'daki domain + gizlilik sayfasına bağlı, dev'i bloklamaz.)
- [ ] Cloudflare Dashboard → Turnstile → yeni site (**Invisible** mod, domain: `localhost` + Vercel domainleri). Secret'ı Supabase → Auth → Attack Protection → Enable CAPTCHA (Turnstile) alanına gir.
- [ ] Proje köküne `.env.local` yaz (git'e girmez) ve aynı değerleri Vercel → Project → Environment Variables'a ekle:
  ```
  PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
  PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
  PUBLIC_TURNSTILE_SITE_KEY=0x...
  SUPABASE_SECRET_KEY=sb_secret_...
  ```

---

### Task 1: Bağımlılıklar + env iskeleti

**Files:**
- Modify: `package.json` (dependency ekleme — komutla)
- Create: `.env.example`
- Modify: `src/app.d.ts` (yoksa oluştur)

**Interfaces:**
- Produces: `App.Locals.supabase: SupabaseClient`, `App.Locals.safeGetSession(): Promise<{ session: Session | null; user: User | null }>` — sonraki tüm server task'ları bunu kullanır.

- [ ] **Step 1: Paketleri kur**

Run: `npm install @supabase/supabase-js @supabase/ssr`
Expected: package.json `dependencies`'e iki paket eklenir, install hatasız biter.

- [ ] **Step 2: `.env.example` oluştur** (yeni geliştirici/CI referansı; gerçek değer YOK)

```
# Supabase (Task 0'da oluşturulan proje)
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
PUBLIC_TURNSTILE_SITE_KEY=
# Yalnız sunucu — client'a asla
SUPABASE_SECRET_KEY=
```

- [ ] **Step 3: `src/app.d.ts` yaz**

```ts
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      safeGetSession(): Promise<{ session: Session | null; user: User | null }>;
    }
    // interface PageData {}
    // interface Error {}
    // interface Platform {}
  }
}

export {};
```

- [ ] **Step 4: Doğrula ve commit**

Run: `npm run check`
Expected: PASS (0 errors — Locals henüz set edilmiyor ama tip tanımı derlenir).

```bash
git add package.json package-lock.json .env.example src/app.d.ts
git commit -m "feat(auth): supabase bagimliliklari + env iskeleti"
```

---

### Task 2: Migration — `profiles` + `saves` (RLS + GRANT çift katman)

**Files:**
- Create: `supabase/migrations/0001_identity.sql` (repo'da kopyası; uygulama MCP `apply_migration` veya Dashboard SQL Editor ile)

**Interfaces:**
- Produces: `public.profiles(id uuid pk, nickname text, created_at)`, `public.saves(user_id uuid pk, payload jsonb, schema_version int, updated_at timestamptz)` — Task 5/7/8 bu şemaya güvenir.

- [ ] **Step 1: Migration SQL'ini yaz** (spec §4 yetkilendirme matrisi birebir)

```sql
-- 0001_identity: profiles + saves, varsayilan ret / acik izin durusu

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now(),
  constraint nickname_format check (nickname ~ '^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]{3,20}$')
);
create unique index profiles_nickname_lower_idx on public.profiles (lower(nickname));

create table public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  schema_version int not null,
  updated_at timestamptz not null default now()
);

-- updated_at sunucu saatiyle atilir; client kendi zamanini yazamaz
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger saves_touch before insert or update on public.saves
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.saves enable row level security;

-- GRANT katmani: once hepsini kapat, sonra gerekeni ac (spec §4 matrisi)
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.saves from anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant insert (id, nickname), update (nickname) on table public.profiles to authenticated;
grant select, insert (user_id, payload, schema_version), update (payload, schema_version)
  on table public.saves to authenticated;

-- RLS katmani
create policy profiles_select_all on public.profiles
  for select using (true);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy saves_select_own on public.saves
  for select to authenticated using (user_id = auth.uid());
create policy saves_insert_own on public.saves
  for insert to authenticated with check (user_id = auth.uid());
create policy saves_update_own on public.saves
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Not: `updated_at` GRANT kolon listelerinde bilerek YOK — trigger atar, client yazamaz. `delete` hiçbir role verilmedi (hesap silme cascade ile, Task 8).

- [ ] **Step 2: Migration'ı uygula**

Supabase MCP bağlıysa: `apply_migration` (name: `0001_identity`, query: yukarıdaki SQL). Değilse Dashboard → SQL Editor'a yapıştır, çalıştır.
Expected: "Success. No rows returned".

- [ ] **Step 3: Güvenlik lint'i**

MCP `get_advisors` (type: security) veya Dashboard → Advisors → Security.
Expected: `profiles`/`saves` için "RLS disabled" YOK; `set_updated_at` için "mutable search_path" YOK. Başka tablolarla ilgili uyarı çıkarsa nota düş, bu task'ı bloklamaz.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_identity.sql
git commit -m "feat(db): profiles + saves migration (RLS + grant cift katman)"
```

---

### Task 3: Supabase client altyapısı (hooks + layout)

**Files:**
- Create: `src/hooks.server.ts`
- Create: `src/routes/+layout.ts`
- Modify: `src/routes/+layout.svelte`

**Interfaces:**
- Consumes: Task 1 `App.Locals` tipleri.
- Produces: server'da `locals.supabase` + `locals.safeGetSession()`; client'ta `+layout.ts` `load` → `data.supabase: SupabaseClient` (page component'ları `let { data } = $props()` ile alır).

- [ ] **Step 1: `src/hooks.server.ts` yaz**

```ts
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
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
```

- [ ] **Step 2: `src/routes/+layout.ts` yaz** (browser client — oyun client-ağırlıklı, SSR session taşımıyoruz)

```ts
import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, depends }) => {
  depends('supabase:auth');
  const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch },
  });
  return { supabase };
};
```

- [ ] **Step 3: `src/routes/+layout.svelte`'i güncelle** (auth değişiminde data'yı tazele)

```svelte
<script lang="ts">
  import '../app.css';
  import { invalidate } from '$app/navigation';

  let { data, children } = $props();

  $effect(() => {
    const {
      data: { subscription },
    } = data.supabase.auth.onAuthStateChange(() => {
      invalidate('supabase:auth');
    });
    return () => subscription.unsubscribe();
  });
</script>

{@render children()}
```

- [ ] **Step 4: Doğrula ve commit**

Run: `npm run check` sonra `npm run test`
Expected: ikisi de PASS (mevcut testler etkilenmez; env eksikse `check` `$env/static/public` için hata verir → `.env.local` dolu olmalı, Task 0).

```bash
git add src/hooks.server.ts src/routes/+layout.ts src/routes/+layout.svelte
git commit -m "feat(auth): supabase ssr client altyapisi (hooks + layout)"
```

---

### Task 4: Takma ad domain modülü (TDD)

**Files:**
- Create: `src/lib/domain/nickname/nickname.ts`
- Test: `src/lib/domain/nickname/nickname.test.ts`

**Interfaces:**
- Produces: `validateNickname(raw: string): NicknameVerdict`; `type NicknameVerdict = { ok: true; value: string } | { ok: false; reason: string }` — Task 7 (server) ve Task 8 (UI) aynı fonksiyonu kullanır.

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect } from 'vitest';
import { validateNickname } from './nickname';

describe('validateNickname', () => {
  it('geçerli adı trim edip kabul eder', () => {
    expect(validateNickname('  MirasBaronu42 ')).toEqual({ ok: true, value: 'MirasBaronu42' });
  });
  it('Türkçe karakterlere izin verir', () => {
    expect(validateNickname('Ağaoğlu_Şükrü').ok).toBe(true);
  });
  it('3 karakterden kısayı reddeder', () => {
    expect(validateNickname('ab')).toEqual({ ok: false, reason: 'Takma ad 3-20 karakter olmalı' });
  });
  it('20 karakterden uzunu reddeder', () => {
    expect(validateNickname('a'.repeat(21)).ok).toBe(false);
  });
  it('boşluk ve özel karakterleri reddeder', () => {
    expect(validateNickname('miras baronu').ok).toBe(false);
    expect(validateNickname('baron<script>').ok).toBe(false);
  });
  it('küfür içeren adı reddeder (büyük/küçük ve İ/ı normalize)', () => {
    expect(validateNickname('AmKoyan42')).toEqual({ ok: false, reason: 'Takma ad uygunsuz ifade içeriyor' });
    expect(validateNickname('sIkTIrGit')).toEqual({ ok: false, reason: 'Takma ad uygunsuz ifade içeriyor' });
  });
  it('blocklist kelimesini başka kelimenin içinde de yakalar', () => {
    expect(validateNickname('XsalakX').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Testin FAIL ettiğini gör**

Run: `npx vitest run src/lib/domain/nickname/nickname.test.ts`
Expected: FAIL — "Cannot find module './nickname'".

- [ ] **Step 3: Implementasyonu yaz**

```ts
/**
 * Takma ad kurallari (spec §4): 3-20 karakter, [A-Za-z0-9_ + Turkce harfler],
 * bosluk yok, kufur blocklist'i substring olarak taranir (TR normalize ile).
 * Ayni kural DB'de nickname_format CHECK'i olarak da var — bu modul kullanici
 * dostu mesaj uretir, DB son savunma hattidir.
 */
export type NicknameVerdict = { ok: true; value: string } | { ok: false; reason: string };

const FORMAT = /^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]{3,20}$/;

// Kucuk cekirdek liste — SP2'de sikayet butonuyla desteklenecek. Normalize edilmis halde tut.
const BLOCKLIST = [
  'amk', 'amcik', 'sik', 'siktir', 'yarrak', 'orospu', 'pic', 'ibne', 'gavat',
  'salak', 'gerizekali', 'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'hitler',
];

function normalizeTr(s: string): string {
  return s
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o')
    .replace(/ş/g, 's').replace(/ü/g, 'u');
}

export function validateNickname(raw: string): NicknameVerdict {
  const value = raw.trim();
  if (value.length < 3 || value.length > 20) {
    return { ok: false, reason: 'Takma ad 3-20 karakter olmalı' };
  }
  if (!FORMAT.test(value)) {
    return { ok: false, reason: 'Yalnız harf, rakam ve alt çizgi kullanılabilir' };
  }
  const normalized = normalizeTr(value);
  if (BLOCKLIST.some((w) => normalized.includes(w))) {
    return { ok: false, reason: 'Takma ad uygunsuz ifade içeriyor' };
  }
  return { ok: true, value };
}
```

- [ ] **Step 4: Testin PASS ettiğini gör**

Run: `npx vitest run src/lib/domain/nickname/nickname.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/nickname/
git commit -m "feat(domain): takma ad dogrulama + kufur filtresi (TDD)"
```

---

### Task 5: Bulut kayıt domain modülü (TDD)

**Files:**
- Create: `src/lib/stores/cloudSave.ts`
- Test: `src/lib/stores/cloudSave.test.ts`

**Interfaces:**
- Consumes: `SaveEnvelopeV1` (`src/lib/stores/savegame.ts` — mevcut).
- Produces:
  - `LOCAL_TOUCHED_KEY = 'miras.save.touchedAt'` (localStorage anahtarı)
  - `chooseSource(localTouchedAt: number | null, cloudUpdatedAt: string | null): 'local' | 'cloud' | 'none'`
  - `createCloudPush(push: (env: SaveEnvelopeV1) => Promise<void>, opts?: { debounceMs?: number }): { schedule(env: SaveEnvelopeV1): void; flush(): Promise<void> }`
  - Task 9 bu üçünü `+page.svelte`'de kullanır.

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chooseSource, createCloudPush } from './cloudSave';
import type { SaveEnvelopeV1 } from './savegame';

const env = { v: 1, game: {} as never, activeBist: [] } as unknown as SaveEnvelopeV1;

describe('chooseSource', () => {
  it('ikisi de yoksa none', () => {
    expect(chooseSource(null, null)).toBe('none');
  });
  it('yalnız local varsa local, yalnız cloud varsa cloud', () => {
    expect(chooseSource(1000, null)).toBe('local');
    expect(chooseSource(null, '2026-07-04T10:00:00Z')).toBe('cloud');
  });
  it('ikisi de varsa yeni olan kazanır', () => {
    const t = Date.parse('2026-07-04T10:00:00Z');
    expect(chooseSource(t + 5000, '2026-07-04T10:00:00Z')).toBe('local');
    expect(chooseSource(t - 5000, '2026-07-04T10:00:00Z')).toBe('cloud');
  });
  it('eşitlikte local kazanır (gereksiz reload yok)', () => {
    const t = Date.parse('2026-07-04T10:00:00Z');
    expect(chooseSource(t, '2026-07-04T10:00:00Z')).toBe('local');
  });
});

describe('createCloudPush', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounce süresi dolunca son envelope ile push eder', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 30_000 });
    sync.schedule(env);
    sync.schedule(env); // üst üste çağrı tek push'a düşer
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(env);
  });

  it('flush bekleyen push varsa hemen gönderir, yoksa hiçbir şey yapmaz', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 30_000 });
    await sync.flush();
    expect(push).not.toHaveBeenCalled();
    sync.schedule(env);
    await sync.flush();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('push hatası yutulur (oyun localStorage ile devam eder), sonraki schedule yeniden dener', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.schedule(env);
    await vi.advanceTimersByTimeAsync(1000);
    sync.schedule(env);
    await vi.advanceTimersByTimeAsync(1000);
    expect(push).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Testin FAIL ettiğini gör**

Run: `npx vitest run src/lib/stores/cloudSave.test.ts`
Expected: FAIL — "Cannot find module './cloudSave'".

- [ ] **Step 3: Implementasyonu yaz**

```ts
/**
 * Bulut kayit senkronu (spec §5): localStorage birincil kalir; bulut push
 * debounce'ludur ve hatasi oyunu ASLA durdurmaz. Kaynak secimi yeni-olan-kazanir,
 * esitlikte local (gereksiz reload'u onlemek icin).
 */
import type { SaveEnvelopeV1 } from './savegame';

export const LOCAL_TOUCHED_KEY = 'miras.save.touchedAt';

export function chooseSource(
  localTouchedAt: number | null,
  cloudUpdatedAt: string | null,
): 'local' | 'cloud' | 'none' {
  if (localTouchedAt == null && cloudUpdatedAt == null) return 'none';
  if (cloudUpdatedAt == null) return 'local';
  if (localTouchedAt == null) return 'cloud';
  return Date.parse(cloudUpdatedAt) > localTouchedAt ? 'cloud' : 'local';
}

export function createCloudPush(
  push: (env: SaveEnvelopeV1) => Promise<void>,
  opts: { debounceMs?: number } = {},
) {
  const debounceMs = opts.debounceMs ?? 30_000;
  let pending: SaveEnvelopeV1 | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function fire(): Promise<void> {
    if (pending == null) return;
    const env = pending;
    pending = null;
    try {
      await push(env);
    } catch {
      // Sessiz: offline/likidite sorunu oyunu bozmasin; sonraki schedule yeniden dener.
    }
  }

  return {
    schedule(env: SaveEnvelopeV1): void {
      pending = env;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => void fire(), debounceMs);
    },
    async flush(): Promise<void> {
      if (timer != null) clearTimeout(timer);
      await fire();
    },
  };
}
```

- [ ] **Step 4: Testin PASS ettiğini gör**

Run: `npx vitest run src/lib/stores/cloudSave.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/cloudSave.ts src/lib/stores/cloudSave.test.ts
git commit -m "feat(stores): bulut kayit secimi + debounce push (TDD)"
```

---

### Task 6: Oturum bootstrap (anonim giriş + Turnstile)

**Files:**
- Create: `src/lib/api/authBootstrap.ts`
- Test: `src/lib/api/authBootstrap.test.ts`
- Create: `src/lib/api/turnstile.ts` (tarayıcı yardımcıisi — DOM'a bağımlı, unit test yok; Task 9 manuel listesinde doğrulanır)

**Interfaces:**
- Consumes: `data.supabase` (Task 3).
- Produces:
  - `ensureSession(auth: AuthLike, getCaptchaToken: () => Promise<string>): Promise<void>` — Task 9 boot'ta çağırır.
  - `getTurnstileToken(siteKey: string): Promise<string>` — görünmez widget çalıştırır, token döner.

- [ ] **Step 1: Failing test yaz**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ensureSession } from './authBootstrap';

function makeAuth(session: object | null) {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session } }),
    signInAnonymously: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe('ensureSession', () => {
  it('oturum varsa captcha/signIn hiç çağrılmaz', async () => {
    const auth = makeAuth({ user: {} });
    const getToken = vi.fn();
    await ensureSession(auth, getToken);
    expect(getToken).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('oturum yoksa captcha token alıp anonim giriş yapar', async () => {
    const auth = makeAuth(null);
    const getToken = vi.fn().mockResolvedValue('tok-123');
    await ensureSession(auth, getToken);
    expect(auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'tok-123' } });
  });

  it('signIn hatası fırlatılır (çağıran karar verir)', async () => {
    const auth = makeAuth(null);
    auth.signInAnonymously.mockResolvedValue({ error: new Error('captcha fail') });
    await expect(ensureSession(auth, async () => 't')).rejects.toThrow('captcha fail');
  });
});
```

- [ ] **Step 2: Testin FAIL ettiğini gör**

Run: `npx vitest run src/lib/api/authBootstrap.test.ts`
Expected: FAIL — "Cannot find module './authBootstrap'".

- [ ] **Step 3: `authBootstrap.ts` yaz**

```ts
/**
 * Ilk acilista sessiz misafir oturumu (spec §5). Turnstile token'i anonim
 * girise eklenir (spec §6 — anon hesap spam koruması). Supabase client'inin
 * yalniz auth alt-kumesine bagimliyiz ki unit test fake ile yazilabilsin.
 */
export interface AuthLike {
  getSession(): Promise<{ data: { session: object | null } }>;
  signInAnonymously(opts: { options: { captchaToken: string } }): Promise<{ error: Error | null }>;
}

export async function ensureSession(
  auth: AuthLike,
  getCaptchaToken: () => Promise<string>,
): Promise<void> {
  const {
    data: { session },
  } = await auth.getSession();
  if (session) return;
  const captchaToken = await getCaptchaToken();
  const { error } = await auth.signInAnonymously({ options: { captchaToken } });
  if (error) throw error;
}
```

- [ ] **Step 4: Testin PASS ettiğini gör**

Run: `npx vitest run src/lib/api/authBootstrap.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: `turnstile.ts` yaz** (DOM yardımcıisi)

```ts
/**
 * Cloudflare Turnstile gorunmez widget yardimcisi. Script bir kez enjekte
 * edilir; getTurnstileToken her cagrida gecici container'da execute eder.
 * SP3b CSP notu: script-src + frame-src'e challenges.cloudflare.com eklenecek.
 */
type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile yüklenemedi')));
    s.onerror = () => reject(new Error('turnstile script hatası'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export async function getTurnstileToken(siteKey: string): Promise<string> {
  const turnstile = await loadScript();
  const container = document.createElement('div');
  document.body.appendChild(container);
  try {
    return await new Promise<string>((resolve, reject) => {
      // Not: "Invisible" davranisi Cloudflare dashboard'da widget modu olarak secilir
      // (Task 0); render()'a size parametresi GECILMEZ.
      const widgetId = turnstile.render(container, {
        sitekey: siteKey,
        callback: (token: string) => {
          turnstile.remove(widgetId);
          resolve(token);
        },
        'error-callback': () => {
          turnstile.remove(widgetId);
          reject(new Error('turnstile doğrulaması başarısız'));
        },
      });
    });
  } finally {
    container.remove();
  }
}
```

- [ ] **Step 6: Doğrula ve commit**

Run: `npm run check` sonra `npx vitest run src/lib/api/authBootstrap.test.ts`
Expected: ikisi de PASS.

```bash
git add src/lib/api/authBootstrap.ts src/lib/api/authBootstrap.test.ts src/lib/api/turnstile.ts
git commit -m "feat(auth): anonim oturum bootstrap + turnstile yardimcisi"
```

---

### Task 7: `/api/profile` — takma ad kaydı (sunucu tarafı filtre)

**Files:**
- Create: `src/routes/api/profile/+server.ts`

**Interfaces:**
- Consumes: `locals.safeGetSession()` (Task 3), `validateNickname` (Task 4).
- Produces: `POST /api/profile` body `{ nickname: string }` → 200 `{ ok: true, nickname: string }` | 400 (format/küfür) | 401 (oturumsuz) | 409 (ad alınmış). Task 8 UI bu sözleşmeyi kullanır.

- [ ] **Step 1: Endpoint'i yaz**

```ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateNickname } from '$lib/domain/nickname/nickname';

// Takma ad client'tan dogrudan tabloya yazilmaz: filtre sunucuda da kosar
// (defense in depth), insert kullanicinin KENDI JWT'siyle yapilir — RLS gecerli kalir.
export const POST: RequestHandler = async ({ request, locals }) => {
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
```

- [ ] **Step 2: Doğrula ve commit**

Run: `npm run check`
Expected: PASS. (Canlı doğrulama Task 9 manuel listesinde: oturumsuz `curl` → 401.)

```bash
git add src/routes/api/profile/+server.ts
git commit -m "feat(api): takma ad kaydi endpoint'i (sunucu tarafi filtre + RLS)"
```

---

### Task 8: Hesap silme + AccountPanel UI

**Files:**
- Create: `src/routes/api/account/delete/+server.ts`
- Create: `src/lib/components/panels/AccountPanel.svelte`
- Modify: `src/routes/+page.svelte` (panel mount — Task 9'daki kablolamayla birlikte de yapılabilir)

**Interfaces:**
- Consumes: `locals.safeGetSession()`, `SUPABASE_SECRET_KEY`, `data.supabase` (linkIdentity/signOut), `POST /api/profile` (Task 7), `clearSave` (`src/lib/stores/savegame.ts`).
- Produces: `POST /api/account/delete` → 200 `{ ok: true }` | 401; `AccountPanel.svelte` (props yok — layout data'sını `page` store yerine `$props` zinciriyle almak için `+page.svelte`'den `supabase` prop'u geçilir: `<AccountPanel supabase={data.supabase} />`).

- [ ] **Step 1: Silme endpoint'ini yaz** (KVKK — spec §7)

```ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

// KVKK hesap silme (spec §7): auth.users satiri silinir; profiles/saves
// "on delete cascade" FK'lariyla otomatik gider. Secret key YALNIZ burada,
// kimligi dogrulanmis kullanicinin KENDI hesabi icin kullanilir.
export const POST: RequestHandler = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) error(401, 'Oturum gerekli');

  const admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    console.error('[api/account/delete] silme hatası', delError);
    error(500, 'Hesap silinemedi');
  }
  return json({ ok: true });
};
```

- [ ] **Step 2: `AccountPanel.svelte` yaz** (mevcut panel estetiği: `term.*` + `font-mono`; ~150 satır)

```svelte
<script lang="ts">
  import type { SupabaseClient, User } from '@supabase/supabase-js';
  import { validateNickname } from '$lib/domain/nickname/nickname';
  import { clearSave } from '$lib/stores/savegame';

  let { supabase }: { supabase: SupabaseClient } = $props();

  let user = $state<User | null>(null);
  let nickname = $state('');
  let savedNickname = $state<string | null>(null);
  let message = $state<string | null>(null);
  let confirmingDelete = $state(false);

  const isGoogleLinked = $derived(
    user?.identities?.some((i) => i.provider === 'google') ?? false,
  );

  $effect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      user = data.user;
      if (!data.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', data.user.id)
        .maybeSingle();
      savedNickname = profile?.nickname ?? null;
    });
  });

  async function linkGoogle() {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: location.origin },
    });
    if (error) message = 'Google bağlantısı başarısız: ' + error.message;
  }

  async function claimNickname() {
    const verdict = validateNickname(nickname);
    if (!verdict.ok) {
      message = verdict.reason;
      return;
    }
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: verdict.value }),
    });
    if (res.ok) {
      savedNickname = verdict.value;
      message = null;
    } else {
      message = (await res.json().catch(() => null))?.message ?? 'Kaydedilemedi';
    }
  }

  async function deleteAccount() {
    if (!confirmingDelete) {
      confirmingDelete = true;
      return;
    }
    const res = await fetch('/api/account/delete', { method: 'POST' });
    if (res.ok) {
      await supabase.auth.signOut();
      clearSave(localStorage);
      location.reload();
    } else {
      message = 'Hesap silinemedi, tekrar dene';
      confirmingDelete = false;
    }
  }
</script>

<section class="rounded border border-term-border bg-term-panel p-3 font-mono text-sm">
  <h2 class="mb-2 text-term-info">HESAP</h2>

  {#if user == null}
    <p class="text-term-dim">Oturum açılıyor…</p>
  {:else}
    <p class="mb-2">
      Durum:
      {#if isGoogleLinked}
        <span class="text-term-up">Google bağlı</span>
      {:else}
        <span class="text-term-warn">Misafir</span>
        <button class="ml-2 border border-term-border px-2 py-0.5 hover:bg-term-border" onclick={linkGoogle}>
          GOOGLE İLE BAĞLA
        </button>
      {/if}
    </p>

    <div class="mb-2 flex items-center gap-2">
      <label for="nickname" class="text-term-dim">Takma ad:</label>
      {#if savedNickname}
        <span class="text-term-up">{savedNickname}</span>
      {:else}
        <input
          id="nickname"
          class="w-40 border border-term-border bg-transparent px-1"
          bind:value={nickname}
          maxlength="20"
        />
        <button class="border border-term-border px-2 py-0.5 hover:bg-term-border" onclick={claimNickname}>
          AL
        </button>
      {/if}
    </div>

    <button class="text-term-down underline" onclick={deleteAccount}>
      {confirmingDelete ? 'EMİN MİSİN? (geri dönüşü yok)' : 'Hesabımı ve verilerimi sil'}
    </button>
  {/if}

  {#if message}
    <p class="mt-2 text-term-warn">{message}</p>
  {/if}
</section>
```

Not: `term.*` token adları (`term-border`, `term-panel`, `term-info`, `term-up`, `term-down`, `term-warn`, `term-dim`) `tailwind.config.ts`'te farklıysa oradakileri kullan — hard-coded hex YAZMA.

- [ ] **Step 3: Doğrula ve commit**

Run: `npm run check` sonra `npm run test`
Expected: PASS.

```bash
git add src/routes/api/account/delete/+server.ts src/lib/components/panels/AccountPanel.svelte
git commit -m "feat(auth): hesap silme (KVKK) + hesap paneli"
```

---

### Task 9: Boot kablolaması (+page.svelte) + uçtan uca doğrulama

**Files:**
- Modify: `src/routes/+page.svelte` (satır 34-50 civarı — mevcut `loadGame`/`onPersist` bloğu)

**Interfaces:**
- Consumes: Task 3 `data.supabase`, Task 5 `chooseSource`/`createCloudPush`/`LOCAL_TOUCHED_KEY`, Task 6 `ensureSession`/`getTurnstileToken`, Task 8 `AccountPanel`.

- [ ] **Step 1: `+page.svelte` boot bloğunu güncelle**

Mevcut yapı korunur (store senkron kurulur, oyun hemen başlar); bulut işleri arkadan gelir. Script bölümüne eklenecek/değişecek parçalar:

```ts
import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
import { ensureSession } from '$lib/api/authBootstrap';
import { getTurnstileToken } from '$lib/api/turnstile';
import { chooseSource, createCloudPush, LOCAL_TOUCHED_KEY } from '$lib/stores/cloudSave';
import { saveGame, type SaveEnvelopeV1 } from '$lib/stores/savegame';
import AccountPanel from '$lib/components/panels/AccountPanel.svelte';

let { data } = $props();

const CLOUD_HYDRATED_KEY = 'miras.cloudHydrated';

const cloudPush = createCloudPush(async (envelope: SaveEnvelopeV1) => {
  const {
    data: { user },
  } = await data.supabase.auth.getUser();
  if (!user) return; // oturum yoksa bulut yok — oyun localStorage ile yaşar
  await data.supabase
    .from('saves')
    .upsert({ user_id: user.id, payload: envelope, schema_version: envelope.v });
});
```

Mevcut `onPersist` callback'i şöyle genişler (saveGame satırı aynen kalır):

```ts
onPersist: (envelope) => {
  if (browser) {
    saveGame(localStorage, envelope);
    localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
    cloudPush.schedule(envelope);
  }
},
```

`onMount` içine boot senkronu (mevcut onMount varsa sonuna ekle, yoksa oluştur):

```ts
onMount(() => {
  void (async () => {
    try {
      await ensureSession(data.supabase.auth, () => getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY));
    } catch (err) {
      console.error('[auth] misafir oturumu açılamadı — çevrimdışı devam', err);
      return;
    }
    // Bulutta daha yeni kayıt var mı? (cihaz değişimi senaryosu)
    if (sessionStorage.getItem(CLOUD_HYDRATED_KEY)) return; // reload döngüsü kilidi
    const { data: row } = await data.supabase
      .from('saves')
      .select('payload, updated_at')
      .maybeSingle();
    const touched = Number(localStorage.getItem(LOCAL_TOUCHED_KEY)) || null;
    if (row && chooseSource(touched, row.updated_at) === 'cloud') {
      saveGame(localStorage, row.payload as SaveEnvelopeV1);
      localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
      sessionStorage.setItem(CLOUD_HYDRATED_KEY, '1');
      location.reload();
    }
  })();

  const flushOnHide = () => {
    if (document.visibilityState === 'hidden') void cloudPush.flush();
  };
  document.addEventListener('visibilitychange', flushOnHide);
  return () => document.removeEventListener('visibilitychange', flushOnHide);
});
```

Template'e paneli ekle (net servet panelinin altına, mevcut panel dizilimine uygun yere):

```svelte
<AccountPanel supabase={data.supabase} />
```

- [ ] **Step 2: Otomatik doğrulama**

Run: `npm run test` sonra `npm run check` sonra `npm run build`
Expected: test + check PASS; build'de Windows adapter-vercel symlink EPERM'i bilinen durum — onun dışında hata yok.

- [ ] **Step 3: Manuel doğrulama listesi** (dev server: `npm run dev`)

- [ ] İlk açılış: Network'te `signInAnonymously` çağrısı 200; Application → Cookies'te `sb-*` httpOnly cookie var; oyun normal başlıyor.
- [ ] İşlem yap → ~30 sn sonra Supabase Table Editor'da `saves` satırı oluştu.
- [ ] Hesap panelinden takma ad al → `profiles` satırı oluştu; aynı adı ikinci hesapla almayı dene → "Bu takma ad alınmış".
- [ ] Uygunsuz ad dene → reddedildi.
- [ ] "GOOGLE İLE BAĞLA" → consent → dönüşte durum "Google bağlı"; Supabase Auth → Users'ta aynı user id'de iki identity.
- [ ] Gizli pencerede aç (yeni misafir) → farklı user; ilk pencerenin kaydına ERİŞEMEDİĞİNİ Table Editor RLS "impersonate" aracıyla doğrula.
- [ ] Oturumsuz `curl -X POST http://localhost:5173/api/profile -d "{}"` → 401.
- [ ] "Hesabımı sil" (iki tık) → Auth Users'tan silindi, `profiles`/`saves` satırları cascade ile gitti, sayfa misafir olarak yeniden açıldı.
- [ ] MCP `get_advisors` (security) → yeni uyarı yok.

- [ ] **Step 4: Commit + memory güncelle**

`memory.md` Bölüm 2.I'ye tek satır ekle: "Hesap altyapısı (SP1): Google+misafir auth, bulut kayıt senkronu, takma ad, KVKK silme — canlı."

```bash
git add src/routes/+page.svelte memory.md
git commit -m "feat(auth): boot kablolamasi — misafir oturum + bulut senkron + hesap paneli"
```
