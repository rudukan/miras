# E2E Test Sistemi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playwright E2E altyapısı — çekirdek oyun yolculuğu + e-posta auth akışları (tam e-posta gidiş-dönüşü), lokal Supabase (Docker) üzerinde, CI'da bloklayıcı.

**Architecture:** Testler `vite dev` (port 5199, E2E env) + lokal Supabase stack'ine (127.0.0.1:54321) karşı koşar. Piyasa verisi Playwright route/`routeWebSocket` mock'larıyla deterministik; e-postalar lokal Mailpit'ten (127.0.0.1:54324) HTTP API ile okunur. Turnstile, `addInitScript` stub'ıyla ağsız geçilir (lokal Supabase captcha doğrulaması kapalı — token içeriği önemsiz).

**Tech Stack:** @playwright/test ≥1.48 (`routeWebSocket` şartı), Supabase CLI ≥2.x (Mailpit'li), @supabase/supabase-js (admin seed).

**Spec:** `docs/superpowers/specs/2026-07-12-e2e-test-sistemi-design.md`

**Spec'ten bilinçli sapmalar** (planlama keşfinde netleşti):
1. `.env.e2e` dosyası YOK — anahtarlar `npx supabase status -o env`'den runtime'da okunur (`tests/e2e/helpers/stack.ts`), statik değerler `playwright.config.ts` içinde. Daha az dosya, drift riski yok.
2. Turnstile için Cloudflare test sitekey yerine `window.turnstile` stub'ı — sıfır dış ağ bağımlılığı, tam determinizm.
3. Fixture'lar `.json` değil `.ts` modülü (`fixtures/market.ts`) — tip güvenliği, import-assertion derdi yok.
4. "Offline giriş" welcome'da ancak misafir DENEMESİ hata verince görünür (`WelcomeScreen.svelte` — `{#if errorMsg}` bloğu). Offline testleri bu yüzden önce auth'u bloke edip hata yolundan girer — gerçek UX'in birebir kendisi.
5. Spec'teki 9 senaryoya ek 10.: "oturumsuz ilk ziyaret welcome gösterir" (Task 2'nin kalıcı smoke testi).
6. CI'da Playwright browser cache YOK (v1) — `playwright install` ~1 dk; cache karmaşıklığı v1.1'e ertelendi (spec §7 "cache'li" demişti, Supabase image cache ile birlikte ele alınacak).

## Global Constraints

- **ÖNKOŞUL: Docker Desktop kurulu ve ÇALIŞIR olmalı** (lokal stack için). Kurulu değilse Task 1'de dur, kullanıcıya haber ver.
- Identifier'lar İngilizce, UI metinleri ve test başlıkları Türkçe (CLAUDE.md kuralı).
- Dev server portu: **5199** (kullanıcının 5173'teki dev server'ıyla çakışmasın).
- Supabase lokal URL **127.0.0.1:54321 hardcoded** — prod'a karşı koşma imkânı bilinçli olarak yok.
- Testlerde `waitForTimeout` YASAK — her bekleme bir koşula bağlanır (Playwright auto-wait, `expect().toBeVisible()`, polling helper).
- Var olan `npm run e2e` script'i (`playwright test`) kullanılır, yeni script ekleme.
- Commit önekleri: `test(e2e):` testler, `chore(e2e):` altyapı, `ci:` workflow.
- Her task sonunda `npm run test` (unit) yeşil kalmalı — E2E dosyaları Vitest'e SIZMAMALI (Vitest config'i `src` içinde arıyor, `tests/e2e` dışarıda — doğal olarak ayrık; yine de kontrol et).

---

### Task 1: Lokal Supabase yapılandırması

**Files:**
- Create: `supabase/config.toml` (`npx supabase init` üretir, sonra düzenlenir)
- Create: `supabase/templates/confirmation.html`
- Create: `supabase/templates/recovery.html`

**Interfaces:**
- Produces: Çalışan lokal stack — API `http://127.0.0.1:54321`, Mailpit `http://127.0.0.1:54324`, migrations 0001-0003 uygulanmış, anonim giriş açık, e-posta doğrulama açık, mail linkleri `/auth/confirm`'e işaret ediyor.

- [ ] **Step 1: Docker kontrolü**

Run: `docker info --format "{{.ServerVersion}}"`
Expected: Versiyon numarası. Hata alırsan DUR — kullanıcıdan Docker Desktop kurmasını/başlatmasını iste. Devam etme.

