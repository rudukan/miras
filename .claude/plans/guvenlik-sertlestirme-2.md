# Güvenlik Sertleştirme #2 (B1 + B3 + B4) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (önerilen) veya superpowers:executing-plans ile bu planı task-task uygula. Adımlar checkbox (`- [x]`) ile işaretlenir.

> **Durum: ONAYLANDI, UYGULAMA BAŞLAMADI.** Bu plan, 2026-07-14 taze güvenlik denetiminin bulgularını kapatmak için yazıldı. Fable oturumunda kod okunarak yazıldı — tüm dosya/satır referansları doğrulandı, varsayım yok. Bir sonraki Sonnet oturumu keşif yapmadan doğrudan uygulamaya geçebilir.

**Goal:** Kimliksiz endpoint'lerdeki üç girdi-doğrulama zayıflığını (telemetry webhook relay, proxy sembol enjeksiyonu, yıkıcı POST'larda origin kontrolü) whitelist-validasyonla kapat.

**Architecture:** Üç bulgu da aynı kök nedende buluşuyor — *kullanıcı-kontrollü string, doğrulanmadan bir yan-etkiye (Discord içeriği / upstream URL / cookie-authed silme) akıyor*. Çözüm tek desen: **girdiyi güvenli bir karakter/uzunluk whitelist'ine sok, uymayanı reddet.** Yeni bağımlılık yok, yeni altyapı yok; mevcut saf-fonksiyon + ince-route mimarisine oturur.

