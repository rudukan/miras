# Pre-Launch Güvenlik Sertleştirme Denetimi — Tasarım (Spec)

**Tarih:** 2026-07-12
**Durum:** Onaylandı (brainstorming), plan yazımı bekliyor
**Tetikleyici:** Proje canlıya + LinkedIn vitrinine çıkmadan önce tüm saldırı yüzeyini önceliklendirilmiş taramak ve tek bir "yayına hazır mı" kararı üretmek.

---

## 1. Amaç & Kapsam

**Amaç:** Duran saldırı yüzeyinin tamamını (sadece açık diff'i değil) risk sırasıyla tarayıp, her bulguyu **P0/P1/P2** olarak etiketlemek; P0'ları düzeltip doğrulamak; sonunda net bir lansman kararı vermek.

**Kapsam içi:** Sırlar/config sınırı, auth akışları, yetkilendirme/RLS, API proxy sertleştirme, veri endpoint'leri, client/web güvenliği, tedarik zinciri.

**Kapsam dışı (bu iş değil):**
- Sürekli güvenlik monitoring / SIEM kurulumu
- Otomatik DAST/pentest altyapısı
- Load/DoS stres testi (mimari; ayrı iş)
- Oyun denge/ekonomi exploit'leri (finansal balance ayrı disiplin, `tests/balance/`)

## 2. Başarı Kriterleri (doğrulanabilir)

1. 7 alanın her biri için bulgu listesi; her bulgu şu 4 alanı içerir: `dosya:satır` · sömürü senaryosu · etki · önerilen düzeltme.
2. Tüm **P0** bulguları için uygulanmış **ve** yeniden doğrulanmış düzeltme.
3. Tek bir **launch gate** kararı: `YAYINA HAZIR` / `P0 KALDIKÇA BLOKE`.
4. Düzeltmeler sonrası `npm run test` + `npm run build` (+ mümkünse `npm run e2e`) yeşil.
5. Yanlış-pozitif oranı düşük: her bulgu rapora girmeden önce sömürülebilirliği teyit edilir (spekülatif değil, senaryolu).

## 3. Saldırı Yüzeyi (gerçek dosyalar — grounded)

| Katman | Dosyalar |
|--------|----------|
| API proxy'ler | `src/routes/api/{yahoo,crypto,series,usSearch}/+server.ts` + `src/lib/api/{yahooSource,cryptoSource,seriesSource,seriesClient,binance,usStockSearch,fx}.ts` |
| Veri endpoint'leri | `src/routes/api/profile/+server.ts`, `src/routes/api/account/delete/+server.ts`, `src/routes/api/telemetry/+server.ts` |
| Auth | `src/routes/auth/{callback,confirm}/+server.ts`, `src/lib/api/{authBootstrap,authErrors,turnstile}.ts`, `src/hooks.server.ts` |
| Yetkilendirme | `supabase/migrations/{0001_identity,0002_upsert_grants,0003_saves_delete}.sql`, `supabase/config.toml` |
| Cache/infra | `src/lib/api/{cachedFetch,keyedTtlCache}.ts`, `svelte.config.js` (adapter-vercel), CI: `.github/workflows/ci.yml` |
| Client | `src/routes/**/*.svelte`, `src/lib/components/**`, `src/lib/stores/**` |

## 4. 7 Alan — Kontrol Listesi & Risk Hipotezleri

Sıra kasıtlı: en tepedekiler bir prod/showcase projesini gerçekten batırabilecekler.

### Alan 1 — Sırlar & Config Sınırı  *(en ucuz, en yüksek getiri)*
- `$env/static/private` vs `$env/static/public` ayrımı doğru mu; `SUPABASE_SECRET_KEY` client bundle'ına sızıyor mu (build output grep).
- `.env*` `.gitignore`'da mı; git geçmişinde sızmış anahtar/token var mı (`git log -p` secret tarama).
- Vercel env değişkenleri: hangi anahtar `PUBLIC_` prefixli olmalı/olmamalı.
- Herhangi bir hardcoded key/token/URL (kaynak grep).
- **Hipotez:** Duruş iyi görünüyor (`account/delete` secret'ı sadece server'da). Doğrulanacak: profile route'u hangi client'ı kullanıyor.

### Alan 2 — Auth Akışları  *(kimlik = hesap devralma riski)*
- `auth/callback`: OAuth `code` takası; **open redirect** — `next`/`redirect_to` parametresi doğrulanıyor mu yoksa körlemesine mi yönlendiriyor.
- `auth/confirm`: `token_hash` + `type` işleme; e-posta doğrulama **ve** şifre kurtarma (recovery) yolu. **Task 14 uyarısı:** prod reset akışı muhtemelen kırık — güvenlik + işlevsellik kesişimi.
- `hooks.server.ts`: session doğrulama `getUser()` (sunucu-doğrulamalı) mı yoksa `getSession()` (JWT imzasını doğrulamayan) mı kullanıyor; `safeGetSession` gerçekten JWT doğruluyor mu.
- Cookie flag'leri (`httpOnly`/`secure`/`sameSite`) — `@supabase/ssr` varsayılanları prod'da doğru mu.
- **Turnstile**: `turnstile.ts` token'ı server'da gerçekten doğruluyor mu, yoksa sadece client'ta mı gösteriliyor; hangi endpoint'lerde zorunlu (kayıt? profile insert?).
- Anonim misafir → gerçek hesap geçişinde yetki sızıntısı.

### Alan 3 — Yetkilendirme / RLS  *(tek delik = tüm kullanıcı verisi)*
- 0001–0003 migration'larının doğruluğu: default-deny (`revoke all`) + kolon bazlı grant + `auth.uid()` politikaları. **İlk bakış: disiplinli.** Doğrulanacak köşeler:
  - `profiles_select_all` = tüm nickname'ler herkese açık (leaderboard kasıtlı) — PII sızıntısı yok mu (sadece nickname mi dönüyor).
  - `anon` rolü `saves`'e gerçekten yazamıyor mu (grant sadece `authenticated`'e — doğrula).
  - `saves.payload` jsonb: boyut limiti var mı (dev matrisi payload → DoS/storage abuse).