- [ ] **Step 2: supabase init**

Run: `npx supabase init`
Expected: `supabase/config.toml` oluşur. Mevcut `supabase/migrations/` dizinine DOKUNMAZ (init migration üretmez). "config.toml already exists" derse dosya zaten var — Step 3'e geç.

- [ ] **Step 3: config.toml'u düzenle**

`supabase/config.toml` içinde aşağıdaki key'leri bul ve değiştir (bölümler init çıktısında zaten var; yoksa bölümü ekle). Dosyanın kalanına dokunma:

```toml
[auth]
site_url = "http://localhost:5199"
additional_redirect_urls = ["http://localhost:5199"]
enable_anonymous_sign_ins = true

[auth.email]
enable_signup = true
enable_confirmations = true

[auth.email.template.confirmation]
subject = "Miras — e-postanı doğrula"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.recovery]
subject = "Miras — şifre sıfırlama"
content_path = "./supabase/templates/recovery.html"

[auth.rate_limit]
email_sent = 100
```

Not: `[auth.rate_limit]` bölümü CLI sürümüne göre olmayabilir — yoksa `[auth]` bölümünden sonra ekle. `email_sent` limiti testlerin art arda mail tetiklemesi için yükseltiliyor.

- [ ] **Step 4: Mail şablonlarını yaz**

`supabase/templates/confirmation.html`:
```html
<h2>E-postanı doğrula</h2>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
    >Hesabını doğrulamak için tıkla</a
  >
</p>
```

`supabase/templates/recovery.html`:
```html
<h2>Şifre sıfırlama</h2>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery"
    >Yeni şifre belirlemek için tıkla</a
  >
</p>
```

Kritik: linkler prod'daki gibi uygulamanın `/auth/confirm` rotasına gider (`src/routes/auth/confirm/+server.ts` — `token_hash`+`type` bekler, `type=recovery` ise `/?pw_reset=1`'e, değilse `/`'a yönlendirir). `type=email` Supabase `verifyOtp`'un signup doğrulaması için beklediği değerdir.

- [ ] **Step 5: Stack'i başlat ve doğrula**

Run: `npx supabase start` (ilk seferde image indirir, ~2-5 dk)
Expected: Servis URL listesi. Ardından doğrula:

Run: `npx supabase status -o env`
Expected: Çıktıda `ANON_KEY=`, `SERVICE_ROLE_KEY=`, `API_URL="http://127.0.0.1:54321"` satırları var. **Bu satır adları Task 2'deki parser'ın sözleşmesi — farklıysa (ör. CLI yeni sürümde isim değiştirdiyse) Task 2'deki regex'leri gerçek çıktıya göre uyarlayıp bu plana not düş.**

Run: `curl -s http://127.0.0.1:54324/api/v1/messages | head -c 200`
Expected: JSON döner (Mailpit ayakta). 404/bağlantı hatası alırsan `npx supabase status` çıktısındaki Mailpit/Inbucket URL'ini kontrol et ve Task 5'teki `MAILPIT_URL`'i ona göre düzelt.

Run: migrations kontrolü — `npx supabase migration list`
Expected: `0001_identity`, `0002_upsert_grants`, `0003_saves_delete` local sütununda uygulanmış görünür.

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml supabase/templates/
git commit -m "chore(e2e): lokal Supabase yapılandırması — anonim giriş, e-posta doğrulama, /auth/confirm şablonları"
```

---

### Task 2: Playwright config + stack helper + welcome smoke testi

**Files:**
- Create: `playwright.config.ts` (repo kökü)
- Create: `tests/e2e/helpers/stack.ts`
- Create: `tests/e2e/welcome.spec.ts`

**Interfaces:**
- Consumes: Task 1'in çalışan stack'i.
- Produces: `supabaseEnv(): { anonKey: string; serviceRoleKey: string }`, `SUPABASE_URL`, `MAILPIT_URL`, `BASE_URL` sabitleri (`tests/e2e/helpers/stack.ts`). Sonraki tüm task'lar bunları import eder.

- [ ] **Step 1: stack.ts helper'ını yaz**

`tests/e2e/helpers/stack.ts`:
```ts
import { execSync } from 'node:child_process';

export const SUPABASE_URL = 'http://127.0.0.1:54321';
export const MAILPIT_URL = 'http://127.0.0.1:54324';
export const PORT = 5199;
export const BASE_URL = `http://localhost:${PORT}`;

