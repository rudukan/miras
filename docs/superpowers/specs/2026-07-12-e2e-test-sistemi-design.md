# E2E Test Sistemi — Tasarım

**Tarih:** 2026-07-12
**Durum:** Onay bekliyor
**Kapsam:** Playwright E2E altyapısı — çekirdek yolculuk + e-posta auth akışları (tam gidiş-dönüş)

## 1. Amaç ve Bağlam

CLAUDE.md Test Disiplini bölümündeki açık: `@playwright/test` devDependency mevcut, `e2e` script'i var, ama `playwright.config` yok ve `tests/e2e/` boş. Çok kullanıcılı yayın öncesi kritik kullanıcı yolculuklarının regresyon koruması yok — unit testler mantığı koruyor ama "kullanıcı giriş yapıp işlem yapabiliyor mu" sorusunu hiçbir test yanıtlamıyor.

Not: CLAUDE.md'deki "onboarding → işlem → yıl sonu" critical path'i VASİYET modu için yazılmıştı. Canlı modda gün gerçek zamanlı aktığı için **seans sonu E2E'de ulaşılamaz** — v1 kapsamı dışında (bkz. §8).

## 2. Verilen Kararlar

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| Kapsam | Çekirdek yolculuk + auth akışları | En yüksek risk alanları; auth SP1.5'te yeni yazıldı |
| Test ortamı | Lokal Supabase (Docker) | Sahte inbox (Mailpit) ile e-posta linkine tıklama dahil TAM akış; prod kirlenmez; veri kaynağı prensibiyle tutarlı |
| Piyasa verisi | Tam mock | Playwright route + `routeWebSocket`; deterministik, borsa kapalıyken ve CI'da her zaman çalışır |
| CI | PR + main, bloklayıcı | Kırılırsa merge olmaz; E2E'nin asıl değeri bu |

## 3. Mimari

Test piramidi korunur: ~40 unit/domain test dosyası mantığı, E2E yalnız kullanıcı yolculuklarını doğrular. E2E ince kalır (3 spec dosyası, ~8-10 test).

```
playwright.config.ts          — webServer: vite dev (E2E env ile), chromium-only v1
.env.e2e                      — lokal Supabase URL/key + Turnstile test sitekey
supabase/config.toml          — supabase init çıktısı; captcha KAPALI, e-posta onayı AÇIK
tests/e2e/
  helpers/mailpit.ts          — lokal sahte inbox'tan e-posta çekme + link ayıklama
  helpers/market-mocks.ts     — /api/* route fixture'ları + Binance routeWebSocket kurulumu
  helpers/supabase-admin.ts   — test kullanıcısı tohumlama/temizleme (service key ile)
  fixtures/*.json             — deterministik fiyat verileri
  core-journey.spec.ts        — çekirdek yolculuk
  auth-email.spec.ts          — kayıt / giriş / şifre sıfırlama (tam e-posta gidiş-dönüşü)
  guest-offline.spec.ts       — misafir + offline giriş yolları
```

**Dev server:** `vite dev`, Playwright `webServer` bloğu yönetir. `$env/static/*` build-time inline edildiği için E2E kendi env setiyle (`.env.e2e`) başlar. Production build'e karşı test v1.1 adayı.

**Tarayıcı matrisi:** v1 chromium-only. Oyun terminal-estetikli desktop deneyimi; webkit/firefox eklemek config'de tek satır, ihtiyaç doğunca açılır.

## 4. Test Senaryoları

### core-journey.spec.ts
1. Welcome → offline gir → oyun açılır → mock fiyatlar render olur (BTC sabit $100.000).
2. Varlık al → cüzdan/portföy deterministik değerlerle güncellenir → sat → bakiye doğru.
3. Sayfa yenile → local save ile intro'ya düşer → bakiye/holdings korunmuş.

