# SP1.5 — Giriş & Reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karşılama ekranı (Google + e-posta + misafir), sunucu taraflı auth callback'leri, her-yerde-geçerli reset (tombstone + jenerasyon + sahiplik) ve KVKK-tam hesap silme.

**Architecture:** Tüm auth/kayıt uzlaşma mantığı saf TS modüllerinde (`savegame.ts`, `cloudSave.ts`, `bootPhase.ts`) TDD ile yazılır; `+page.svelte` yalnız kablolama yapar. OAuth/e-posta token takasları sunucuda `locals.supabase` ile (`/auth/callback`, `/auth/confirm`). Spec: `docs/superpowers/specs/2026-07-09-sp15-giris-ve-reset-design.md` (K1-K8 kararları).

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript strict, Vitest, `@supabase/ssr`, Cloudflare Turnstile.

## Global Constraints

- Identifier'lar İngilizce, UI metinleri Türkçe; renkler yalnız `term.*` token'ları (`tailwind.config.ts`), `font-mono`.
- Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`) — legacy `$:` yazma.
- Component ~200 satırı geçerse parçala.
- **Yeni server-side Supabase client YARATMA** — her zaman `locals.supabase` (hooks'ta `ws` transport'lu kurulu). Yaratmak zorunda kalırsan `realtime: { transport: WebSocket }` şart (Vercel 500 verir — SP1 dersi).
- Yeni `$env/static` import'u ekleme (eklersen `.github/workflows/ci.yml`'a placeholder gerekir — bu planda GEREKMİYOR).
- TDD zorunlu: her mantık değişikliği önce kırmızı test.
- Her task sonunda commit; push YOK (kullanıcı "s" ritüeliyle push'lar).
- Kapanışlarda `npm run test` + `npm run check` + `npm run build` üçü de geçmeli.
- localStorage anahtarları tek evden: `src/lib/stores/savegame.ts` (bu plan `LOCAL_TOUCHED_KEY`'i oraya taşıyor).

---

## PARÇA 1 — Fazlar, karşılama (Google+misafir), reset/silme uzlaşması
*(e-postasız da yayınlanabilir bütün: Task 1-8)*

### Task 1: savegame.ts — anahtar evi + ownerId/resetAt/persist-guard helpers

**Files:**
- Modify: `src/lib/stores/savegame.ts`
- Modify: `src/lib/stores/cloudSave.ts` (yalnız `LOCAL_TOUCHED_KEY` tanımını SİL)
- Test: `src/lib/stores/savegame.test.ts`

**Interfaces (Produces):**
```ts
export const LOCAL_TOUCHED_KEY = 'miras.save.touchedAt';           // cloudSave'den taşındı
export function getOwnerId(storage: Storage): string | null;
export function setOwnerId(storage: Storage, userId: string): void;
export function clearOwnerId(storage: Storage): void;
export function getResetAt(storage: Storage): number | null;
export function markReset(storage: Storage, now: number): void;    // resetAt = now (üzerine yazar)
export function persistAllowed(storage: Storage, gameCreatedAt: number): boolean; // createdAt > resetAt
export function clearLocalIdentity(storage: Storage): void;        // resetAt'e DOKUNMAZ
```

- [ ] **Step 1: Kırmızı testleri yaz** — `savegame.test.ts`'e ekle (dosyadaki mevcut fake-Storage helper'ını kullan; yoksa şunu dosya başına ekle):

```ts
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}
```

```ts
import {
  getOwnerId, setOwnerId, clearOwnerId,
  getResetAt, markReset, persistAllowed,
  clearLocalIdentity, LOCAL_TOUCHED_KEY,
} from './savegame';

describe('ownerId damgası', () => {
  it('yokken null, set sonrası okunur, clear sonrası yine null', () => {
    const s = memStorage();
    expect(getOwnerId(s)).toBeNull();
    setOwnerId(s, 'user-abc');
    expect(getOwnerId(s)).toBe('user-abc');
    clearOwnerId(s);
    expect(getOwnerId(s)).toBeNull();
  });
});

describe('resetAt tombstone + persist guard', () => {
  it('markReset sonrası eski createdAt persist edilemez, yenisi edilir', () => {
    const s = memStorage();
    expect(persistAllowed(s, 1000)).toBe(true); // tombstone yokken serbest
    markReset(s, 5000);
    expect(getResetAt(s)).toBe(5000);
    expect(persistAllowed(s, 5000)).toBe(false); // eşitlik dahil ölü
    expect(persistAllowed(s, 4000)).toBe(false);
    expect(persistAllowed(s, 5001)).toBe(true);  // reset SONRASI kurulan oyun
  });
});

describe('clearLocalIdentity (KVKK)', () => {
  it('kimlik anahtarlarını siler, resetAt DURUR', () => {
    const s = memStorage();
    s.setItem('miras.playerId', 'p1');
    s.setItem(LOCAL_TOUCHED_KEY, '123');
    s.setItem('miras.cardSeen', '2026-07-10');
    s.setItem('miras.lastVisitPing', '2026-07-10');
    setOwnerId(s, 'user-abc');
    markReset(s, 42);
    clearLocalIdentity(s);
    expect(s.getItem('miras.playerId')).toBeNull();
    expect(s.getItem(LOCAL_TOUCHED_KEY)).toBeNull();
    expect(s.getItem('miras.cardSeen')).toBeNull();
    expect(s.getItem('miras.lastVisitPing')).toBeNull();
    expect(getOwnerId(s)).toBeNull();
    expect(getResetAt(s)).toBe(42); // tombstone kalır — zombi-sekme koruması
  });
});
```

- [ ] **Step 2: Testin kırmızı olduğunu doğrula** — Run: `npx vitest run src/lib/stores/savegame.test.ts` — Expected: FAIL ("getOwnerId is not exported" vb.)

- [ ] **Step 3: Implementasyon** — `savegame.ts`'e ekle (PLAYER_ID_KEY sabitinin yanına):

```ts
/** cloudSave'den taşındı — tüm localStorage anahtarları bu dosyada yaşar. */
export const LOCAL_TOUCHED_KEY = 'miras.save.touchedAt';
const OWNER_ID_KEY = 'miras.save.ownerId';
const RESET_AT_KEY = 'miras.resetAt';
// +page.svelte ve telemetry.ts'de tanımlı anahtarların literal'leri —
// clearLocalIdentity tek listeyi tutsun diye burada tekrarlanır:
const CARD_SEEN_KEY = 'miras.cardSeen';
const LAST_VISIT_KEY = 'miras.lastVisitPing';

/** Local kaydın hangi Supabase kullanıcısına ait olduğu (yabancı-oyun koruması, spec §4.D). */
export function getOwnerId(storage: Storage): string | null {
  return storage.getItem(OWNER_ID_KEY);
}
export function setOwnerId(storage: Storage, userId: string): void {
  storage.setItem(OWNER_ID_KEY, userId);
}
export function clearOwnerId(storage: Storage): void {
  storage.removeItem(OWNER_ID_KEY);
}