let cached: { anonKey: string; serviceRoleKey: string } | null = null;

/** Lokal Supabase stack'inden anahtarları okur. Stack kapalıysa anlaşılır hata verir.
 *  Prod'a karşı koşmak BY DESIGN imkânsız — URL'ler bu dosyada 127.0.0.1'e sabit. */
export function supabaseEnv(): { anonKey: string; serviceRoleKey: string } {
  if (cached) return cached;
  let out: string;
  try {
    out = execSync('npx supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('Lokal Supabase kapalı görünüyor — önce `npx supabase start` çalıştır.');
  }
  const get = (name: string): string => {
    const m = out.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?`, 'm'));
    if (!m) throw new Error(`\`supabase status -o env\` çıktısında ${name} yok — CLI sürümü isimleri değiştirmiş olabilir`);
    return m[1];
  };
  cached = { anonKey: get('ANON_KEY'), serviceRoleKey: get('SERVICE_ROLE_KEY') };
  return cached;
}
```

- [ ] **Step 2: playwright.config.ts'i yaz**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';
import { supabaseEnv, SUPABASE_URL, BASE_URL, PORT } from './tests/e2e/helpers/stack';

const keys = supabaseEnv();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // $env/static/* dev-server başlangıcında inline edilir — E2E env'i BURADAN verilir,
    // .env.local'ı process env önceliğiyle ezer (Vite kuralı).
    env: {
      PUBLIC_SUPABASE_URL: SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.anonKey,
      SUPABASE_SECRET_KEY: keys.serviceRoleKey,
      // Stub (helpers/turnstile-stub.ts) script'i hiç yüklemez; bu değer yalnız
      // $env/static/public importunun boş kalmaması için.
      PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000BB',
    },
  },
});
```

- [ ] **Step 3: Welcome smoke testini yaz**

`tests/e2e/welcome.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('oturumsuz ilk ziyaret welcome ekranını gösterir', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('[ MİRAS — CANLI ÇEKİRDEK ]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'GOOGLE İLE GİRİŞ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MİSAFİR OLARAK OYNA' })).toBeVisible();
});
```

- [ ] **Step 4: Koş ve PASS doğrula**

Run: `npx playwright install chromium` (ilk sefer), sonra `npm run e2e`
Expected: 1 test PASS. FAIL ise: dev server logunu oku (env eksik mi), `phase === 'welcome'` düşmüyorsa taze context'te localStorage boş olmalı — testte temizlik gerekmez.

- [ ] **Step 5: Unit testler hâlâ yeşil mi**

Run: `npm run test`
Expected: Playwright spec'leri Vitest'e sızmadan mevcut testler geçer. Sızıyorsa `vitest.config`/`vite.config` test include ayarına `tests/e2e` exclude ekle (mevcut include zaten `src` — büyük olasılıkla dokunmak gerekmez).

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e/
git commit -m "test(e2e): Playwright altyapısı — lokal stack env köprüsü + welcome smoke"
```

---

### Task 3: Market mock katmanı + "oyun açılır, fiyatlar gelir" testi

**Files:**
- Create: `tests/e2e/fixtures/market.ts`
- Create: `tests/e2e/helpers/market-mocks.ts`
- Create: `tests/e2e/helpers/turnstile-stub.ts`
- Create: `tests/e2e/helpers/enter.ts`
- Create: `tests/e2e/core-journey.spec.ts` (ilk test)

**Interfaces:**
- Consumes: `stack.ts` sabitleri.
- Produces: `mockMarketData(page: Page): Promise<void>`, `stubTurnstile(page: Page): Promise<void>`, `enterOffline(page: Page): Promise<void>` — sonraki task'ların tamamı bunları kullanır. Fixture sabitleri: BTC=$100.000, usdTry=40.

- [ ] **Step 1: Fixture modülünü yaz**

`tests/e2e/fixtures/market.ts`:
```ts
/** Deterministik piyasa fixture'ları — E2E assert'leri BU sayılara yazılır.
 *  Şekiller src/lib/api/types.ts'teki Cached<FxValue> / Cached<CryptoValue> ile birebir. */
export const FX_FIXTURE = {
  value: {
    usdTry: 40,
    prices: { THYAO: 300, ASELS: 150, XAUGRAM: 4000, XAGGRAM: 50, EUR: 44 },
    change: { THYAO: 1.2, ASELS: -0.5 },
  },
  asOf: 0, // route kurulurken Date.now() ile damgalanır
  stale: false,
};