### auth-email.spec.ts
4. **Kayıt:** form doldur → "e-posta gönderildi" ekranı → Mailpit API'den doğrulama e-postası → linki ayıkla → linke git → `/auth/confirm` takası → oturumlu oyuna düşer.
5. **Giriş:** tohumlanmış doğrulanmış kullanıcı (global setup'ta admin API ile) → e-posta+şifre → oyun açılır.
6. **Şifre sıfırlama:** "unuttum" → Mailpit'ten recovery linki → `/auth/confirm?type=recovery` → şifre-yenile overlay → yeni şifreyle giriş başarılı.
7. **Hata yolu:** yanlış şifre → Türkçe hata mesajı görünür, form kilitlenmez.

### guest-offline.spec.ts
8. **Misafir:** anonim oturum (lokal captcha kapalı) → oyun açılır → save cloud'a yazılır.
9. **Offline:** oturumsuz oyna → oyun açılır → cloudPush kapalı (network assert: /rest/v1 çağrısı yok).

## 5. Mock Katmanı

- `/api/yahoo`, `/api/crypto`, `/api/series`, `/api/usSearch` → Playwright `page.route()` ile `fixtures/*.json`'dan yanıt.
- Binance `wss://` → `page.routeWebSocket()` ile senaryolu tick akışı (bağlantı anında seed tick + periyodik tekrar).
- Turnstile → Cloudflare'in resmi "her zaman geçer" test sitekey'i (`1x00000000000000000000AA`) `.env.e2e`'de; gerçek script yüklenir, challenge her zaman geçer. Lokal Supabase'de captcha doğrulaması kapalı olduğu için token içeriği önemsiz.

## 6. Lokal Supabase Kurulumu

- `supabase init` → `config.toml` repo'ya girer. Ayarlar: `auth.email.enable_confirmations = true`, captcha kapalı, `site_url` = dev server adresi.
- `supabase start` → migrations `0001-0003` otomatik uygulanır; stack Mailpit dahil ayağa kalkar.
- Key eşleşmesi: lokal stack'in anon/service_role key'leri `.env.e2e`'de `PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` olarak verilir (client tarafında birebir değiştirilebilirler; plan aşamasında `supabase status` çıktısıyla doğrulanır).

## 7. CI Entegrasyonu

`ci.yml`'e mevcut `test` job'ına **paralel**, bloklayıcı `e2e` job'ı:

```
e2e job: checkout → setup-node → npm ci → supabase start
        → playwright install --with-deps chromium (cache'li)
        → npm run e2e → başarısızlıkta trace/screenshot artifact
```

Tahmini ek süre ~4-5 dk (Supabase stack ~2 dk + testler). Paralel job olduğu için toplam CI süresine etkisi kısmi. Supabase Docker image cache v1.1 optimizasyonu.

## 8. Kapsam Dışı (v1)

- **Seans sonu ekranı** — clock'a test seam (zaman hızlandırma) gerektirir; ayrı dilim.
- **Google OAuth akışı** — üçüncü taraf login E2E'si kırılgan; `/auth/callback` server testi zaten var.
- **Production build'e karşı test** — v1.1.
- **webkit/firefox/mobil viewport** — ihtiyaç doğunca.
- **@live etiketli gerçek-API smoke** — hibrit istenirse sonra.

## 9. Önkoşullar ve Riskler

| Risk/Önkoşul | Etki | Plan |
|---|---|---|
| Docker Desktop lokalde YOK | Lokal E2E koşamaz | Kullanıcı kuracak (WSL2 backend); kurulana dek E2E yalnız CI'da koşar — blokaj değil |
| Supabase CLI key formatı | Env eşleşmezse auth patlar | Plan aşamasında `supabase status` ile doğrula |
| CI'da stack açılış süresi | +~2 dk | Kabul edildi; image cache v1.1 |
| Mailpit e-posta gecikmesi | Flaky test | Polling helper'da timeout+retry (max 15 sn) |

## 10. Başarı Ölçütü

- `npm run e2e` lokalde (Docker kurulunca) ve CI'da yeşil.
- 9 senaryonun tamamı deterministik — 3 ardışık koşuda flake yok.
- CI'da E2E kırmızıyken merge engellenir.
- CLAUDE.md Test Disiplini bölümü gerçek durumla senkronlanır.