- Service-role kullanan yollar: `account/delete` (gate iyi), `profile` POST — service key ile mi yoksa `locals.supabase` ile mi (kural: yeni server client YARATMA).
- **Canlı DB lint:** Supabase MCP `get_advisors` (security) — gerçek prod şemasında RLS/exposed-table uyarıları.

### Alan 4 — API Proxy Sertleştirme  *(en gözden kaçan yüzey)*
- **SSRF / param injection:** `yahooSource`/`usStockSearch`/`seriesSource` kullanıcı sembol/query parametresini giden URL'e nasıl koyuyor — `encodeURIComponent` var mı, sembol allow-list'i var mı, yoksa ham mı ekliyor.
- **Açık proxy suistimali:** `/api/{yahoo,crypto,series,usSearch}` kimlik doğrulaması olmadan çağrılabiliyor → biri Vercel'i bedava veri proxy'si olarak kullanabilir (fatura + rate-limit riski). Rate limit / origin kontrolü var mı.
- Response validation: dış API cevabı doğrulanmadan client'a mı geçiyor.
- Hata sızıntısı: stack/iç detay client'a düşüyor mu (`console.error` iyi; `json` body'sine dikkat).
- `telemetry` POST: **kimliksiz yazım endpoint'i** — body boyut limiti, şema validasyonu, log injection, spam.