export const CRYPTO_FIXTURE = {
  value: {
    prices: { BTC: 100_000, ETH: 4000, SOL: 200, XRP: 2, DOGE: 0.2, AVAX: 30 },
    change: { BTC: 2.5 },
  },
  asOf: 0,
  stale: false,
};
```

- [ ] **Step 2: market-mocks.ts helper'ını yaz**

`tests/e2e/helpers/market-mocks.ts`:
```ts
import type { Page } from '@playwright/test';
import { FX_FIXTURE, CRYPTO_FIXTURE } from '../fixtures/market';

/** Tüm piyasa kaynaklarını fixture'lara bağlar — dış dünyaya sıfır istek.
 *  Supabase'e DOKUNMAZ (auth/cloud testleri gerçek lokal stack'e gider). */
export async function mockMarketData(page: Page): Promise<void> {
  await page.route('**/api/yahoo*', (route) =>
    route.fulfill({ json: { ...FX_FIXTURE, asOf: Date.now() } }),
  );
  await page.route('**/api/crypto*', (route) =>
    route.fulfill({ json: { ...CRYPTO_FIXTURE, asOf: Date.now() } }),
  );
  // Aşağıdaki üçü kapsanan akışlarda çağrılmayabilir — savunma amaçlı sabitlenir.
  await page.route('**/api/series*', (route) =>
    route.fulfill({ json: { value: [], asOf: Date.now(), stale: false } }),
  );
  await page.route('**/api/usSearch*', (route) => route.fulfill({ json: { results: [] } }));
  await page.route('**/api/telemetry', (route) => route.fulfill({ status: 204 }));

  // Binance combined stream taklidi: bağlantı anında her sembole bir trade frame'i.
  // Mesaj şekli src/lib/api/binance.ts onmessage parser'ıyla birebir: {data:{s,p}}.
  await page.routeWebSocket(/stream\.binance\.com/, (ws) => {
    const frame = (s: string, p: number) => JSON.stringify({ data: { s, p: String(p) } });
    for (const [sym, price] of Object.entries(CRYPTO_FIXTURE.value.prices)) {
      ws.send(frame(`${sym}USDT`, price));
    }
    ws.send(frame('USDTTRY', FX_FIXTURE.value.usdTry));
  });
}
```

- [ ] **Step 3: turnstile-stub.ts helper'ını yaz**

`tests/e2e/helpers/turnstile-stub.ts`:
```ts
import type { Page } from '@playwright/test';

/** window.turnstile'ı sayfa yüklenmeden stub'lar — Cloudflare script'i HİÇ yüklenmez
 *  (src/lib/api/turnstile.ts loadScript önce window.turnstile'a bakar).
 *  render() sözleşmesi turnstile.ts'tekiyle birebir: {sitekey, callback, 'error-callback'}.
 *  Lokal Supabase'de captcha doğrulaması kapalı — token içeriği önemsiz. */
export async function stubTurnstile(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: (_el: unknown, opts: { callback: (token: string) => void }) => {
        setTimeout(() => opts.callback('e2e-dummy-token'), 0);
        return 'e2e-widget';
      },
      remove: () => {},
    };
  });
}
```

- [ ] **Step 4: enter.ts helper'ını yaz**

`tests/e2e/helpers/enter.ts`:
```ts
import type { Page } from '@playwright/test';

/** Offline giriş: welcome'daki offline linki ancak misafir DENEMESİ hata verince görünür
 *  (WelcomeScreen {#if errorMsg}). Auth bloke edilir → misafir dener → hata → offline linki. */