**Tech Stack:** SvelteKit 2 + TypeScript (strict) + Vitest. Değişen katman: `src/routes/api/**/+server.ts` (route guard'ları) + `src/lib/api/symbolLimit.ts` (saf filtre) + `src/lib/server/csrf.ts` (yeni saf helper).

## Global Constraints

- **TDD zorunlu** (CLAUDE.md): her davranış önce başarısız test, sonra minimal implementasyon.
- **Identifier'lar İngilizce, UI/mesaj metinleri Türkçe.**
- **Para tipi bu planda yok** — dokunulan dosyalar finansal değil.
- **`npm run test` + `npm run build` yeşil olmadan "tamam" denmez** (verification-before-completion).
- Saf/test-edilebilir mantık `src/lib/` altında; `+server.ts` ince kalır (CLAUDE.md sistem sınırları).
- Her task kendi commit'iyle kapanır.

---

## Context — denetim bulguları ve kapsam kararı

2026-07-14 denetimi 5 zayıflık buldu (P0 yok). Bu plan **whitelist'le tek oturumda kapanan üçünü** alıyor:

| Bulgu | Özet | Bu planda? |
|-------|------|-----------|
| **B1** | `/api/telemetry` `playerId`'yi sanitize etmeden Discord webhook'a + `console.log`'a relay ediyor (mention/markdown/newline/uzunluk sınırsız) | ✅ Task 1 |
| **B3** | `/api/yahoo`, `/api/crypto`, `/api/series` sembolleri karakter-whitelist'i olmadan upstream URL'e gömüyor (open-relay + param injection) | ✅ Task 2 + Task 3 |
| **B4** | `account/delete` + `profile` yıkıcı POST'larında açık origin kontrolü yok (CSRF savunması yalnız SameSite=Lax'a bağlı) | ✅ Task 4 (defense-in-depth; minimal slice isteniyorsa atlanabilir) |
| **B2** | Uygulama-katmanı rate-limit yok | ❌ **ERTELENDİ** — altyapı kararı gerekli (in-memory serverless'te zayıf; doğrusu Vercel KV / Upstash). Kendi planını hak ediyor. |
| **B5** | CSP `script-src` yok | ❌ **ERTELENDİ** — `kit.csp` nonce'lu tam politika + tarayıcı doğrulaması ister; launch sonrası. |

**Neden bu üçü bir slice:** hepsi saf-string-validasyon, altyapı bağımlılığı yok, TDD ile 2-5 dk'lık adımlara bölünüyor, tek review döngüsünde biter. B2/B5 tasarım kararı içerdiği için ayrı.

### Neden `encodeURIComponent` DEĞİL, whitelist?

`seriesSource.ts`'te `YAHOO_SPECIAL` sabitleri `GC=F`, `SI=F`, `EURTRY=X` içeriyor — bunlar upstream path'ine **literal `=` ile** girmeli. `encodeURIComponent` `=`'i `%3D`'ye çevirip bu server-sabitlerini kırma riski taşır. Kullanıcı-kontrollü kısım yalnız `assetId` ve o da `${assetId}.IS` / `${assetId}USDT` kalıbıyla veya `YAHOO_SPECIAL` lookup'ıyla (sabitle değiştirilerek) URL'e giriyor. `assetId`'yi `^[A-Z0-9]{1,12}$`'e whitelist'lemek enjeksiyonu tümüyle kapatır (URL-anlamlı karakter kalmaz) ve sabitlere dokunmaz. **Whitelist tek ve yeterli savunma.**

### playerId legit formatı (B1 whitelist kalibrasyonu)

`getOrCreatePlayerId` ([savegame.ts:170](src/lib/stores/savegame.ts#L170)) `crypto.randomUUID()` üretir (36 char, hex+tire). Fallback değerler: `'restored'` ([+page.svelte:70](src/routes/+page.svelte#L70)), `'local-player'` ([liveGameStore.svelte.ts:156](src/lib/stores/liveGameStore.svelte.ts#L156)). Hepsi `^[A-Za-z0-9_-]{1,64}$`'e uyar. Bu whitelist legit trafiği kırmaz; `@everyone`, backtick, newline, boşluk ve aşırı uzunluğu reddeder.

## File Structure — dosya haritası

- **Modify** `src/routes/api/telemetry/+server.ts` — `isValidPayload`'a playerId whitelist + webhook body'sine `allowed_mentions`.
- **Modify** `src/routes/api/telemetry/server.test.ts` — enjeksiyon reddi test case'leri.
- **Modify** `src/lib/api/symbolLimit.ts` — `parseSymbolList`'e karakter whitelist filtresi (yahoo+crypto proxy'lerini korur).
- **Modify** `src/lib/api/symbolLimit.test.ts` — whitelist test case'leri.
- **Modify** `src/routes/api/series/+server.ts` — `symbol` guard'ına whitelist regex.
- **Modify** `src/routes/api/series/server.test.ts` — geçersiz symbol reddi.
- **Create** `src/lib/server/csrf.ts` — saf `isSameOrigin` helper (Task 4).
- **Create** `src/lib/server/csrf.test.ts` — helper testleri (Task 4).
- **Modify** `src/routes/api/account/delete/+server.ts` — origin guard (Task 4).
- **Modify** `src/routes/api/profile/+server.ts` — origin guard (Task 4).

---

### Task 1: B1 — Telemetry playerId whitelist + mention nötralizasyonu

**Files:**
- Modify: `src/routes/api/telemetry/+server.ts` (`isValidPayload` ~13-24, webhook POST ~41-48)
- Test: `src/routes/api/telemetry/server.test.ts`

**Interfaces:**
- Consumes: mevcut `TelemetryPayload`, `VALID_EVENTS`, `isValidPayload` — imza değişmez.
- Produces: davranış değişikliği — geçersiz `playerId` artık 400 döner; webhook body'si `allowed_mentions: { parse: [] }` taşır.

- [x] **Step 1: Başarısız testleri yaz** (`src/routes/api/telemetry/server.test.ts` içindeki `describe`'a ekle)

```ts
  it('mention/markdown içeren playerId → 400 (Discord relay enjeksiyonu kapalı)', async () => {
    expect((await POST(postReq({ ...VALID, playerId: '@everyone' }))).status).toBe(400);
    expect((await POST(postReq({ ...VALID, playerId: '`nuke`' }))).status).toBe(400);
    expect((await POST(postReq({ ...VALID, playerId: 'a\nb' }))).status).toBe(400);
  });

  it('aşırı uzun playerId → 400', async () => {
    expect((await POST(postReq({ ...VALID, playerId: 'x'.repeat(65) }))).status).toBe(400);
  });

  it('gerçek UUID playerId → 204', async () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect((await POST(postReq({ ...VALID, playerId: uuid }))).status).toBe(204);
  });

  it('webhook body allowed_mentions.parse boş dizi içerir', async () => {
    process.env.TELEMETRY_WEBHOOK_URL = 'https://discord.example/webhook';
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await POST(postReq(VALID));
      await new Promise((r) => setTimeout(r, 0));
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.allowed_mentions).toEqual({ parse: [] });
    } finally {
      globalThis.fetch = real;
    }
  });
```

- [x] **Step 2: Testleri koştur, başarısız olduklarını gör**

Run: `npm run test -- src/routes/api/telemetry/server.test.ts`
Expected: FAIL — `@everyone` şu an 204 dönüyor; `allowed_mentions` body'de yok.

- [x] **Step 3: `isValidPayload`'a playerId whitelist ekle** (`src/routes/api/telemetry/+server.ts`)

`isValidPayload` içindeki `typeof b.playerId === 'string' && b.playerId.length > 0` koşulunu şununla değiştir:

```ts
    typeof b.playerId === 'string' &&
    PLAYER_ID_RE.test(b.playerId) &&
```

Ve dosyanın üstüne (VALID_EVENTS yakınına) sabiti ekle:

```ts
/** playerId whitelist: crypto.randomUUID() + 'restored'/'local-player' fallback'lerini karşılar;
 *  Discord mention (@), markdown (`), newline ve aşırı uzunluğu reddeder (güvenlik denetimi B1). */
const PLAYER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
```

- [x] **Step 4: Webhook body'sine `allowed_mentions` ekle** (aynı dosya, `void fetch(...)` bloğu)

`body: JSON.stringify({ content: ... })` satırını şununla değiştir:

```ts
      body: JSON.stringify({
        content: `[${body.event}] ${body.playerId} @ ${body.tsISO}`,
        allowed_mentions: { parse: [] },
      }),
```

- [x] **Step 5: Testleri koştur, geçtiklerini gör**

Run: `npm run test -- src/routes/api/telemetry/server.test.ts`
Expected: PASS (mevcut testler dahil).

- [x] **Step 6: Commit**

```bash
git add src/routes/api/telemetry/+server.ts src/routes/api/telemetry/server.test.ts
git commit -m "fix(security): telemetry playerId whitelist + allowed_mentions (B1)"
```

---

### Task 2: B3a — parseSymbolList karakter whitelist'i (yahoo + crypto proxy)

**Files:**
- Modify: `src/lib/api/symbolLimit.ts:8-15`
- Test: `src/lib/api/symbolLimit.test.ts`

**Interfaces:**
- Consumes/Produces: `parseSymbolList(param: string | null): string[]` — imza aynı; artık yalnız `^[A-Z0-9]{1,12}$`'e uyan semboller döner. `/api/yahoo` (`?bist=`,`?us=`) ve `/api/crypto` (`?coins=`) bu fonksiyonu kullanır.

- [x] **Step 1: Başarısız test yaz** (`src/lib/api/symbolLimit.test.ts`)

```ts
  it('URL-anlamlı karakter içeren sembolleri eler (enjeksiyon savunması)', () => {
    expect(parseSymbolList('AAPL,BTC?x=1,../etc,A B,GC=F')).toEqual(['AAPL', 'BTC']);
  });

  it('12 karakterden uzun sembolü eler', () => {
    expect(parseSymbolList('THYAO,ABCDEFGHIJKLM')).toEqual(['THYAO']);
  });
```

- [x] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `npm run test -- src/lib/api/symbolLimit.test.ts`
Expected: FAIL — şu an `BTC?X=1`, `../ETC`, `GC=F` de dönüyor.

- [x] **Step 3: Whitelist filtresi ekle** (`src/lib/api/symbolLimit.ts`)

`MAX_SYMBOLS` altına ekle:

```ts
/** Güvenli sembol biçimi: yalnız büyük harf + rakam (güvenlik denetimi B3).
 *  Upstream URL'ine `.IS`/`USDT` ekiyle gömülmeden önce URL-anlamlı karakterleri eler. */
const VALID_SYMBOL_RE = /^[A-Z0-9]{1,12}$/;
```

`parseSymbolList`'in dönüş zincirine `filter(Boolean)`'dan sonra whitelist filtresini ekle:

```ts
  return param
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => VALID_SYMBOL_RE.test(s))
    .slice(0, MAX_SYMBOLS);
```

(Not: `.filter(Boolean)` kaldırıldı — `VALID_SYMBOL_RE` boş string'i zaten eler.)

- [x] **Step 4: Testleri koştur, geçtiklerini gör**

Run: `npm run test -- src/lib/api/symbolLimit.test.ts`
Expected: PASS (mevcut `' aapl , ,msft '` testi hâlâ `['AAPL','MSFT']` döner).

- [x] **Step 5: Commit**

```bash
git add src/lib/api/symbolLimit.ts src/lib/api/symbolLimit.test.ts
git commit -m "fix(security): parseSymbolList karakter whitelist'i (B3a)"
```

---

### Task 3: B3b — series `symbol` route guard'ı

**Files:**
- Modify: `src/routes/api/series/+server.ts:29-36`
- Test: `src/routes/api/series/server.test.ts`

**Interfaces:**
- Consumes: mevcut `GET` handler, `VALID_PERIODS`. `symbol` artık `^[A-Z0-9]{1,12}$`'e uymuyorsa 400 döner (önceden yalnız boş kontrol vardı).

- [x] **Step 1: Başarısız test yaz** (`src/routes/api/series/server.test.ts`)

Mevcut test dosyasının GET çağrı kalıbına uyarak (bir `RequestEvent` `url` ile), geçersiz symbol'ün 400 döndüğünü doğrula:

```ts
  it('enjeksiyon karakterli symbol → 400', async () => {
    const req = {
      url: new URL('http://localhost/api/series?symbol=AAPL?x=1&source=yahoo&period=1G'),
    } as unknown as RequestEvent;
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('12 karakterden uzun symbol → 400', async () => {
    const req = {
      url: new URL('http://localhost/api/series?symbol=ABCDEFGHIJKLM&source=yahoo&period=1G'),
    } as unknown as RequestEvent;
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
```

(Import satırına `GET` ve `RequestEvent` mevcut değilse ekle: `import { GET } from './+server';` + `import type { RequestEvent } from './$types';` — mevcut dosyadaki kalıbı takip et.)

- [x] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `npm run test -- src/routes/api/series/server.test.ts`
Expected: FAIL — `AAPL?x=1` şu an guard'ı geçip fetch'e gidiyor.

- [x] **Step 3: Guard'a whitelist ekle** (`src/routes/api/series/+server.ts`)

`VALID_PERIODS` satırının altına sabit ekle:

```ts
const VALID_SYMBOL_RE = /^[A-Z0-9]{1,12}$/;
```

Guard koşulunu genişlet — mevcut:

```ts
	if (!symbol || (source !== 'crypto' && source !== 'yahoo') || !period || !VALID_PERIODS.has(period)) {
```

şununla değiştir:

```ts
	if (!symbol || !VALID_SYMBOL_RE.test(symbol) || (source !== 'crypto' && source !== 'yahoo') || !period || !VALID_PERIODS.has(period)) {
```

- [x] **Step 4: Testleri koştur, geçtiklerini gör**

Run: `npm run test -- src/routes/api/series/server.test.ts`
Expected: PASS (geçerli symbol testleri dokunulmadı).

- [x] **Step 5: Commit**

```bash
git add src/routes/api/series/+server.ts src/routes/api/series/server.test.ts
git commit -m "fix(security): series symbol route guard whitelist'i (B3b)"
```

---

### Task 4: B4 — Yıkıcı POST'larda same-origin guard (defense-in-depth, opsiyonel)

> **Minimal slice isteniyorsa bu task atlanabilir** — SameSite=Lax cookie'si CSRF'i büyük ölçüde zaten kapatıyor. Bu task ikinci bir bağımsız savunma katmanı ekler; `account/delete` geri alınamaz olduğu için önerilir.

**Files:**
- Create: `src/lib/server/csrf.ts`
- Test: `src/lib/server/csrf.test.ts`
- Modify: `src/routes/api/account/delete/+server.ts:11`
- Modify: `src/routes/api/profile/+server.ts:7`

**Interfaces:**
- Produces: `isSameOrigin(originHeader: string | null, appOrigin: string): boolean` — `originHeader === appOrigin` ise true. `null`/uyuşmama → false. Route'lar `false`'ta `error(403, ...)` atar.

- [x] **Step 1: Başarısız test yaz** (`src/lib/server/csrf.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { isSameOrigin } from './csrf';

describe('isSameOrigin', () => {
  it('origin app origin ile birebir eşleşirse true', () => {
    expect(isSameOrigin('https://miras.app', 'https://miras.app')).toBe(true);
  });

  it('farklı origin → false (cross-site CSRF)', () => {
    expect(isSameOrigin('https://evil.example', 'https://miras.app')).toBe(false);
  });

  it('origin header yoksa (null) → false', () => {
    expect(isSameOrigin(null, 'https://miras.app')).toBe(false);
  });
});
```

- [x] **Step 2: Testi koştur, başarısız olduğunu gör**

Run: `npm run test -- src/lib/server/csrf.test.ts`
Expected: FAIL — `./csrf` modülü yok.

- [x] **Step 3: Helper'ı yaz** (`src/lib/server/csrf.ts`)

```ts
/** Same-origin kontrolü (güvenlik denetimi B4 — CSRF defense-in-depth).
 *  Tarayıcı, fetch POST'larında same-origin'de bile `Origin` header'ı gönderir;
 *  header yoksa veya app origin'iyle uyuşmuyorsa isteği yıkıcı endpoint'lerde reddet.
 *  SvelteKit'in dahili csrf.checkOrigin'i yalnız form content-type'larını kapsadığı için
 *  bodysiz/JSON POST'lar bu ek katmanla korunur. */
export function isSameOrigin(originHeader: string | null, appOrigin: string): boolean {
  return originHeader !== null && originHeader === appOrigin;
}
```

- [x] **Step 4: Testi koştur, geçtiğini gör**

Run: `npm run test -- src/lib/server/csrf.test.ts`
Expected: PASS.

- [x] **Step 5: `account/delete`'e guard ekle** (`src/routes/api/account/delete/+server.ts`)

Import ekle:

```ts
import { isSameOrigin } from '$lib/server/csrf';
```

Handler imzasını `{ locals }`'tan genişlet ve ilk satır olarak guard koy:

```ts
export const POST: RequestHandler = async ({ locals, request, url }) => {
  if (!isSameOrigin(request.headers.get('origin'), url.origin)) error(403, 'Geçersiz kaynak');
  const { user } = await locals.safeGetSession();
  if (!user) error(401, 'Oturum gerekli');
```

- [x] **Step 6: `profile`'a guard ekle** (`src/routes/api/profile/+server.ts`)

Import ekle:

```ts
import { isSameOrigin } from '$lib/server/csrf';
```

Handler imzasına `url` ekle ve ilk satır olarak guard koy:

```ts
export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (!isSameOrigin(request.headers.get('origin'), url.origin)) error(403, 'Geçersiz kaynak');
  const { user } = await locals.safeGetSession();
  if (!user) error(401, 'Oturum gerekli');
```

- [x] **Step 7: E2E regresyon kontrolü** — Playwright tarayıcı istekleri same-origin `Origin` gönderir, yani `/api/profile` ve `/api/account/delete` akışları geçmeli. Lokal E2E çalıştırılabiliyorsa doğrula (Docker + `npx supabase start` gerektirir); değilse CI'ın `e2e` job'ına bırak.

Run (opsiyonel/lokal): `npm run e2e -- --grep "hesap|profil"`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add src/lib/server/csrf.ts src/lib/server/csrf.test.ts src/routes/api/account/delete/+server.ts src/routes/api/profile/+server.ts
git commit -m "fix(security): yıkıcı POST'larda same-origin guard (B4)"
```

---

## Bitiş doğrulaması (tüm task'lar sonrası)

- [x] **Tam test suite:** `npm run test` → tümü yeşil.
- [x] **Tip kontrolü:** `npm run check` → 0 hata.
- [x] **Build:** `npm run build` → başarılı.
- [x] **memory.md son-oturum bölümünü güncelle:** B1/B3(+B4) kapatıldı, B2/B5 ertelendi (neden) notuyla.

## Self-Review (yazım sonrası — plan ↔ denetim tutarlılığı)

- **Kapsam:** B1 (Task 1), B3 (Task 2+3), B4 (Task 4) → hepsi task'lı. B2/B5 bilinçli ertelendi, gerekçe Context'te.
- **Placeholder taraması:** her kod adımı gerçek kod içeriyor; "TODO/uygun validasyon ekle" yok.
- **Tip tutarlılığı:** `isSameOrigin` imzası Task 4 boyunca sabit; `PLAYER_ID_RE`/`VALID_SYMBOL_RE` tanımlandıkları dosyada kullanılıyor.
- **Regresyon riski:** `parseSymbolList`'ten `.filter(Boolean)` kaldırıldı — `VALID_SYMBOL_RE` boşu elediği için mevcut `['AAPL','MSFT']` testi korunur (Step 4'te doğrulanır).

## Execution Handoff

**İki uygulama seçeneği:**

1. **Subagent-Driven (önerilen)** — her task için taze subagent, task arası review. REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.
2. **Inline Execution** — bu oturumda checkpoint'li batch. REQUIRED SUB-SKILL: `superpowers:executing-plans`.

Bu slice küçük (3-4 task, hepsi ince değişiklik) — **Sonnet oturumunda inline execution** ideal.