/** Bilinçli reset/silme anı — bu andan ÖNCE kurulmuş oyunlar ölüdür (tombstone). */
export function getResetAt(storage: Storage): number | null {
  const raw = storage.getItem(RESET_AT_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
export function markReset(storage: Storage, now: number): void {
  storage.setItem(RESET_AT_KEY, String(now));
}

/** Bayat sekme guard'ı: ölü jenerasyon localStorage'a geri yazılamaz (pendingWipe tek
 *  atımlıktı; canlı ikinci sekme her saniye persist ederek kaydı hortlatabiliyordu). */
export function persistAllowed(storage: Storage, gameCreatedAt: number): boolean {
  const resetAt = getResetAt(storage);
  return resetAt === null || gameCreatedAt > resetAt;
}

/** KVKK hesap silme: kimlik anahtarları gider; resetAt KALIR (kişisel veri değil,
 *  zombi-sekme koruması — spec §4.G). */
export function clearLocalIdentity(storage: Storage): void {
  storage.removeItem(PLAYER_ID_KEY);
  storage.removeItem(LOCAL_TOUCHED_KEY);
  storage.removeItem(CARD_SEEN_KEY);
  storage.removeItem(LAST_VISIT_KEY);
  storage.removeItem(OWNER_ID_KEY);
}
```

`cloudSave.ts`'te 8. satırdaki `export const LOCAL_TOUCHED_KEY = 'miras.save.touchedAt';` satırını SİL. `cloudSave.ts` içinde başka kullanımı yok; import edenler Task 6'da güncellenecek — bu task'ta `+page.svelte`'deki import'u şimdilik düzelt: `import { chooseSource, createCloudPush, LOCAL_TOUCHED_KEY } from '$lib/stores/cloudSave';` → `LOCAL_TOUCHED_KEY`'i oradan çıkarıp `savegame` import'una ekle (davranış değişmez).

- [ ] **Step 4: Yeşili doğrula** — Run: `npx vitest run src/lib/stores/savegame.test.ts src/lib/stores/cloudSave.test.ts` — Expected: PASS. Sonra `npm run check` — Expected: 0 error (import düzeltmesi tamam demektir).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(save): ownerId + resetAt tombstone + persist guard + clearLocalIdentity (TDD)"`

---

### Task 2: cloudSave.ts — chooseSource v2 (sahiplik/tombstone/jenerasyon) + push kapısı

**Files:**
- Modify: `src/lib/stores/cloudSave.ts`
- Test: `src/lib/stores/cloudSave.test.ts` (MEVCUT chooseSource/createCloudPush testleri yeni API'ye GÜNCELLENİR)

**Interfaces (Produces):**
```ts
export type SourceDecision = 'local' | 'cloud' | 'none' | 'local-adopt';
export interface ChooseSourceInput {
  localTouchedAt: number | null;   // miras.save.touchedAt
  localCreatedAt: number | null;   // local envelope yoksa null
  cloudUpdatedAt: string | null;   // saves.updated_at (ISO)
  cloudCreatedAt: number | null;   // cloud payload.game.createdAt; satır yoksa null
  resetAt: number | null;          // tombstone
  localOwnerId: string | null;     // miras.save.ownerId
  sessionUserId: string | null;    // aktif oturum user.id
}
export function chooseSource(input: ChooseSourceInput): SourceDecision;
export function createCloudPush(push, opts?): {
  schedule(env: SaveEnvelopeV1): void;   // enable() çağrılmadan no-op
  enable(): void;                        // boot uzlaşması bitince açılır
  cancel(): void;                        // bekleyen push + timer iptali (reset/silme)
  flush(): Promise<boolean>;             // true = bekleyen yoktu YA DA push başarılı
};
```

- [ ] **Step 1: chooseSource testlerini yeni API ile YENİDEN yaz** — mevcut `describe('chooseSource')` bloğunu tamamen şununla değiştir:

```ts
import { chooseSource, createCloudPush, type ChooseSourceInput } from './cloudSave';

function inp(over: Partial<ChooseSourceInput>): ChooseSourceInput {
  return {
    localTouchedAt: null, localCreatedAt: null,
    cloudUpdatedAt: null, cloudCreatedAt: null,
    resetAt: null, localOwnerId: null, sessionUserId: null,
    ...over,
  };
}
const T0 = Date.parse('2026-07-04T10:00:00Z');

describe('chooseSource v2', () => {
  it('ikisi de yoksa none; tek taraf varsa o', () => {
    expect(chooseSource(inp({}))).toBe('none');
    expect(chooseSource(inp({ localCreatedAt: T0, localTouchedAt: T0 }))).toBe('local');
    expect(chooseSource(inp({ cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z' }))).toBe('cloud');
  });

  it('tombstone: resetAt öncesi kurulan bulut oyunu diskalifiye (eşitlik dahil)', () => {
    expect(chooseSource(inp({ cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-05T10:00:00Z', resetAt: T0 }))).toBe('none');
    expect(chooseSource(inp({ cloudCreatedAt: T0 + 1, cloudUpdatedAt: '2026-07-05T10:00:00Z', resetAt: T0 }))).toBe('cloud');
  });

  it('jenerasyon: yeni kurulan oyun, eski oyunun daha taze kaydını yener', () => {
    // local yeni oyun (dün kuruldu), cloud eski oyun (geçen ay) ama updated_at daha taze:
    expect(chooseSource(inp({
      localCreatedAt: T0 + 86_400_000, localTouchedAt: T0 + 86_400_000,
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-06T10:00:00Z',
    }))).toBe('local');
    // tersi: cloud yeni oyun → cloud
    expect(chooseSource(inp({
      localCreatedAt: T0, localTouchedAt: T0 + 999_999_999,
      cloudCreatedAt: T0 + 86_400_000, cloudUpdatedAt: '2026-07-05T10:00:00Z',
    }))).toBe('cloud');
  });

  it('aynı jenerasyonda eski kural: updated_at > touchedAt → cloud, eşitlikte local', () => {
    expect(chooseSource(inp({
      localCreatedAt: T0, localTouchedAt: T0 + 5000,
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z',
    }))).toBe('local');
    expect(chooseSource(inp({
      localCreatedAt: T0, localTouchedAt: T0 - 5000,
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z',
    }))).toBe('cloud');
  });

  it('yabancı local: bulut varsa bulut sessizce kazanır (K5), yoksa local-adopt', () => {
    const yabanci = { localCreatedAt: T0 + 86_400_000, localTouchedAt: T0 + 86_400_000,
      localOwnerId: 'user-X', sessionUserId: 'user-Y' };
    expect(chooseSource(inp({ ...yabanci, cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z' }))).toBe('cloud');
    expect(chooseSource(inp(yabanci))).toBe('local-adopt');
  });

  it('ownerId null (legacy kayıt) yabancı SAYILMAZ — normal kurallar işler', () => {
    expect(chooseSource(inp({
      localCreatedAt: T0 + 86_400_000, localTouchedAt: T0 + 86_400_000,
      localOwnerId: null, sessionUserId: 'user-Y',
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-06T10:00:00Z',
    }))).toBe('local');
  });

  it('local envelope yokken touchedAt tek başına local seçtiremez', () => {
    expect(chooseSource(inp({ localTouchedAt: T0 + 999,
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z' }))).toBe('cloud');
  });
});
```

- [ ] **Step 2: createCloudPush testlerini güncelle + yenilerini ekle** — mevcut 3 testte `createCloudPush(...)` çağrısından hemen sonra `sync.enable();` satırı ekle (yeni default: kapalı). Sonra ekle:

```ts
describe('createCloudPush v2 — kapı/cancel/flush', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enable() çağrılmadan schedule no-op (boot uzlaşması kapısı)', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.schedule(env);
    await vi.advanceTimersByTimeAsync(5000);
    expect(push).not.toHaveBeenCalled();
    expect(await sync.flush()).toBe(true); // bekleyen yok
  });

  it('cancel() bekleyen push ve timer'ı iptal eder', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.enable();
    sync.schedule(env);
    sync.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(push).not.toHaveBeenCalled();
    expect(await sync.flush()).toBe(true);
  });

  it('flush başarıda true, push hatasında false döner', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.enable();
    sync.schedule(env);
    expect(await sync.flush()).toBe(false); // ilk push patladı
    sync.schedule(env);
    expect(await sync.flush()).toBe(true);
  });
});
```

- [ ] **Step 3: Kırmızıyı doğrula** — Run: `npx vitest run src/lib/stores/cloudSave.test.ts` — Expected: FAIL (yeni imzalar yok).

- [ ] **Step 4: Implementasyon** — `cloudSave.ts`'i şu içerikle güncelle (dosyanın tamamı):

```ts
/**
 * Bulut kayit senkronu (spec §5 + SP1.5 §4.D-E): localStorage birincil kalir; bulut push
 * debounce'ludur, boot uzlasmasi bitmeden kapalidir ve hatasi oyunu ASLA durdurmaz.
 * Kaynak secimi: sahiplik → tombstone → jenerasyon → tazelik.
 */
import type { SaveEnvelopeV1 } from './savegame';

export type SourceDecision = 'local' | 'cloud' | 'none' | 'local-adopt';

export interface ChooseSourceInput {
  localTouchedAt: number | null;
  localCreatedAt: number | null;
  cloudUpdatedAt: string | null;
  cloudCreatedAt: number | null;
  resetAt: number | null;
  localOwnerId: string | null;
  sessionUserId: string | null;
}

export function chooseSource(i: ChooseSourceInput): SourceDecision {
  // Tombstone: bilincli reset edilen jenerasyon hicbir cihazdan geri gelemez (spec §4.E).
  const cloudAlive =
    i.cloudCreatedAt != null && !(i.resetAt != null && i.cloudCreatedAt <= i.resetAt);
  const hasLocal = i.localCreatedAt != null;
  // Yabanci local: kayit baska kullaniciya damgali (paylasilan cihaz, spec §4.D k1 / K5).
  const foreign =
    hasLocal && i.localOwnerId != null && i.sessionUserId != null &&
    i.localOwnerId !== i.sessionUserId;
  if (foreign) return cloudAlive ? 'cloud' : 'local-adopt';
  if (!hasLocal && !cloudAlive) return 'none';
  if (!hasLocal) return 'cloud';
  if (!cloudAlive) return 'local';
  // Jenerasyon: yeni kurulan OYUN eski oyunun taze kaydini yener (reset yayilimi).
  if (i.localCreatedAt !== i.cloudCreatedAt)
    return i.cloudCreatedAt! > i.localCreatedAt! ? 'cloud' : 'local';
  // Ayni oyun, iki kopya: yeni-olan-kazanir, esitlikte local (gereksiz reload yok).
  if (i.cloudUpdatedAt == null) return 'local';
  if (i.localTouchedAt == null) return 'cloud';
  return Date.parse(i.cloudUpdatedAt) > i.localTouchedAt ? 'cloud' : 'local';
}

export function createCloudPush(
  push: (env: SaveEnvelopeV1) => Promise<void>,
  opts: { debounceMs?: number } = {},
) {
  const debounceMs = opts.debounceMs ?? 30_000;
  let enabled = false; // boot uzlasmasi (chooseSource karari) bitmeden push yok — yaris kapisi
  let pending: SaveEnvelopeV1 | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function fire(): Promise<boolean> {
    if (pending == null) return true;
    const env = pending;
    pending = null;
    try {
      await push(env);
      return true;
    } catch {
      // Sessiz: offline oyunu bozmasin; sonraki schedule yeniden dener.
      return false;
    }
  }

  return {
    schedule(env: SaveEnvelopeV1): void {
      if (!enabled) return;
      pending = env;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => void fire(), debounceMs);
    },
    enable(): void {
      enabled = true;
    },
    cancel(): void {
      pending = null;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    async flush(): Promise<boolean> {
      if (timer != null) clearTimeout(timer);
      return fire();
    },
  };
}
```

- [ ] **Step 5: Yeşili doğrula** — Run: `npx vitest run src/lib/stores/cloudSave.test.ts` — Expected: PASS. **Not:** `+page.svelte` bu noktada eski `chooseSource(touched, row.updated_at)` çağrısıyla type-error verir — `npm run check` Task 6'ya kadar kırık kalabilir; sadece vitest yeşilliğine bak. Eğer aynı oturumda Task 6'ya geçilmeyecekse `+page.svelte:235`'teki çağrıyı geçici olarak `chooseSource({ localTouchedAt: touched, localCreatedAt: initial?.game.createdAt ?? null, cloudUpdatedAt: row?.updated_at ?? null, cloudCreatedAt: (row?.payload as SaveEnvelopeV1 | null)?.game.createdAt ?? null, resetAt: null, localOwnerId: null, sessionUserId: null })` yap ve `if (row && ... === 'cloud')` koşulunu koru (davranış bugünküyle aynı kalır).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(cloud): chooseSource v2 (sahiplik+tombstone+jenerasyon) + push kapısı/cancel/flush-bool (TDD)"`

---

### Task 3: bootPhase.ts — initialPhase saf fonksiyonu

**Files:**
- Create: `src/lib/stores/bootPhase.ts`
- Test: `src/lib/stores/bootPhase.test.ts`

**Interfaces (Produces):**
```ts
export type StartPhase = 'boot' | 'welcome' | 'intro';
export function initialPhase(hasLocalSave: boolean, hasSession: boolean | undefined): StartPhase;
```

- [ ] **Step 1: Kırmızı test** — `bootPhase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialPhase } from './bootPhase';

describe('initialPhase (spec §4.A)', () => {
  it('local kayıt varsa oturumdan bağımsız intro (flash yok)', () => {
    expect(initialPhase(true, undefined)).toBe('intro');
    expect(initialPhase(true, true)).toBe('intro');
    expect(initialPhase(true, false)).toBe('intro');
  });
  it('kayıt yok + oturum bilinmiyor → boot (BAĞLANIYOR…)', () => {
    expect(initialPhase(false, undefined)).toBe('boot');
  });
  it('kayıt yok + oturum var → intro (hidrasyon boot ekranında beklenir)', () => {
    expect(initialPhase(false, true)).toBe('intro');
  });
  it('kayıt yok + oturum yok → welcome', () => {
    expect(initialPhase(false, false)).toBe('welcome');
  });
});
```

- [ ] **Step 2: Kırmızıyı doğrula** — Run: `npx vitest run src/lib/stores/bootPhase.test.ts` — Expected: FAIL (modül yok).

- [ ] **Step 3: Implementasyon** — `bootPhase.ts`:

```ts
/** Açılış fazı kararı (spec §4.A). 'boot' yalnız oturum durumu henüz bilinmiyorken;
 *  local kayıt her zaman senkron intro açar — mevcut kullanıcıya flash/regresyon yok. */
export type StartPhase = 'boot' | 'welcome' | 'intro';

export function initialPhase(
  hasLocalSave: boolean,
  hasSession: boolean | undefined,
): StartPhase {
  if (hasLocalSave) return 'intro';
  if (hasSession === undefined) return 'boot';
  return hasSession ? 'intro' : 'welcome';
}
```

- [ ] **Step 4: Yeşili doğrula** — Run: `npx vitest run src/lib/stores/bootPhase.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(boot): initialPhase saf fonksiyonu (TDD)"`

---

### Task 4: /auth/callback rotası + migration 0003

**Files:**
- Create: `src/routes/auth/callback/+server.ts`
- Create: `src/routes/auth/callback/server.test.ts`
- Create: `supabase/migrations/0003_saves_delete.sql`

**Interfaces (Consumes):** `locals.supabase` + `App.Locals` (mevcut, `app.d.ts`).
**Interfaces (Produces):** `GET /auth/callback?code=...` → 303 `/`; hata → 303 `/?auth_error=1`. Migration: `authenticated` rolüne `saves` DELETE (yalnız kendi satırı).

- [ ] **Step 1: Kırmızı test** — `server.test.ts` (SvelteKit `redirect()` fırlatır — test throw'u yakalar):

```ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from './+server';

function call(url: string, exchangeResult: { error: Error | null }) {
  const exchange = vi.fn().mockResolvedValue(exchangeResult);
  const event = {
    url: new URL(url),
    locals: { supabase: { auth: { exchangeCodeForSession: exchange } } },
  } as any;
  return { event, exchange };
}
async function expectRedirect(p: Promise<unknown>, location: string) {
  try {
    await p;
    expect.unreachable('redirect fırlatmalıydı');
  } catch (e) {
    expect((e as { status: number }).status).toBe(303);
    expect((e as { location: string }).location).toBe(location);
  }
}

describe('GET /auth/callback', () => {
  it('code takası başarılı → 303 /', async () => {
    const { event, exchange } = call('http://localhost/auth/callback?code=abc', { error: null });
    await expectRedirect(GET(event), '/');
    expect(exchange).toHaveBeenCalledWith('abc');
  });
  it('takas hatası → 303 /?auth_error=1', async () => {
    const { event } = call('http://localhost/auth/callback?code=abc', { error: new Error('bad') });
    await expectRedirect(GET(event), '/?auth_error=1');
  });
  it('code yok (kullanıcı vazgeçti / ?error döndü) → 303 /?auth_error=1', async () => {
    const { event, exchange } = call('http://localhost/auth/callback?error=access_denied', { error: null });
    await expectRedirect(GET(event), '/?auth_error=1');
    expect(exchange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Kırmızıyı doğrula** — Run: `npx vitest run src/routes/auth/callback/server.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementasyon** — `+server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// OAuth/PKCE donusu (spec §4.C): takas SUNUCUDA, locals.supabase ile (ws-transport'lu,
// yeni client yaratma). Hedef SABIT '/' — kullanici-kontrollu redirect yok (open-redirect kapali).
export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(303, '/');
  }
  redirect(303, '/?auth_error=1');
};
```

- [ ] **Step 4: Yeşili doğrula** — Run: `npx vitest run src/routes/auth/callback/server.test.ts` — Expected: PASS (3/3).

- [ ] **Step 5: Migration dosyası** — `supabase/migrations/0003_saves_delete.sql`:

```sql
-- 0003_saves_delete: reset'in bulut silmesi (spec §4.E/§4.I).
-- RLS using (user_id = auth.uid()) baskasinin satirini silmeyi engeller — yetki yukseltmesi yok.
grant delete on table public.saves to authenticated;
create policy saves_delete_own on public.saves
  for delete to authenticated using (user_id = auth.uid());
```

**Not (uygulama anı, insan/controller):** migration canlı DB'ye deploy'dan önce uygulanmalı — Supabase MCP `apply_migration` ya da SQL Editor. Kod tarafı migration uygulanmadan da çalışır (delete çağrısı 42501 döner, `catch` yutar — ama reset-bulut silme fiilen çalışmaz; Task 8 manuel checklist'i bunu doğruluyor).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(auth): /auth/callback sunucu takası + saves DELETE migration'ı (TDD)"`

---

### Task 5: WelcomeScreen component'ı (Parça 1 sürümü: Google + misafir + çevrimdışı)

**Files:**
- Create: `src/lib/components/WelcomeScreen.svelte`

**Interfaces (Produces):** props `{ busy: boolean; errorMsg: string | null; onGoogle: () => void; onGuest: () => void; onOffline: () => void }`. (Parça 2 Task 11 e-posta butonunu ekleyecek.)

- [ ] **Step 1: Component'ı yaz** (UI-only, unit test yok — `npm run check` + manuel; intro ekranının stil dilini birebir taşır):

```svelte
<script lang="ts">
	let {
		busy,
		errorMsg,
		onGoogle,
		onGuest,
		onOffline,
	}: {
		busy: boolean;
		errorMsg: string | null;
		onGoogle: () => void;
		onGuest: () => void;
		onOffline: () => void;
	} = $props();
</script>

<main class="min-h-[100dvh] flex items-center justify-center px-4">
	<div class="w-full max-w-sm space-y-6">
		<div class="text-center space-y-2">
			<div class="text-term-green text-xl font-bold glow-text-green tracking-widest">
				[ MİRAS — CANLI ÇEKİRDEK ]
			</div>
			<div class="text-term-blue text-xs tracking-widest uppercase">Mod: CANLI</div>
			<div class="text-term-text text-xs opacity-60">$1.000.000 USD · Gerçek piyasa verileri</div>
		</div>

		<div class="space-y-3">
			<button
				type="button"
				onclick={onGoogle}
				disabled={busy}
				class="w-full py-3 bg-term-bg border border-term-blue text-term-blue font-bold
				       text-sm tracking-widest uppercase hover:bg-term-panelLight transition-colors
				       disabled:opacity-40 disabled:cursor-not-allowed"
			>
				GOOGLE İLE GİRİŞ
			</button>

			<div>
				<button
					type="button"
					onclick={onGuest}
					disabled={busy}
					class="w-full py-3 bg-term-bg border border-term-green text-term-green font-bold
					       text-sm tracking-widest uppercase hover:bg-term-panelLight
					       glow-border-green transition-colors
					       disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{busy ? 'AÇILIYOR…' : 'MİSAFİR OLARAK OYNA'}
				</button>
				<p class="mt-1 text-center text-[10px] text-term-text opacity-40">
					Yeni bulut kimliği oluşturur
				</p>
			</div>
		</div>

		{#if errorMsg}
			<div class="text-center space-y-2">
				<p class="text-term-amber text-xs">{errorMsg}</p>
				<button
					type="button"
					onclick={onOffline}
					class="text-[10px] text-term-text opacity-50 underline hover:opacity-80 transition-opacity"
				>
					yine de çevrimdışı oyna (kayıt yalnız bu cihazda)
				</button>
			</div>
		{/if}
	</div>
</main>
```

- [ ] **Step 2: Doğrula** — Run: `npm run check` — Expected: 0 error (component henüz mount edilmiyor, sadece derlenebilirlik).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(ui): WelcomeScreen component'ı (Google + misafir + çevrimdışı fallback)"`

---

### Task 6: +page.svelte boot yeniden kablolaması (fazlar, kimlik ertelemesi, uzlaşma, reset v2)

**Files:**
- Modify: `src/routes/+page.svelte` (script bölümü büyük ölçüde; template'e boot/welcome dalları)

**Interfaces (Consumes):** Task 1-5'in tüm export'ları.
**Interfaces (Produces):** `handleSignOut`, `handleAccountDeleted`, `handleSwitchAccount`, `handleGuestFromPanel` — Task 7 AccountPanel bunları prop alacak.

**Dikkat:** Bu task'ta unit test yok (Svelte sayfası; domain mantığı Task 1-3'te test edildi). Kapı: `npm run test` (regresyon) + `npm run check` + manuel tarayıcı kontrolü.

- [ ] **Step 1: Import'ları güncelle** — `+page.svelte` başında:

```ts
import {
	loadGame, saveGame, clearSave, getOrCreatePlayerId, loadHistory, saveHistory,
	markPendingWipe, consumePendingWipe,
	LOCAL_TOUCHED_KEY, getOwnerId, setOwnerId, clearOwnerId,
	getResetAt, markReset, persistAllowed, clearLocalIdentity,
	type SaveEnvelopeV1,
} from '$lib/stores/savegame';
import { chooseSource, createCloudPush } from '$lib/stores/cloudSave';
import { initialPhase, type StartPhase } from '$lib/stores/bootPhase';
import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
```

- [ ] **Step 2: Modül-seviyesi kimlik/ping/store kurulumunu değiştir** — mevcut 47-80 satır bölgesindeki `const playerId = ...`, `pingDailyVisit(...)`, `const cloudPush = ...`, `const store = createLiveGameStore({...})` bloklarını şununla değiştir:

```ts
if (browser) consumePendingWipe(sessionStorage, localStorage);

const initial = browser ? loadGame(localStorage) : null;
const initialHistory = browser ? loadHistory(localStorage)?.history : undefined;

// Kimlik ERTELENDİ (spec §4.F): playerId/telemetri yalnız oyuna girişte üretilir.
let playerId = $state<string | null>(null);

const cloudPush = createCloudPush(async (envelope: SaveEnvelopeV1) => {
	const {
		data: { user },
	} = await data.supabase.auth.getUser();
	if (!user) return; // oturum yoksa bulut yok — oyun localStorage ile yaşar
	if (getOwnerId(localStorage) !== user.id) return; // yabancı oyun kullanıcının kasasına yazılmaz
	await data.supabase
		.from('saves')
		.upsert({ user_id: user.id, payload: envelope, schema_version: envelope.v });
});

// Bayat-sekme tombstone guard'ının history persist'ine taşınması için son karar tutulur.
let lastPersistAllowed = true;

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

// Kayıtlı oyun: store hemen kurulur (bugünkü davranış). Yeni oyun: girişte kurulur.
let store = $state<LiveGameStore | null>(browser && initial ? makeStore(initial) : null);
```

- [ ] **Step 3: Faz durumunu değiştir** — `let phase = $state<'intro' | 'playing'>('intro');` yerine:

```ts
let phase = $state<StartPhase | 'playing'>(initialPhase(initial !== null, undefined));
let welcomeBusy = $state(false);
let welcomeError = $state<string | null>(null);
```

- [ ] **Step 4: store'a bağlı derived/fonksiyonları null-guard'la** — tek tek:

```ts
const canShowCard = $derived(store !== null && store.netWorthUsd !== null && store.vsUsdHoldUsd !== null);
const breakdown = $derived(dailyBreakdown(store?.history ?? []));
const closingCardModel = $derived.by(() => {
	if (!store || store.netWorthUsd === null || store.vsUsdHoldUsd === null) return null;
	return buildClosingCardModel(store.game, store.netWorthUsd, store.vsUsdHoldUsd, store.history, nowMs);
});
```
`maybeAutoShowCard` içine ilk satır: `if (!browser || !store || !canShowCard) return;` (mevcut `!canShowCard` kontrolünün yerine). `onDestroy`'da `store.stop()` → `store?.stop()`. `handleShareClick`/`handleShareResult` içinde `sendTelemetry(playerId, ...)` → `if (playerId) sendTelemetry(playerId, ...)`.

- [ ] **Step 5: Oyuna giriş fonksiyonu** — `startTicking/handleStart/handleContinue` üçlüsünü şununla değiştir:

```ts
async function enterGame() {
	if (!browser) return;
	// Kimlik + günlük ziyaret pingi YALNIZ burada üretilir (spec §4.F — KVKK).
	const pid = getOrCreatePlayerId(localStorage);
	playerId = pid;
	pingDailyVisit(localStorage, pid, istanbulParts(new Date()).key);
	if (!store) store = makeStore(null, pid);
	// Yeni oyun + oturum varsa sahiplik damgası (benimseme anı, spec §4.D).
	try {
		const {
			data: { user },
		} = await data.supabase.auth.getUser();
		if (user && getOwnerId(localStorage) === null) setOwnerId(localStorage, user.id);
	} catch {
		// oturum okunamadı — çevrimdışı devam, damga sonraki boot'ta
	}
	phase = 'playing';
	tick = setInterval(() => (nowMs = Date.now()), 1000);
	await store.start();
	maybeAutoShowCard();
}
function handleStart() {
	void enterGame();
}
function handleContinue() {
	void enterGame();
}
```

- [ ] **Step 6: Welcome handler'ları ekle**:

```ts
function handleGoogle() {
	void data.supabase.auth.signInWithOAuth({
		provider: 'google',
		options: { redirectTo: location.origin + '/auth/callback' },
	});
}

async function handleGuest() {
	welcomeBusy = true;
	welcomeError = null;
	try {
		await ensureSession(data.supabase.auth, () => getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY));
		const {
			data: { user },
		} = await data.supabase.auth.getUser();
		if (user) setOwnerId(localStorage, user.id);
		cloudPush.enable(); // taze misafir: uzlaşacak bulut kaydı yok
		await enterGame();
	} catch (err) {
		console.error('[auth] misafir oturumu açılamadı', err);
		welcomeError = 'Misafir oturumu açılamadı — tekrar dene ya da çevrimdışı oyna';
	} finally {
		welcomeBusy = false;
	}
}

function handleOfflinePlay() {
	// Oturum yok: cloudPush kapalı kalır (push zaten getUser null'da no-op). Spec §4.B fail-safe.
	void enterGame();
}
```

- [ ] **Step 7: Reset v2** — `handleResetSave`'i değiştir:

```ts
async function handleResetSave() {
	if (!browser) return;
	cloudPush.cancel(); // visibilitychange flush'ı eski envelope'u geri push etmesin
	markPendingWipe(sessionStorage);
	clearSave(localStorage);
	localStorage.removeItem(LOCAL_TOUCHED_KEY);
	clearOwnerId(localStorage);
	sessionStorage.removeItem(CLOUD_HYDRATED_KEY);
	markReset(localStorage, Date.now()); // tombstone: eski jenerasyon her yerde ölü
	try {
		const {
			data: { user },
		} = await data.supabase.auth.getUser();
		if (user) await data.supabase.from('saves').delete().eq('user_id', user.id);
	} catch {
		// çevrimdışı: tombstone bu cihazı korur; yeni oyun push'u diğerlerini yakınsar
	}
	location.reload();
}
```
Intro'daki buton `onclick={handleResetSave}` → `onclick={() => void handleResetSave()}`.

- [ ] **Step 8: Hesap silme / çıkış / hesap-geçiş dizileri (AccountPanel'in prop'ları)**:

```ts
async function handleAccountDeleted() {
	// POST /api/account/delete BAŞARILI döndü — local dünyayı tamamen temizle (spec §4.G).
	cloudPush.cancel();
	try {
		await data.supabase.auth.signOut();
	} catch {
		// oturum sunucuda zaten ölü (kullanıcı silindi) — local temizlik yeter
	}
	markPendingWipe(sessionStorage);
	clearSave(localStorage);
	clearLocalIdentity(localStorage);
	sessionStorage.removeItem(CLOUD_HYDRATED_KEY);
	markReset(localStorage, Date.now()); // zombi-sekme koruması silmede de (spec §4.G)
	location.reload();
}

async function handleSignOut(): Promise<string | null> {
	// Dönüş: hata mesajı (null = başarılı). Yalnız kalıcı hesapta çağrılır (panel gizler).
	const flushed = await cloudPush.flush();
	if (!flushed) return 'Son ilerleme buluta gönderilemedi — bağlantını kontrol edip tekrar dene';
	const { error } = await data.supabase.auth.signOut();
	if (error) return 'Çıkış yapılamadı — bağlantını kontrol et';
	markPendingWipe(sessionStorage);
	clearSave(localStorage);
	localStorage.removeItem(LOCAL_TOUCHED_KEY);
	clearOwnerId(localStorage);
	sessionStorage.removeItem(CLOUD_HYDRATED_KEY);
	location.reload();
	return null;
}

async function handleSwitchAccount() {
	// identity_already_exists: misafir oyunundan VAZGEÇ, welcome'a dön (spec §4.H).
	cloudPush.cancel();
	try {
		await data.supabase.auth.signOut();
	} catch {
		// signOut hatasında da local'i temizleyip welcome'a düşmek güvenli
	}
	markPendingWipe(sessionStorage);
	clearSave(localStorage);
	localStorage.removeItem(LOCAL_TOUCHED_KEY);
	clearOwnerId(localStorage);
	sessionStorage.removeItem(CLOUD_HYDRATED_KEY);
	location.reload();
}

async function handleGuestFromPanel() {
	// Oturumsuz durumdan misafir oturumu aç (spec §4.K) — reload boot uzlaşmasını işletir.
	await ensureSession(data.supabase.auth, () => getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY));
	const {
		data: { user },
	} = await data.supabase.auth.getUser();
	if (user && getOwnerId(localStorage) === null) setOwnerId(localStorage, user.id);
	location.reload();
}
```

- [ ] **Step 9: onMount'u yeniden yaz** — mevcut `onMount(() => { void (async () => { ensureSession... })(); ... })` bloğunu değiştir:

```ts
onMount(() => {
	// OAuth hata dönüşü: fazdan bağımsız toast + URL temizliği (spec §4.C).
	const params = new URLSearchParams(location.search);
	if (params.has('auth_error')) {
		showToast('Giriş tamamlanamadı — tekrar dene');
		history.replaceState(null, '', '/');
	}

	void (async () => {
		const {
			data: { session },
		} = await data.supabase.auth.getSession();
		if (!session) {
			if (phase === 'boot') phase = 'welcome';
			return; // cloudPush kapalı kalır — push edilecek hesap yok
		}
		const userId = session.user.id;
		try {
			if (!sessionStorage.getItem(CLOUD_HYDRATED_KEY)) {
				// Hidrasyon 5 sn'de dönmezse fail-safe intro (spec §4.A + §7).
				const timeout = new Promise<never>((_, rej) =>
					setTimeout(() => rej(new Error('bulut sorgusu zaman aşımı')), 5000),
				);
				const { data: row } = (await Promise.race([
					data.supabase.from('saves').select('payload, updated_at').maybeSingle(),
					timeout,
				])) as { data: { payload: unknown; updated_at: string } | null };
				const cloudEnv = (row?.payload ?? null) as SaveEnvelopeV1 | null;
				const decision = chooseSource({
					localTouchedAt: Number(localStorage.getItem(LOCAL_TOUCHED_KEY)) || null,
					localCreatedAt: initial?.game.createdAt ?? null,
					cloudUpdatedAt: row?.updated_at ?? null,
					cloudCreatedAt: cloudEnv?.game.createdAt ?? null,
					resetAt: getResetAt(localStorage),
					localOwnerId: getOwnerId(localStorage),
					sessionUserId: userId,
				});
				if (decision === 'cloud' && cloudEnv) {
					saveGame(localStorage, cloudEnv);
					localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
					setOwnerId(localStorage, userId); // hidrasyon = benimseme anı (spec §4.D)
					sessionStorage.setItem(CLOUD_HYDRATED_KEY, '1');
					location.reload();
					return;
				}
				if (decision === 'local' || decision === 'local-adopt') {
					setOwnerId(localStorage, userId); // legacy/adopt damgası — push kapısı açılmadan önce
				}
			}
		} catch (err) {
			// Açık #SP1-minor-4: sorgu hatası boot'u kilitlemesin, unhandled rejection olmasın.
			console.error('[cloud] hidrasyon kontrolü başarısız — local ile devam', err);
		}
		cloudPush.enable(); // uzlaşma bitti — push kapısı açık (spec §4.D)
		if (phase === 'boot') phase = 'intro';
	})();

	const flushOnHide = () => {
		if (document.visibilityState === 'hidden') void cloudPush.flush();
	};
	document.addEventListener('visibilitychange', flushOnHide);
	return () => document.removeEventListener('visibilitychange', flushOnHide);
});
```

- [ ] **Step 10: Template fazları** — `{#if phase === 'intro'}` bloğunun ÖNÜNE boot+welcome dalları (mevcut intro/playing içerikleri aynen kalır):

```svelte
{#if phase === 'boot'}
	<main class="min-h-[100dvh] flex items-center justify-center px-4">
		<div class="text-center space-y-2">
			<div class="text-term-green text-xl font-bold glow-text-green tracking-widest">
				[ MİRAS — CANLI ÇEKİRDEK ]
			</div>
			<div class="text-term-text text-xs opacity-60 animate-pulse">BAĞLANIYOR…</div>
		</div>
	</main>
{:else if phase === 'welcome'}
	<WelcomeScreen
		busy={welcomeBusy}
		errorMsg={welcomeError}
		onGoogle={handleGoogle}
		onGuest={() => void handleGuest()}
		onOffline={handleOfflinePlay}
	/>
{:else if phase === 'intro'}
	<!-- mevcut intro içeriği DEĞİŞMEDEN -->
{:else if store}
	<!-- mevcut playing içeriği DEĞİŞMEDEN (store bloğu içinde non-null daralır) -->
{/if}
```
Playing dalındaki `{:else}` → `{:else if store}` değişikliğine dikkat (svelte-check'in store'u non-null daraltması için).

- [ ] **Step 11: AccountPanel çağrısını yeni prop'larla güncelle** (Task 7 component'ı gelmeden `npm run check` kırık olur — Task 7 ile AYNI oturumda yapılmalı):

```svelte
<AccountPanel
	supabase={data.supabase}
	onDeleted={() => void handleAccountDeleted()}
	onSignOut={handleSignOut}
	onSwitchAccount={() => void handleSwitchAccount()}
	onGuestSession={handleGuestFromPanel}
/>
```

- [ ] **Step 12: Doğrula** — Run: `npm run test` → tüm testler yeşil; `npm run check` → Task 7 tamamlanmadan AccountPanel prop hatası verebilir, Task 7 sonrasına bak.

- [ ] **Step 13: Commit** — Task 7 ile birlikte (aşağıda — iki dosya birbirine bağımlı, tek commit).

---

### Task 7: AccountPanel — oturumsuz durum, ÇIKIŞ YAP, hesap-geçiş, silme v2

**Files:**
- Modify: `src/lib/components/panels/AccountPanel.svelte` (büyük ölçüde yeniden yazım)

**Interfaces (Consumes):** Task 6'nın handler'ları (props).

- [ ] **Step 1: Component'ı şu içerikle değiştir** (~190 satır; `clearSave`/`markPendingWipe` import'ları KALKAR — akışlar artık sayfada):

```svelte
<script lang="ts">
  import type { SupabaseClient, User } from '@supabase/supabase-js';
  import { validateNickname } from '$lib/domain/nickname/nickname';

  let {
    supabase,
    onDeleted,
    onSignOut,
    onSwitchAccount,
    onGuestSession,
  }: {
    supabase: SupabaseClient;
    onDeleted: () => void;
    onSignOut: () => Promise<string | null>;
    onSwitchAccount: () => void;
    onGuestSession: () => Promise<void>;
  } = $props();

  let user = $state<User | null>(null);
  let authChecked = $state(false); // getUser döndü mü — 'Oturum açılıyor…' ile 'oturum yok' ayrımı
  let nickname = $state('');
  let savedNickname = $state<string | null>(null);
  let message = $state<string | null>(null);
  let confirmingDelete = $state(false);
  let confirmingSignOut = $state(false);
  let offeringSwitch = $state(false); // identity_already_exists sonrası geçiş teklifi
  let confirmingSwitch = $state(false);
  let guestBusy = $state(false);

  const isGoogleLinked = $derived(user?.identities?.some((i) => i.provider === 'google') ?? false);
  // Kalıcı hesap = anonim değil (Google VEYA e-posta) — ÇIKIŞ YAP yalnız bunlara (spec §4.H).
  const isPermanent = $derived(user !== null && user.is_anonymous !== true);

  $effect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        user = data.user;
        authChecked = true;
        if (!data.user) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('nickname')
          .eq('id', data.user.id)
          .maybeSingle();
        if (cancelled) return;
        savedNickname = profile?.nickname ?? null;
      } catch (err) {
        if (!cancelled) {
          console.error('[account] oturum bilgileri yüklenemedi', err);
          authChecked = true;
          message = 'Oturum bilgileri yüklenemedi, sayfayı yenile';
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  async function linkGoogle() {
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: location.origin + '/auth/callback' },
      });
      if (error) {
        // Bu Google başka hesaba bağlı → geçiş teklifi (spec §4.H).
        if ((error as { code?: string }).code === 'identity_already_exists') {
          offeringSwitch = true;
          message = 'Bu Google hesabı zaten kayıtlı. Geçersen buradaki misafir oyunu SİLİNİR.';
        } else {
          message = 'Google bağlantısı başarısız: ' + error.message;
        }
      }
    } catch (err) {
      console.error('[account] linkIdentity hatası', err);
      message = 'Google bağlantısı başarısız, tekrar dene';
    }
  }

  function switchAccount() {
    if (!confirmingSwitch) {
      confirmingSwitch = true;
      return;
    }
    onSwitchAccount();
  }

  async function signInGoogle() {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + '/auth/callback' },
      });
    } catch (err) {
      console.error('[account] signInWithOAuth hatası', err);
      message = 'Google girişi başlatılamadı, tekrar dene';
    }
  }

  async function startGuestSession() {
    guestBusy = true;
    message = null;
    try {
      await onGuestSession();
    } catch (err) {
      console.error('[account] misafir oturumu açılamadı', err);
      message = 'Misafir oturumu açılamadı — bağlantını kontrol et';
    } finally {
      guestBusy = false;
    }
  }

  async function signOut() {
    if (!confirmingSignOut) {
      confirmingSignOut = true;
      return;
    }
    const err = await onSignOut();
    if (err) {
      message = err;
      confirmingSignOut = false;
    }
  }

  async function claimNickname() {
    const verdict = validateNickname(nickname);
    if (!verdict.ok) {
      message = verdict.reason;
      return;
    }
    try {
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
    } catch (err) {
      console.error('[account] takma ad kaydedilemedi', err);
      message = 'Kaydedilemedi, bağlantını kontrol et';
    }
  }

  async function deleteAccount() {
    if (!confirmingDelete) {
      confirmingDelete = true;
      return;
    }
    let deleted = false;
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        message = 'Hesap silinemedi, tekrar dene';
        confirmingDelete = false;
        return;
      }
      deleted = true;
      onDeleted();
    } catch (err) {
      console.error('[account] silme akışı hatası', err);
      // POST başarılıysa "silinemedi" DEME (spec kapsam eki) — temizlik boot'ta tamamlanır.
      message = deleted
        ? 'Hesap silindi — sayfayı yenile'
        : 'Hesap silinemedi, bağlantını kontrol et';
      confirmingDelete = false;
    }
  }
</script>

<section class="rounded border border-term-border bg-term-panel p-3 font-mono text-sm">
  <h2 class="mb-2 text-term-blue">HESAP</h2>

  {#if !authChecked}
    <p class="text-term-text opacity-50">Oturum açılıyor…</p>
  {:else if user == null}
    <!-- Oturumsuz kalıcı durum (spec §4.K): çerezi silinmiş misafir / çevrimdışı-devam yolu -->
    <p class="mb-2 text-term-amber">Oturum yok — kayıt yalnız bu cihazda.</p>
    <div class="flex flex-wrap gap-2">
      <button class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={signInGoogle}>
        GOOGLE İLE GİRİŞ
      </button>
      <button
        class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight disabled:opacity-40"
        disabled={guestBusy}
        onclick={() => void startGuestSession()}
      >
        {guestBusy ? 'AÇILIYOR…' : 'MİSAFİR OTURUMU AÇ'}
      </button>
    </div>
    <p class="mt-1 text-[10px] text-term-text opacity-40">Misafir oturumu yeni bulut kimliği oluşturur</p>
  {:else}
    <p class="mb-2">
      Durum:
      {#if isGoogleLinked}
        <span class="text-term-green">Google bağlı</span>
      {:else if isPermanent}
        <span class="text-term-green">E-posta bağlı</span>
      {:else}
        <span class="text-term-amber">Misafir</span>
        <button class="ml-2 border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={() => void linkGoogle()}>
          GOOGLE İLE BAĞLA
        </button>
      {/if}
    </p>

    {#if offeringSwitch}
      <div class="mb-2 border border-term-amber p-2">
        <button class="text-term-amber underline" onclick={switchAccount}>
          {confirmingSwitch
            ? 'EMİN MİSİN? Misafir oyunu silinir, Google hesabına geçilir'
            : 'Misafir oyununu bırak ve Google hesabına geç'}
        </button>
      </div>
    {/if}

    <div class="mb-2 flex items-center gap-2">
      <label for="nickname" class="text-term-text opacity-50">Takma ad:</label>
      {#if savedNickname}
        <span class="text-term-green">{savedNickname}</span>
      {:else}
        <input
          id="nickname"
          class="w-40 border border-term-border bg-transparent px-1"
          bind:value={nickname}
          maxlength="20"
        />
        <button class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={() => void claimNickname()}>
          AL
        </button>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-3">
      {#if isPermanent}
        <button class="text-term-blue underline" onclick={() => void signOut()}>
          {confirmingSignOut ? 'EMİN MİSİN? (kaydın bulutta — girince kaldığın yerden)' : 'ÇIKIŞ YAP'}
        </button>
      {/if}
      <button class="text-term-red underline" onclick={() => void deleteAccount()}>
        {confirmingDelete ? 'EMİN MİSİN? (geri dönüşü yok)' : 'Hesabımı ve verilerimi sil'}
      </button>
    </div>
  {/if}

  {#if message}
    <p class="mt-2 text-term-amber">{message}</p>
  {/if}
</section>
```

- [ ] **Step 2: Doğrula** — Run: `npm run test` → tüm testler yeşil; `npm run check` → 0 error (Task 6 + 7 birlikte tamam demektir); `npm run build` → başarılı.

- [ ] **Step 3: Commit (Task 6+7 birlikte)** — `git add -A && git commit -m "feat(auth): fazlı boot (welcome/boot/intro) + kimlik ertelemesi + reset-bulut uzlaşması + AccountPanel v2"`

---

### Task 8: Parça 1 kapanışı — tam doğrulama + manuel checklist

- [ ] **Step 1:** Run: `npm run test` — Expected: tüm testler yeşil (sayı yazma — drift ediyor).
- [ ] **Step 2:** Run: `npm run check` — Expected: 0 error, 0 warning.
- [ ] **Step 3:** Run: `npm run build` — Expected: başarılı (Windows'ta Developer Mode açık olmalı — bilinen EPERM konusu).
- [ ] **Step 4: Migration'ı canlı DB'ye uygula** (insan/controller): Supabase MCP `apply_migration` ile `0003_saves_delete.sql` — sonra `get_advisors` ile yeni security uyarısı olmadığını doğrula.
- [ ] **Step 5: Manuel tarayıcı checklist'i** (dev sunucu ya da preview; insan/controller):
  - [ ] Taze profil (localStorage+cookie boş): boot → **welcome** görünür; MİSAFİR → intro/BAŞLA → oyun; localStorage'da `miras.playerId` ancak BAŞLA sonrası oluşur.
  - [ ] Welcome'da GOOGLE İLE GİRİŞ → Google → `/auth/callback` → `/` dönüşü, oturum Google.
  - [ ] Kayıtlı oyun varken sayfa: welcome YOK, direkt intro/DEVAM (flash yok).
  - [ ] "Sıfırla ve yeni oyun" → reload sonrası Supabase `saves` satırı SİLİNMİŞ (Dashboard/SQL'den bak), `miras.resetAt` dolu.
  - [ ] İki sekme: birinde reset → diğer sekme oynamaya devam ederken localStorage'a KAYIT GERİ YAZAMIYOR (Application tab'da `miras.save.v1` boş kalmalı).
  - [ ] Hesap sil → welcome'a düşer; `miras.playerId`/`touchedAt`/`cardSeen`/`lastVisitPing`/`ownerId` silinmiş, `resetAt` DURUYOR.
  - [ ] Cookie'leri sil (localStorage dursun) → sayfa: intro açılır, AccountPanel "Oturum yok — kayıt yalnız bu cihazda" + iki buton gösterir; MİSAFİR OTURUMU AÇ → reload → senkron çalışır.
  - [ ] ÇIKIŞ YAP yalnız Google-bağlıyken görünür; misafirde YOK; çift-tık ister; sonrası welcome.
  - [ ] `/auth/callback?code=gecersiz` → `/?auth_error=1` → toast görünür, URL temizlenir.
- [ ] **Step 6: Commit** — çıkan küçük düzeltmelerle birlikte: `git commit -m "chore(sp15): parça 1 kapanış — manuel checklist geçti"`

---

## PARÇA 2 — E-posta + şifre (K7/K8)
*(Task 9-15; Parça 1 merge edilebilir durumdayken başlar)*

### Task 9: authErrors.ts — Türkçe, enumerasyon-nötr hata eşlemesi

**Files:**
- Create: `src/lib/api/authErrors.ts`
- Test: `src/lib/api/authErrors.test.ts`

**Interfaces (Produces):** `export function authErrorMessage(code: string | undefined): string;`

- [ ] **Step 1: Kırmızı test**:

```ts
import { describe, it, expect } from 'vitest';
import { authErrorMessage } from './authErrors';

describe('authErrorMessage', () => {
  it('bilinen kodları Türkçe mesaja çevirir', () => {
    expect(authErrorMessage('invalid_credentials')).toBe('E-posta ya da şifre hatalı');
    expect(authErrorMessage('user_already_exists')).toBe('Bu e-posta zaten kayıtlı — GİRİŞ yap');
    expect(authErrorMessage('email_exists')).toBe('Bu e-posta zaten kayıtlı — GİRİŞ yap');
    expect(authErrorMessage('weak_password')).toBe('Şifre en az 8 karakter olmalı');
    expect(authErrorMessage('over_email_send_rate_limit')).toBe('Çok sık denendi — biraz bekleyip tekrar dene');
    expect(authErrorMessage('email_not_confirmed')).toBe('E-postanı doğrulaman gerekiyor — gelen kutunu kontrol et');
  });
  it('bilinmeyen/boş kod nötr mesaja düşer (enumerasyon sızdırmaz)', () => {
    expect(authErrorMessage('weird_code')).toBe('İşlem tamamlanamadı — tekrar dene');
    expect(authErrorMessage(undefined)).toBe('İşlem tamamlanamadı — tekrar dene');
  });
});
```

- [ ] **Step 2: Kırmızıyı doğrula** — Run: `npx vitest run src/lib/api/authErrors.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementasyon**:

```ts
/** Supabase AuthApiError.code → Türkçe UI mesajı. Bilinmeyen kod nötr mesaja düşer —
 *  kayıtlı e-posta bilgisi SIZDIRILMAZ (spec §4.J enumerasyon-nötr kuralı). */
export function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'invalid_credentials':
      return 'E-posta ya da şifre hatalı';
    case 'user_already_exists':
    case 'email_exists':
      return 'Bu e-posta zaten kayıtlı — GİRİŞ yap';
    case 'weak_password':
      return 'Şifre en az 8 karakter olmalı';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Çok sık denendi — biraz bekleyip tekrar dene';
    case 'email_not_confirmed':
      return 'E-postanı doğrulaman gerekiyor — gelen kutunu kontrol et';
    case 'same_password':
      return 'Yeni şifre eskisiyle aynı olamaz';
    default:
      return 'İşlem tamamlanamadı — tekrar dene';
  }
}
```

- [ ] **Step 4: Yeşil** — Run: `npx vitest run src/lib/api/authErrors.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): authErrorMessage Türkçe/enumerasyon-nötr eşleme (TDD)"`

---

### Task 10: /auth/confirm rotası (e-posta doğrulama + şifre kurtarma linkleri)

**Files:**
- Create: `src/routes/auth/confirm/+server.ts`
- Create: `src/routes/auth/confirm/server.test.ts`

**Interfaces (Produces):** `GET /auth/confirm?token_hash=...&type=recovery|email|signup` → recovery: 303 `/?pw_reset=1`; diğer: 303 `/`; hata: 303 `/?auth_error=1`.

- [ ] **Step 1: Kırmızı test** (Task 4'teki `expectRedirect` kalıbıyla):

```ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from './+server';

function call(url: string, verifyResult: { error: Error | null }) {
  const verifyOtp = vi.fn().mockResolvedValue(verifyResult);
  const event = { url: new URL(url), locals: { supabase: { auth: { verifyOtp } } } } as any;
  return { event, verifyOtp };
}
async function expectRedirect(p: Promise<unknown>, location: string) {
  try {
    await p;
    expect.unreachable('redirect fırlatmalıydı');
  } catch (e) {
    expect((e as { status: number }).status).toBe(303);
    expect((e as { location: string }).location).toBe(location);
  }
}

describe('GET /auth/confirm', () => {
  it('recovery doğrulaması → /?pw_reset=1', async () => {
    const { event, verifyOtp } = call('http://x/auth/confirm?token_hash=th&type=recovery', { error: null });
    await expectRedirect(GET(event), '/?pw_reset=1');
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'recovery' });
  });
  it('email doğrulaması → /', async () => {
    const { event } = call('http://x/auth/confirm?token_hash=th&type=email', { error: null });
    await expectRedirect(GET(event), '/');
  });
  it('verifyOtp hatası ya da eksik parametre → /?auth_error=1', async () => {
    const bad = call('http://x/auth/confirm?token_hash=th&type=email', { error: new Error('expired') });
    await expectRedirect(GET(bad.event), '/?auth_error=1');
    const missing = call('http://x/auth/confirm?type=email', { error: null });
    await expectRedirect(GET(missing.event), '/?auth_error=1');
    expect(missing.verifyOtp).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Kırmızı** — Run: `npx vitest run src/routes/auth/confirm/server.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementasyon**:

```ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { EmailOtpType } from '@supabase/supabase-js';

// E-posta linkleri (dogrulama + sifre kurtarma, spec §4.J): token_hash SUNUCUDA dogrulanir.
// Mail sablonlari bu rotaya isaret eder (Task 14). Hedefler SABIT — open-redirect yok.
export const GET: RequestHandler = async ({ url, locals }) => {
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  if (token_hash && type) {
    const { error } = await locals.supabase.auth.verifyOtp({ token_hash, type });
    if (!error) redirect(303, type === 'recovery' ? '/?pw_reset=1' : '/');
  }
  redirect(303, '/?auth_error=1');
};
```

- [ ] **Step 4: Yeşil** — Run: `npx vitest run src/routes/auth/confirm/server.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): /auth/confirm — e-posta doğrulama + şifre kurtarma takası (TDD)"`

---

### Task 11: EmailAuthForm component'ı + WelcomeScreen'e e-posta yolu

**Files:**
- Create: `src/lib/components/EmailAuthForm.svelte`
- Modify: `src/lib/components/WelcomeScreen.svelte`

**Interfaces (Produces):** `EmailAuthForm` props:
```ts
{
  busy: boolean;
  errorMsg: string | null;
  sentMode: boolean; // 'mail gönderildi' ekranı (K8 açılınca da kullanılacak)
  onSignIn: (email: string, password: string) => void;
  onSignUp: (email: string, password: string) => void;
  onForgot: (email: string) => void;
  onBack: () => void;
}
```
`WelcomeScreen`'e eklenen props: `emailOpen: boolean; onEmailOpen: () => void;` + EmailAuthForm prop'ları geçirilir (aşağıda).

- [ ] **Step 1: EmailAuthForm.svelte**:

```svelte
<script lang="ts">
	let {
		busy,
		errorMsg,
		sentMode,
		onSignIn,
		onSignUp,
		onForgot,
		onBack,
	}: {
		busy: boolean;
		errorMsg: string | null;
		sentMode: boolean;
		onSignIn: (email: string, password: string) => void;
		onSignUp: (email: string, password: string) => void;
		onForgot: (email: string) => void;
		onBack: () => void;
	} = $props();

	let view = $state<'signin' | 'signup' | 'forgot'>('signin');
	let email = $state('');
	let password = $state('');

	const emailOk = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
	const passwordOk = $derived(password.length >= 8);
	const canSubmit = $derived(
		!busy && emailOk && (view === 'forgot' ? true : passwordOk),
	);

	function submit() {
		if (!canSubmit) return;
		const e = email.trim();
		if (view === 'signin') onSignIn(e, password);
		else if (view === 'signup') onSignUp(e, password);
		else onForgot(e);
	}
</script>

<div class="space-y-3">
	{#if sentMode}
		<p class="text-term-green text-xs text-center">
			Mail gönderildi — gelen kutunu (ve spam'i) kontrol et. Zaten kayıtlıysan GİRİŞ yap.
		</p>
		<button type="button" onclick={onBack} class="w-full text-[10px] text-term-text opacity-50 underline">
			← geri
		</button>
	{:else}
		<div class="flex text-[10px] uppercase tracking-widest">
			<button
				type="button"
				class="flex-1 py-1 border border-term-border {view === 'signin' ? 'text-term-green' : 'text-term-text opacity-50'}"
				onclick={() => (view = 'signin')}>Giriş</button
			>
			<button
				type="button"
				class="flex-1 py-1 border border-l-0 border-term-border {view === 'signup' ? 'text-term-green' : 'text-term-text opacity-50'}"
				onclick={() => (view = 'signup')}>Kayıt</button
			>
		</div>

		<input
			type="email"
			placeholder="e-posta"
			bind:value={email}
			class="w-full border border-term-border bg-transparent px-2 py-1.5 text-sm"
			autocomplete="email"
		/>
		{#if view !== 'forgot'}
			<input
				type="password"
				placeholder="şifre (en az 8 karakter)"
				bind:value={password}
				class="w-full border border-term-border bg-transparent px-2 py-1.5 text-sm"
				autocomplete={view === 'signup' ? 'new-password' : 'current-password'}
			/>
		{/if}

		<button
			type="button"
			onclick={submit}
			disabled={!canSubmit}
			class="w-full py-2.5 bg-term-bg border border-term-green text-term-green font-bold
			       text-sm tracking-widest uppercase hover:bg-term-panelLight transition-colors
			       disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{busy ? 'İŞLENİYOR…' : view === 'signin' ? 'GİRİŞ' : view === 'signup' ? 'KAYIT OL' : 'SIFIRLAMA MAİLİ GÖNDER'}
		</button>

		<div class="flex justify-between text-[10px]">
			{#if view === 'forgot'}
				<button type="button" class="text-term-text opacity-50 underline" onclick={() => (view = 'signin')}>
					← girişe dön
				</button>
			{:else}
				<button type="button" class="text-term-text opacity-50 underline" onclick={() => (view = 'forgot')}>
					şifremi unuttum
				</button>
			{/if}
			<button type="button" class="text-term-text opacity-50 underline" onclick={onBack}>← geri</button>
		</div>
	{/if}

	{#if errorMsg}
		<p class="text-term-amber text-xs text-center">{errorMsg}</p>
	{/if}
</div>
```

- [ ] **Step 2: WelcomeScreen'e e-posta yolunu ekle** — props'a ekle:

```ts
emailOpen: boolean;
onEmailOpen: () => void;
emailBusy: boolean;
emailError: string | null;
emailSent: boolean;
onEmailSignIn: (email: string, password: string) => void;
onEmailSignUp: (email: string, password: string) => void;
onEmailForgot: (email: string) => void;
onEmailBack: () => void;
```
`import EmailAuthForm from './EmailAuthForm.svelte';` ekle. Buton yığınında GOOGLE ile MİSAFİR arasına ekle ve `emailOpen` iken yığın yerine formu göster:

```svelte
{#if emailOpen}
	<EmailAuthForm
		busy={emailBusy}
		errorMsg={emailError}
		sentMode={emailSent}
		onSignIn={onEmailSignIn}
		onSignUp={onEmailSignUp}
		onForgot={onEmailForgot}
		onBack={onEmailBack}
	/>
{:else}
	<!-- mevcut 3'lü buton yığını + araya: -->
	<button
		type="button"
		onclick={onEmailOpen}
		disabled={busy}
		class="w-full py-3 bg-term-bg border border-term-border text-term-text font-bold
		       text-sm tracking-widest uppercase hover:bg-term-panelLight transition-colors
		       disabled:opacity-40 disabled:cursor-not-allowed"
	>
		E-POSTA İLE GİRİŞ / KAYIT
	</button>
{/if}
```

- [ ] **Step 3: Doğrula** — Run: `npm run check` — Expected: `+page.svelte` yeni prop'ları geçmediği için HATA verir — Task 12 ile aynı oturumda devam et (bilinçli ara durum).

- [ ] **Step 4: Commit** — Task 12 ile birlikte.

---

### Task 12: +page.svelte e-posta kablolaması + şifre-yenile görünümü

**Files:**
- Modify: `src/routes/+page.svelte`

**Interfaces (Consumes):** Task 9-11 export'ları; `authErrorMessage`, `EmailOtpType` akışı `/auth/confirm`'den `?pw_reset=1` ile gelir.

- [ ] **Step 1: State + import ekle**:

```ts
import { authErrorMessage } from '$lib/api/authErrors';

let emailOpen = $state(false);
let emailBusy = $state(false);
let emailError = $state<string | null>(null);
let emailSent = $state(false);
let pwResetOpen = $state(false);
let newPassword = $state('');
let pwBusy = $state(false);
```

- [ ] **Step 2: E-posta handler'ları ekle** (welcome handler'larının yanına):

```ts
async function withEmailBusy(fn: () => Promise<void>) {
	emailBusy = true;
	emailError = null;
	try {
		await fn();
	} catch (err) {
		console.error('[auth] e-posta akışı hatası', err);
		emailError = authErrorMessage((err as { code?: string })?.code);
	} finally {
		emailBusy = false;
	}
}

function handleEmailSignIn(email: string, password: string) {
	void withEmailBusy(async () => {
		const captchaToken = await getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY);
		const { error } = await data.supabase.auth.signInWithPassword({
			email,
			password,
			options: { captchaToken },
		});
		if (error) {
			emailError = authErrorMessage((error as { code?: string }).code);
			return;
		}
		const { data: { user } } = await data.supabase.auth.getUser();
		if (user && initial === null) setOwnerId(localStorage, user.id);
		// Bulut kaydı olabilir → uzlaşma reload'la boot'tan geçer (en güvenli yol).
		location.reload();
	});
}

function handleEmailSignUp(email: string, password: string) {
	void withEmailBusy(async () => {
		const captchaToken = await getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY);
		const { data: result, error } = await data.supabase.auth.signUp({
			email,
			password,
			options: { captchaToken },
		});
		if (error) {
			emailError = authErrorMessage((error as { code?: string }).code);
			return;
		}
		if (result.session) {
			// K8 dönemi: doğrulama kapalı → oturum hemen açılır.
			if (result.user) setOwnerId(localStorage, result.user.id);
			cloudPush.enable();
			emailOpen = false;
			await enterGame();
		} else {
			// K8 sonrası (doğrulama açık): enumerasyon-nötr 'mail gönderildi' ekranı.
			emailSent = true;
		}
	});
}

function handleEmailForgot(email: string) {
	void withEmailBusy(async () => {
		const captchaToken = await getTurnstileToken(PUBLIC_TURNSTILE_SITE_KEY);
		const { error } = await data.supabase.auth.resetPasswordForEmail(email, { captchaToken });
		if (error) {
			emailError = authErrorMessage((error as { code?: string }).code);
			return;
		}
		emailSent = true;
	});
}

function handleEmailBack() {
	emailOpen = false;
	emailSent = false;
	emailError = null;
}

function handleUpdatePassword() {
	if (newPassword.length < 8 || pwBusy) return;
	pwBusy = true;
	void (async () => {
		try {
			const { error } = await data.supabase.auth.updateUser({ password: newPassword });
			if (error) {
				showToast(authErrorMessage((error as { code?: string }).code));
			} else {
				showToast('Şifre güncellendi');
				pwResetOpen = false;
				newPassword = '';
			}
		} catch (err) {
			console.error('[auth] şifre güncelleme hatası', err);
			showToast('Şifre güncellenemedi — tekrar dene');
		} finally {
			pwBusy = false;
		}
	})();
}
```

- [ ] **Step 3: onMount'a pw_reset yakalama ekle** — `auth_error` bloğunun hemen altına:

```ts
if (params.has('pw_reset')) {
	pwResetOpen = true;
	history.replaceState(null, '', '/');
}
```

- [ ] **Step 4: WelcomeScreen çağrısını yeni prop'larla güncelle**:

```svelte
<WelcomeScreen
	busy={welcomeBusy}
	errorMsg={welcomeError}
	onGoogle={handleGoogle}
	onGuest={() => void handleGuest()}
	onOffline={handleOfflinePlay}
	{emailOpen}
	onEmailOpen={() => (emailOpen = true)}
	{emailBusy}
	{emailError}
	{emailSent}
	onEmailSignIn={handleEmailSignIn}
	onEmailSignUp={handleEmailSignUp}
	onEmailForgot={handleEmailForgot}
	onEmailBack={handleEmailBack}
/>
```

- [ ] **Step 5: Şifre-yenile overlay'i** — template'te `<Toast .../>` satırının hemen altına (fazdan bağımsız):

```svelte
{#if pwResetOpen}
	<div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
		<div class="w-full max-w-xs bg-term-panel border border-term-border p-4 space-y-3 font-mono">
			<div class="text-term-blue text-xs uppercase tracking-widest">Yeni şifre belirle</div>
			<input
				type="password"
				placeholder="yeni şifre (en az 8 karakter)"
				bind:value={newPassword}
				class="w-full border border-term-border bg-transparent px-2 py-1.5 text-sm"
				autocomplete="new-password"
			/>
			<button
				type="button"
				onclick={handleUpdatePassword}
				disabled={newPassword.length < 8 || pwBusy}
				class="w-full py-2 bg-term-bg border border-term-green text-term-green font-bold
				       text-xs tracking-widest uppercase hover:bg-term-panelLight
				       disabled:opacity-40 disabled:cursor-not-allowed"
			>
				{pwBusy ? 'KAYDEDİLİYOR…' : 'KAYDET'}
			</button>
			<button
				type="button"
				class="w-full text-[10px] text-term-text opacity-50 underline"
				onclick={() => (pwResetOpen = false)}
			>
				vazgeç
			</button>
		</div>
	</div>
{/if}
```

- [ ] **Step 6: Doğrula** — Run: `npm run test` → yeşil; `npm run check` → 0 error; `npm run build` → başarılı.

- [ ] **Step 7: Commit (Task 11+12 birlikte)** — `git commit -m "feat(auth): e-posta+şifre girişi/kaydı/sıfırlaması — welcome yolu + şifre-yenile overlay (K7/K8)"`

---

### Task 13: Oturumsuz AccountPanel'e e-posta yolu

**Files:**
- Modify: `src/lib/components/panels/AccountPanel.svelte`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1:** AccountPanel props'una `onEmailAuth: () => void;` ekle. Oturumsuz dalın buton grubuna üçüncü buton:

```svelte
<button class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={onEmailAuth}>
  E-POSTA İLE GİRİŞ
</button>
```

- [ ] **Step 2:** `+page.svelte`'te AccountPanel'e `onEmailAuth={() => { pwResetOpen = false; emailAuthOverlayOpen = true; }}` geç; yeni state `let emailAuthOverlayOpen = $state(false);` ve şifre-yenile overlay'inin altına ikinci overlay:

```svelte
{#if emailAuthOverlayOpen}
	<div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
		<div class="w-full max-w-xs bg-term-panel border border-term-border p-4 font-mono">
			<EmailAuthForm
				busy={emailBusy}
				errorMsg={emailError}
				sentMode={emailSent}
				onSignIn={handleEmailSignIn}
				onSignUp={handleEmailSignUp}
				onForgot={handleEmailForgot}
				onBack={() => { emailAuthOverlayOpen = false; emailSent = false; emailError = null; }}
			/>
		</div>
	</div>
{/if}
```
`import EmailAuthForm from '$lib/components/EmailAuthForm.svelte';` ekle. (Giriş başarısında `handleEmailSignIn` zaten `location.reload()` yapar — overlay kendiliğinden kapanır; uzlaşma boot'tan geçer.)

Ayrıca `handleEmailSignUp`'ın başarı dalında (T12 Step 2) `emailOpen = false;` satırının yanına `emailAuthOverlayOpen = false;` ekle — panelden kayıt olunduğunda overlay açık kalmasın (reload olmayan tek başarı yolu bu).

- [ ] **Step 3: Doğrula** — `npm run test` + `npm run check` + `npm run build` → hepsi geçer.
- [ ] **Step 4: Commit** — `git commit -m "feat(auth): oturumsuz AccountPanel'e e-posta girişi (overlay)"`

---

### Task 14: Supabase panel ayarları (insan/controller el işi — kod yok)

- [ ] Auth → Sign In / Up → Email provider: **Confirm email = OFF** (K8 kararı — domain+SMTP gelince ON'a çekilecek, kod hazır).
- [ ] Auth → Passwords: minimum uzunluk **8**; **Leaked password protection = ON** (Pro'da mevcut).
- [ ] Auth → Emails → Templates: "Reset password" ve "Confirm signup" şablonlarını Türkçeleştir ve linki şu kalıba çevir:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` (reset) / `...&type=email` (confirm).
- [ ] Auth → URL Configuration: `https://miras-one.vercel.app/auth/callback` ve `http://localhost:3000/auth/callback` (+ `:5173`) allow-list'te olmalı (mevcut listeye ek).
- [ ] Auth → Rate limits: e-posta gönderim limitini gözden geçir (yerleşik servis düşüktür — K8 bilinen sınırı, dokunma yeterli).
- [ ] Kanıt: ayar ekranlarının görüntüsü ya da kısa not — plan ledger'ına işlenir.

---

### Task 15: Parça 2 kapanışı + güvenlik review

- [ ] **Step 1:** `npm run test` + `npm run check` + `npm run build` → üçü de geçer.
- [ ] **Step 2: Manuel checklist (e-posta):**
  - [ ] Welcome → E-POSTA → KAYIT (yeni adres) → direkt oyuna girer (K8), Supabase Users'da e-posta kullanıcısı görünür, `is_anonymous=false`.
  - [ ] ÇIKIŞ YAP e-posta kullanıcısında görünür → çıkış → welcome → E-POSTA GİRİŞ → oyun buluttan döner.
  - [ ] Şifremi unuttum → mail gelir (yerleşik servis, gecikebilir) → link `/auth/confirm` → `/?pw_reset=1` → overlay → yeni şifreyle tekrar giriş.
  - [ ] Yanlış şifre → "E-posta ya da şifre hatalı"; kayıtlı e-postayla KAYIT → "Bu e-posta zaten kayıtlı — GİRİŞ yap" (doğrulama kapalıyken Supabase bu hatayı döner).
  - [ ] Oturumsuz AccountPanel → E-POSTA İLE GİRİŞ overlay'i çalışır.
- [ ] **Step 3: Whole-branch güvenlik review'u** — güçlü modelde (SP1 disiplini): tüm SP1.5 diff'i + canlı DB advisors (`get_advisors`) + RLS/GRANT davranış kontrolü. Bulgular düzeltilmeden "tamam" denmez.
- [ ] **Step 4:** `memory.md` Bölüm 6 + CLAUDE.md Test Disiplini senkronu (yeni rotalar/akışlar) — sprint kapanış kuralı.
- [ ] **Step 5: Commit** — `git commit -m "chore(sp15): parça 2 kapanış — e-posta akışı canlı, güvenlik review geçti"`

---

## Self-Review Notları (plan yazarı doldurdu)

- **Spec kapsama:** §4.A→T3/T6, §4.B→T5/T11, §4.C→T4, §4.D→T1/T2/T6, §4.E→T1/T2/T6, §4.F→T6, §4.G→T1/T6/T7, §4.H→T6/T7, §4.I→T4, §4.J→T9-T14, §4.K→T7/T13, kapsam-eki minor'lar→T6(S9 try/catch)/T7(silme mesajı). Boşluk yok.
- **Tip tutarlılığı:** `SourceDecision`/`ChooseSourceInput` (T2) ↔ T6 çağrısı; `StartPhase` (T3) ↔ T6 `phase`; AccountPanel props (T7) ↔ T6 Step 11 + T13; `flush(): Promise<boolean>` (T2) ↔ T6 `handleSignOut`.
- **Bilinçli sıra bağımlılıkları:** T6+T7 tek commit (karşılıklı bağımlı); T11+T12 tek commit. T2 Step 5'teki geçici köprü, task'lar ayrı oturumlara bölünürse `check`'i yeşil tutar.