export async function enterOffline(page: Page): Promise<void> {
  await page.route('**/auth/v1/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'MİSAFİR OLARAK OYNA' }).click();
  await page
    .getByRole('button', { name: 'yine de çevrimdışı oyna (kayıt yalnız bu cihazda)' })
    .click();
}
```

- [ ] **Step 5: İlk core testini yaz**

`tests/e2e/core-journey.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('offline giriş sonrası oyun açılır ve mock fiyatlar render olur', async ({ page }) => {
  await enterOffline(page);
  // Playing ekranı: üst bantta Günün Kartı butonu
  await expect(page.getByRole('button', { name: 'Günün Kartı' })).toBeVisible();
  // Fiyat listesinde çekirdek varlıklar (fixture'dan)
  await expect(page.getByText('Bitcoin')).toBeVisible();
  await expect(page.getByText('Ethereum')).toBeVisible();
  await expect(page.getByText('Gram Altın')).toBeVisible();
});
```

- [ ] **Step 6: Koş ve PASS doğrula**

Run: `npx playwright test core-journey -x`
Expected: PASS. FAIL ise trace'e bak (`npx playwright show-trace`): WS mock'u bağlanmıyorsa `routeWebSocket` pattern'ini, fiyat gelmiyorsa `/api/*` route'larının gerçekten yakalandığını kontrol et (dev server 5199'da network sekmesi).

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): piyasa mock katmanı (route+WS) + offline giriş + oyun açılış testi"
```

---

### Task 4: Çekirdek yolculuk — işlem + kalıcılık

**Files:**
- Modify: `tests/e2e/core-journey.spec.ts` (2 test eklenir)

**Interfaces:**
- Consumes: Task 3 helper'ları; BTC=$100.000 fixture'ı; TradeForm selector'ları: `#trade-units-BTC` input, `AL`/`SAT` butonları, toast formatı `✓ BTC ALINDI — 1.0000 adet · …` (`src/lib/components/format.ts tradeToastMessage`).

- [ ] **Step 1: İşlem testini ekle**

`core-journey.spec.ts`'e ekle:
```ts
test('varlık al/sat — toast onayı ve TÜMÜ chip sinyali', async ({ page }) => {
  await enterOffline(page);
  // Kripto seç (BTC 7/24 açık — market-saat flake'i imkânsız)
  await page.getByText('Bitcoin').first().click();
  await expect(page.locator('#trade-units-BTC')).toBeVisible();
  await page.locator('#trade-units-BTC').fill('1');
  await page.getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI — 1\.0000 adet/)).toBeVisible();
  // Pozisyon var → TÜMÜ chip'i görünür (yalnız heldUnits > 0 iken render edilir)
  await expect(page.getByRole('button', { name: 'TÜMÜ' })).toBeVisible();

  await page.locator('#trade-units-BTC').fill('1');
  await page.getByRole('button', { name: 'SAT', exact: true }).click();
  await expect(page.getByText(/✓ BTC SATILDI — 1\.0000 adet/)).toBeVisible();
});
```

- [ ] **Step 2: Kalıcılık testini ekle**

```ts
test('sayfa yenilenince kayıt korunur — intro DEVAM ET yolu', async ({ page }) => {
  await enterOffline(page);
  await page.getByText('Bitcoin').first().click();
  await page.locator('#trade-units-BTC').fill('2');
  await page.getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI — 2\.0000 adet/)).toBeVisible();

  await page.reload();
  // Local save var → boot'suz senkron intro (bootPhase.initialPhase)
  await expect(page.getByText('Kayıtlı oyun bulundu')).toBeVisible();
  await page.getByRole('button', { name: 'DEVAM ET ▶' }).click();
  // Pozisyon yaşıyor mu: BTC seçince TÜMÜ chip'i hâlâ orada
  await page.getByText('Bitcoin').first().click();
  await expect(page.getByRole('button', { name: 'TÜMÜ' })).toBeVisible();
});
```

- [ ] **Step 3: Koş, PASS doğrula, flake taraması**

Run: `npx playwright test core-journey --repeat-each=3`
Expected: 9/9 PASS (3 test × 3 tekrar). Tek tük FAIL varsa nedeni büyük ihtimalle fiyatın WS'ten store'a düşme zamanlaması — `AL` öncesi `#trade-units-BTC` görünürlüğü yetmiyorsa fiyat bekleyen bir assert ekle (örn. trade panelinde BTC etiketi + fiyat metni).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/core-journey.spec.ts
git commit -m "test(e2e): çekirdek yolculuk — al/sat toast'ları + reload kalıcılığı"
```

---

### Task 5: Mailpit helper + kayıt (signup) akışı

**Files:**
- Create: `tests/e2e/helpers/mailpit.ts`
- Create: `tests/e2e/auth-email.spec.ts` (ilk test)

**Interfaces:**
- Consumes: `MAILPIT_URL` (`stack.ts`), Task 1 mail şablonları (linkler `/auth/confirm?...type=email|recovery`).
- Produces: `waitForAuthLink(email: string, kind: 'email' | 'recovery'): Promise<string>` — Task 7 de kullanır.

- [ ] **Step 1: mailpit.ts helper'ını yaz**

`tests/e2e/helpers/mailpit.ts`:
```ts
import { MAILPIT_URL } from './stack';

interface MailpitSearch {
  messages: Array<{ ID: string }>;
}

/** Alıcıya gelen SON mailden /auth/confirm linkini ayıklar (500ms aralıkla 15 sn'ye kadar bekler).
 *  Testler benzersiz e-posta ürettiği için paralel koşuda karışma olmaz. */
export async function waitForAuthLink(email: string, kind: 'email' | 'recovery'): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    if (res.ok) {
      const { messages } = (await res.json()) as MailpitSearch;
      if (messages.length > 0) {
        const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        const body = (await msgRes.json()) as { HTML: string; Text: string };
        const html = body.HTML || body.Text;
        const m = html.match(
          new RegExp(`href="([^"]*/auth/confirm\\?[^"]*type=${kind}[^"]*)"`),
        );
        if (m) return m[1].replace(/&amp;/g, '&');
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${email} için ${kind} maili 15 sn içinde Mailpit'e düşmedi`);
}
```

- [ ] **Step 2: Kayıt testini yaz**

`tests/e2e/auth-email.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { waitForAuthLink } from './helpers/mailpit';

const PASSWORD = 'e2e-Sifre-123';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('kayıt → doğrulama maili → linke tıkla → oturumlu intro', async ({ page }) => {
  const email = uniqueEmail('signup');
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'Kayıt', exact: true }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(PASSWORD);
  await page.getByRole('button', { name: 'KAYIT OL' }).click();
  await expect(page.getByText(/Mail gönderildi/)).toBeVisible();

  const link = await waitForAuthLink(email, 'email');
  await page.goto(link);
  // /auth/confirm token'ı sunucuda takas eder → '/' → oturum VAR + local save YOK → intro
  await expect(page.getByRole('button', { name: 'BAŞLA ▶' })).toBeVisible();
});
```

- [ ] **Step 3: Koş ve PASS doğrula**

Run: `npx playwright test auth-email -x`
Expected: PASS. "Mail gönderildi" görünüyor ama link gelmiyorsa: Mailpit UI'ına bak (`http://127.0.0.1:54324`) — mail hiç yoksa `enable_confirmations` ayarı, mail var ama link farklıysa şablon `content_path` yolu yanlış demektir (config.toml'daki yol repo köküne görecelidir).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): Mailpit köprüsü + kayıt akışı — gerçek doğrulama maili gidiş-dönüşü"
```

---

### Task 6: Admin seed helper + giriş + yanlış şifre

**Files:**
- Create: `tests/e2e/helpers/supabase-admin.ts`
- Modify: `tests/e2e/auth-email.spec.ts` (2 test eklenir)

**Interfaces:**
- Consumes: `supabaseEnv()`, `SUPABASE_URL` (`stack.ts`); `@supabase/supabase-js` (zaten dependency).
- Produces: `seedConfirmedUser(): Promise<{ email: string; password: string }>` — Task 7 de kullanır.

- [ ] **Step 1: supabase-admin.ts helper'ını yaz**

`tests/e2e/helpers/supabase-admin.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv, SUPABASE_URL } from './stack';