### Alan 5 — Veri Endpoint'leri
- `profile` POST: input validation (nickname regex DB constraint'te var — server katmanı da doğruluyor mu), mass-assignment, rate limit.
- `account/delete`: gate doğru (`if (!user) 401`, sadece kendi `user.id`). Doğrula: CSRF gerekli mi (POST + cookie).
- KVKK/PII: silme gerçekten cascade mi (FK `on delete cascade` var — doğrula), artık veri kalıyor mu.

### Alan 6 — Client / Web Güvenliği  *(vitrin = herkes DevTools açar)*
- `{@html}` kullanımı (grep) → XSS; kullanıcı-kontrollü veri render'ı.
- **Güvenlik başlıkları** — muhtemelen eksik: CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. `hooks.server.ts` `handle` içinde veya Vercel config'te eklenmeli.
- localStorage/offline save kurcalama: client save'i sunucuda `schema_version` ile doğrulanıyor mu, yoksa client-authoritative mi (para/skor manipülasyonu).
- Google OAuth redirect URI whitelist'i.

### Alan 7 — Tedarik Zinciri & Altyapı
- `npm audit` — bilinen CVE'ler.
- Bağımlılık sürümleri: `@supabase/ssr`, `@supabase/supabase-js`, `ws`, `adapter-vercel` güncel/güvenli mi.
- `.github/workflows/ci.yml`: secret'lar log'a sızıyor mu, `pull_request` tetikleyicisinde fork'tan secret erişimi.
- Supabase/Vercel proje ayarları: RLS zorunlu, e-posta onayı açık, service key rotasyonu.

## 5. Yürütme Modeli — Tek Odaklı Denetim Geçişi

Karar: Çok-ajanlı workflow **değil.** Yüzey (7 route + 3 migration + tek auth katmanı) tek context'e sığacak kadar küçük; paralel fan-out ve bulgu-başına ayrı doğrulama agent'ı bu boyutta değer katmaz — over-engineering olur. Bunun yerine **güçlü modelde tek, sıralı, odaklı denetim geçişi** — aynı 7 alan kapsamıyla.

```
DENETİM (tek geçiş, güçlü model, risk sırasıyla)
  Alan 1 → 2 → ... → 7
  her alan: kontrol listesini koş → bulguları topla (dosya:satır + senaryo + severity)
  bulgular anında gözden geçirilir (tek göz cross-cutting pattern'leri de yakalar)

RAPOR
  dedup + P0/P1/P2 önceliklendirme + tek launch-gate kararı + düzeltme sırası
```

**Neden çoklu değil:** (1) yüzey tek context'e sığıyor; (2) `get_advisors` RLS'i canlı DB'de zaten doğruluyor, ayrı verify agent'ı gereksiz; (3) tek göz "4 proxy'de aynı eksik-auth" gibi cross-cutting pattern'leri siloya bölünmüş agent'lardan daha iyi görür; (4) daha basit, ucuz, hızlı. Katmanlı model (Sonnet-find) o ağır workflow'un maliyet kırpması içindi; workflow düşünce tiering'e de gerek kalmadı.

**Araç kutusu:**
- Kaynak okuma + grep (SSRF, `{@html}`, secret pattern)
- `npm audit` (Bash)
- `git log -p` secret tarama
- Supabase MCP: `get_advisors` (security lint), `list_tables`, `list_migrations` — canlı şema
- (opsiyonel) Vercel MCP: proje/deploy config

## 6. Severity Kuralı

| Seviye | Tanım | Örnek |
|--------|-------|-------|
| **P0** | Lansmanı bloke eder; sömürülebilir + yüksek etki | Sızmış secret key, RLS bypass ile başka kullanıcının verisi, auth open-redirect ile hesap devralma, SSRF |
| **P1** | Lansman haftası; gerçek risk ama sınırlı/koşullu | Açık proxy rate-limit yok, güvenlik başlıkları eksik, kimliksiz telemetry spam |
| **P2** | Nice-to-have / derinlemesine savunma | Referrer-Policy inceliği, bağımlılık minor güncelleme, log verbosity |

## 7. Çıktı (Deliverable)

- **Rapor:** önceliklendirilmiş bulgu tablosu (P0→P2), her biri `dosya:satır` + senaryo + düzeltme.
- **Launch gate** kararı, tek cümle.
- **P0 düzeltmeleri:** uygulanmış + `npm run test`/`build` ile doğrulanmış.
- Rapor formatı: Markdown (bu spec'in yanına `2026-07-12-security-hardening-review-report.md`) veya istenirse Artifact.

## 8. Varsayımlar

- Canlı Supabase projesine MCP üzerinden okuma erişimi var (advisors/tables).
- Prod URL Vercel'de (memory: `reference_vercel_proje`).
- CLAUDE.md kanonları zemin; bir kontrol bir kanonla çelişirse planda açıkça işaretlenir.
- Düzeltme aşaması P0'larla sınırlı; P1/P2 kullanıcı onayıyla ayrı ele alınır.

## 9. Doğrulama (Verification)

- Her P0 düzeltmesi sonrası ilgili unit/e2e test + `npm run build`.
- Mümkünse `npm run e2e` (Docker + `npx supabase start` gerektirir — lokal ortam açıksa).
- `verification-before-completion`: "tamam" demeden önce `test` + `build` yeşil.