/** Service-role client — YALNIZ test seed'i için, YALNIZ lokal stack'e karşı.
 *  (CLAUDE.md "yeni server-side client yaratma" kuralı uygulama koduna aittir;
 *  test harness'i uygulama değildir.) */
function adminClient() {
  const { serviceRoleKey } = supabaseEnv();
  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Doğrulanmış (email_confirm) kullanıcı üretir — giriş/reset testlerinin başlangıç durumu. */
export async function seedConfirmedUser(): Promise<{ email: string; password: string }> {
  const email = `e2e-seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'e2e-Sifre-123';
  const { error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`test kullanıcısı üretilemedi: ${error.message}`);
  return { email, password };
}
```

Not: temizlik (cleanup) YOK — lokal stack atılabilir (`npx supabase db reset` her şeyi sıfırlar), CI'da zaten job sonunda ölür. Prod'daki gibi e2e-prefix temizliği gerekmiyor.

- [ ] **Step 2: Giriş ve yanlış şifre testlerini ekle**

`auth-email.spec.ts`'e ekle:
```ts
import { seedConfirmedUser } from './helpers/supabase-admin';

test('doğrulanmış kullanıcı e-posta+şifreyle girer → intro', async ({ page }) => {
  const { email, password } = await seedConfirmedUser();
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(password);
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  // handleEmailSignIn başarıda location.reload() yapar → boot → oturum var → intro
  await expect(page.getByRole('button', { name: 'BAŞLA ▶' })).toBeVisible();
});

test('yanlış şifre Türkçe hata gösterir, form kilitlenmez', async ({ page }) => {
  const { email } = await seedConfirmedUser();
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill('yanlis-sifre-99');
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  // authErrors.ts: invalid_credentials → sabit Türkçe mesaj
  await expect(page.getByText('E-posta ya da şifre hatalı')).toBeVisible();
  // Form hâlâ etkileşimli (busy kilidi çözülmüş)
  await expect(page.getByRole('button', { name: 'GİRİŞ', exact: true })).toBeEnabled();
});
```

- [ ] **Step 3: Koş ve PASS doğrula**

Run: `npx playwright test auth-email -x`
Expected: 3 test PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): admin seed + e-posta girişi + yanlış şifre hata yolu"
```

---

### Task 7: Şifre sıfırlama — tam gidiş-dönüş

**Files:**
- Modify: `tests/e2e/auth-email.spec.ts` (1 test eklenir)

**Interfaces:**
- Consumes: `seedConfirmedUser`, `waitForAuthLink`. Recovery linki → `/auth/confirm?type=recovery` → `/?pw_reset=1` → `+page.svelte` pwReset overlay (placeholder `yeni şifre (en az 8 karakter)`, buton `KAYDET`, toast `Şifre güncellendi`).

- [ ] **Step 1: Reset testini ekle**

`auth-email.spec.ts`'e ekle:
```ts
test('şifre sıfırlama: mail → overlay → yeni şifreyle giriş', async ({ page }) => {
  const { email } = await seedConfirmedUser();
  const newPassword = 'yeni-e2e-Sifre-456';

  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'şifremi unuttum' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByRole('button', { name: 'SIFIRLAMA MAİLİ GÖNDER' }).click();
  await expect(page.getByText(/Mail gönderildi/)).toBeVisible();

  const link = await waitForAuthLink(email, 'recovery');
  await page.goto(link);
  // verifyOtp(recovery) oturum açar → /?pw_reset=1 → overlay
  await expect(page.getByText('Yeni şifre belirle')).toBeVisible();
  await page.getByPlaceholder('yeni şifre (en az 8 karakter)').fill(newPassword);
  await page.getByRole('button', { name: 'KAYDET' }).click();
  await expect(page.getByText('Şifre güncellendi')).toBeVisible();

  // Kanıt: yeni şifre gerçekten çalışıyor — oturumu at, sıfırdan gir
  await page.context().clearCookies();
  await page.reload();
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(newPassword);
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'BAŞLA ▶' })).toBeVisible();
});
```

- [ ] **Step 2: Koş ve PASS doğrula**

Run: `npx playwright test auth-email -x`
Expected: 4 test PASS. Reset overlay açılmıyorsa linkteki `type=recovery`'yi ve `/auth/confirm`'ün `/?pw_reset=1` redirect'ini kontrol et.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/auth-email.spec.ts
git commit -m "test(e2e): şifre sıfırlama tam gidiş-dönüşü — recovery maili → overlay → yeni şifreyle giriş"
```

---

### Task 8: Misafir + offline spec'i

**Files:**
- Create: `tests/e2e/guest-offline.spec.ts`

**Interfaces:**
- Consumes: tüm helper'lar. cloudPush debounce **30 sn** (`src/lib/stores/cloudSave.ts`) — bekleme yerine `visibilitychange` flush tetiklenir (`+page.svelte flushOnHide`).

- [ ] **Step 1: Spec'i yaz**

`tests/e2e/guest-offline.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('misafir girişi: anonim oturum + save buluta yazılır', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'MİSAFİR OLARAK OYNA' }).click();
  // Misafir intro'suz doğrudan oyuna girer (handleGuest → enterGame)
  await expect(page.getByRole('button', { name: 'Günün Kartı' })).toBeVisible();

  // State değişikliği üret → persist + cloudPush.schedule (debounce 30 sn)
  await page.getByText('Bitcoin').first().click();
  await page.locator('#trade-units-BTC').fill('1');
  await page.getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI/)).toBeVisible();

  // Debounce'u bekleme: visibilitychange flush'ı tetikle (+page.svelte flushOnHide)
  const savePush = page.waitForRequest(
    (req) => req.url().includes('/rest/v1/saves') && req.method() === 'POST',
    { timeout: 10_000 },
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await savePush;
});

test('offline oyun: oyun çalışır, buluta TEK istek gitmez', async ({ page }) => {
  const restCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/')) restCalls.push(req.url());
  });

  await enterOffline(page);
  await page.getByText('Bitcoin').first().click();
  await page.locator('#trade-units-BTC').fill('1');
  await page.getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI/)).toBeVisible();

  // cloudPush hiç enable edilmedi → /rest/v1'e sıfır istek (spec §4.B fail-safe)
  expect(restCalls).toEqual([]);
});
```

- [ ] **Step 2: Koş ve PASS doğrula**

Run: `npx playwright test guest-offline -x`
Expected: 2 test PASS. Misafir testinde `saves` POST'u gelmiyorsa: RLS reddi olabilir — dev server logunda 403 ara; anonim kullanıcı `saves` upsert'i prod'da çalışıyor, migrations lokalde aynı — 403 görürsen migration listesini (Task 1 Step 5) tekrar doğrula.

- [ ] **Step 3: Tüm E2E süiti + flake taraması**

Run: `npm run e2e` sonra `npx playwright test --repeat-each=3`
Expected: 10 test, tümü PASS, 3 tekrarda flake yok (spec §10 başarı ölçütü).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/guest-offline.spec.ts
git commit -m "test(e2e): misafir bulut push'u (flush hilesiyle) + offline sıfır-bulut garantisi"
```

---

### Task 9: CI job + dokümantasyon senkronu

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md` (Test Disiplini bölümü)
- Modify: `memory.md` (son oturum özeti — mevcut formatına uyarak)

- [ ] **Step 1: ci.yml'e e2e job'ı ekle**

`.github/workflows/ci.yml` sonuna ekle (mevcut `test` job'ına PARALEL — `needs` yok):

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: supabase/setup-cli@v1
        with:
          version: 2.109.1 # lokal geliştirme sürümüyle eşit — bilinçli bump'la yükselt
      - run: supabase start
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Not: `test` job'ındaki placeholder env'ler burada GEREKMEZ — dev server env'i `playwright.config.ts webServer.env`'den geliyor, anahtarlar `supabase status`'tan okunuyor.

- [ ] **Step 2: Branch push ile CI'ı doğrula**

```bash
git checkout -b e2e-ci-dogrulama
git add .github/workflows/ci.yml
git commit -m "ci: bloklayıcı e2e job'ı — lokal Supabase stack + Playwright chromium"
git push -u origin e2e-ci-dogrulama
gh pr create --title "ci: E2E job" --body "E2E altyapısı CI doğrulaması" --draft
gh run watch
```

Expected: `e2e` job yeşil (~4-6 dk). Kırmızıysa job logunu oku: `supabase start` Docker hatası CI'da beklenmez; Playwright FAIL'ı artifact'taki report'tan incele. Yeşilse PR'ı main'e merge et (`gh pr ready` + `gh pr merge --squash`), branch'i sil.

- [ ] **Step 3: CLAUDE.md Test Disiplini bölümünü senkronla**

CLAUDE.md'deki şu satırı:
```
- E2E: `tests/e2e/` — Playwright critical path (onboarding → işlem → yıl sonu). **Henüz kurulmadı** (`@playwright/test` devDependency var ama `playwright.config` yok, klasör boş) — çok kullanıcılı yayından önce kurulmalı.
```
şununla değiştir:
```
- E2E: `tests/e2e/` — Playwright, **KURULU ve CI'da bloklayıcı**. 10 senaryo: çekirdek yolculuk (offline giriş → al/sat → reload kalıcılığı) + e-posta auth tam gidiş-dönüşü (kayıt/giriş/reset — lokal Mailpit inbox'ı) + misafir/offline yolları. Lokal koşu: Docker Desktop + `npx supabase start` + `npm run e2e`. Piyasa verisi tam mock (route + routeWebSocket); Supabase lokal stack gerçek. Seans sonu E2E'de YOK (canlı modda zaman gerçek akar — clock seam ayrı dilim).
```

- [ ] **Step 4: Final doğrulama (verification-before-completion)**

Run: `npm run test` → PASS, `npm run build` → başarılı, `npm run e2e` → 10/10 PASS.
Expected: üçü de yeşil. Herhangi biri kırmızıysa "tamam" DEME — düzelt.

- [ ] **Step 5: Commit + memory güncelle**

```bash
git add CLAUDE.md memory.md
git commit -m "docs: E2E sistemi kuruldu — CLAUDE.md test disiplini + memory senkron"
```
