# Pre-Launch Güvenlik Sertleştirme Denetimi — Rapor

**Tarih:** 2026-07-12
**Yöntem:** Tek odaklı geçiş (güçlü model), 7 alan risk sırasıyla. Kaynak + config + `npm audit` + git secret taraması + canlı Supabase security advisors.
**Re-check (2026-07-13):** Düşmanca ikinci geçiş — canlı prod header'ları `curl` ile doğrulandı, commit'lenmemiş diff + client layout tarandı. Net etki: **1 düzeltme** (HSTS aslında VAR, Vercel veriyor), **1 canlı teyit** (açık proxy auth'suz erişilebilir), **1 yeni P2** (hesap enumerasyonu).
**Kapsam:** `src/routes/api/*`, `src/routes/auth/*`, `src/lib/api/*`, `src/hooks.server.ts`, `supabase/migrations/*`, `supabase/config.toml`, CI, client.

---

## Launch Gate Kararı

> **HARD BLOCKER (P0) YOK.** Proje mimari olarak sağlam güvenlik duruşuna sahip: sır sızıntısı yok, RLS bypass yok, open-redirect yok, XSS yüzeyi (`{@html}`) yok, dahili-SSRF yok, auth `getUser()` ile sunucu-doğrulamalı.
>
> **Ancak** LinkedIn vitrinine / kamuya açılmadan önce **1 kümelik P1 sertleştirme** güçlü tavsiye edilir — özellikle görünürlük artınca (post → adversarial dikkat) bunlar "cost/DoS/görünüş" riskine döner. **Önerim: P1'leri kapat, sonra yayınla.**

---

## Neyi Doğru Yapmışsın (bunlar denetimden temiz geçti)

- **Sırlar:** `.gitignore` doğru (`.env*` hariç, yalnız `.env.example` placeholder izinli); git geçmişinde gerçek anahtar yok (pickaxe sadece placeholder/doküman); `SUPABASE_SECRET_KEY` yalnız `$env/static/private` üzerinden **server'da** ([account/delete/+server.ts:5](src/routes/api/account/delete/+server.ts)). SvelteKit private-env sızıntısında build fail eder.
- **Auth:** `hooks.server.ts` kimlik doğrulamada `getUser()` kullanıyor (JWT sunucuda doğrulanır), `getSession()` tek başına yetkide kullanılmıyor ([hooks.server.ts:26-38](src/hooks.server.ts)). OAuth `callback` ve e-posta `confirm` **sabit redirect** — open-redirect kapalı ([callback/+server.ts:10-12](src/routes/auth/callback/+server.ts), [confirm/+server.ts:12](src/routes/auth/confirm/+server.ts)).
- **RLS:** Default-deny (`revoke all`) + kolon bazlı grant + tüm politikalar `auth.uid()`'e scope'lu (0001–0003). Canlı DB advisors: **ERROR yok, eksik-RLS yok, exposed table yok.**
- **XSS:** Kaynakta `{@html}` **sıfır** — raw-HTML injection yüzeyi yok.
- **Veri endpoint'leri:** `profile` `locals.supabase` (kullanıcı JWT'si, RLS geçerli) + sunucu-tarafı nickname validasyonu ([profile/+server.ts:7-18](src/routes/api/profile/+server.ts)); `account/delete` yalnız kendi hesabını siler, secret key izole ([account/delete/+server.ts:11-21](src/routes/api/account/delete/+server.ts)).
- **usSearch proxy:** `encodeURIComponent` + exchange allow-list + `PLAIN_TICKER_RE` + `maxSize:50` cache — örnek sertleştirme ([usSearch/+server.ts:41-89](src/routes/api/usSearch/+server.ts)).

---

## P1 — Yayından Önce Kapat

### P1-1 · Güvenlik başlıkları eksik (HSTS hariç)
**Dosya:** yok (hiçbir yerde set edilmiyor — `hooks.server.ts` `handle`'a eklenmeli)
**Canlı doğrulama (2026-07-13):** `curl -I https://miras-one.vercel.app` (kök + `/api/crypto`) → **`Strict-Transport-Security` VAR** (Vercel otomatik: `max-age=63072000; includeSubDomains; preload` — güçlü). Ama `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` **yok**.
**Senaryo:** CSP yok → herhangi bir XSS (bugün yüzey yok ama derinlemesine savunma) sınırsız çalışır; `X-Frame-Options`/`frame-ancestors` yok → oyun iframe'lenip clickjack edilebilir; `nosniff` yok → MIME-sniffing.
**Etki:** Clickjacking + eksik derinlemesine savunma. Vitrin izleyicisi (mühendis) ilk bakacağı şeylerden.
**Düzeltme:** `hooks.server.ts` `handle`'da response header'ları ekle: `Content-Security-Policy` (`frame-ancestors 'none'` dahil), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. **HSTS'i Vercel zaten veriyor** — tekrar ekleme. Turnstile için `script-src`/`frame-src`'a `challenges.cloudflare.com` (kod notu SP3b'de zaten planlanmış).

### P1-2 · Açık proxy amplifikasyonu (yahoo + crypto)
**Dosya:** [yahoo/+server.ts:20-30](src/routes/api/yahoo/+server.ts) + [yahooSource.ts:75-99](src/lib/api/yahooSource.ts); [crypto/+server.ts:17-26](src/routes/api/crypto/+server.ts) + [cryptoSource.ts:45-51](src/lib/api/cryptoSource.ts)
**Senaryo:** `?bist=`/`?us=`/`?coins=` kimlik doğrulaması olmadan, cache'i bypass ederek, **sınırsız sembol listesi** kabul ediyor. `GET /api/yahoo?us=A,A,A,…(5000)` → sunucu `Promise.all` ile 5000 upstream Yahoo isteği açar. Tek gelen istek → N giden istek (amplifikasyon).
**Etki:** Vercel serverless compute maliyeti + Yahoo/Binance'in sunucu IP'ni rate-limit/ban etmesi (oyunu herkes için kırar). DoS + fatura.
**Düzeltme:** Liste uzunluğuna sert sınır (ör. ≤20 sembol), tercihen bilinen sembol allow-list'i (`usSearch`'teki gibi), ve özel-sembol dalını da cache'le veya kısa rate-limit.

### P1-3 · `series` cache Map'i sınırsız büyüyor
**Dosya:** [series/+server.ts:13-27](src/routes/api/series/+server.ts)
**Senaryo:** `caches` Map'i `source:symbol:period` anahtarıyla dolduruluyor; `symbol` doğrulanmadan (yalnız `.trim()`) alınıyor, eviction yok. `?symbol=<rastgele>` ile farklı farklı çağrı → Map sonsuz büyür.
**Etki:** Bellek tükenmesi (memory-DoS), serverless instance şişer.
**Düzeltme:** `usSearch`'teki `createKeyedTtlCache({ maxSize })` desenine geçir; `symbol`'ü bilinen varlık kataloğuna karşı doğrula.

### P1-4 · Prod'da captcha (Turnstile) gerçekten zorunlu mu? — DOĞRULA
**Dosya:** [config.toml:214-217](supabase/config.toml) (lokal'de `[auth.captcha]` **yorum satırı**), [authBootstrap.ts:19-21](src/lib/api/authBootstrap.ts) (kod her zaman token gönderiyor)
**Senaryo:** Kod anon girişe captcha token ekliyor ama Supabase **prod dashboard'ında** captcha kapalıysa token yok sayılır → anon-hesap spam koruması tiyatro olur (rate-limit dışında engel yok).
**Etki:** Bot ile kitlesel anon hesap/save oluşturma → DB satır/depolama şişmesi (free-tier limit).
**Düzeltme:** Supabase dashboard → Auth → Captcha: Turnstile enabled + secret set olduğunu **doğrula**. (Kod tarafı hazır.)

---

## P2 — Lansman Haftası / Derinlemesine Savunma

| # | Bulgu | Dosya | Not |
|---|-------|-------|-----|
| P2-1 | `telemetry` kimliksiz + rate-limit yok + `playerId` sınırsız string → Discord webhook / log içine enjekte edilir (`@everyone`, markdown, newline) | [telemetry/+server.ts:30-48](src/routes/api/telemetry/+server.ts) | `playerId` uzunluk sınırı + sanitize; hafif rate-limit. Webhook set değilse etki düşük. |
| P2-2 | Zayıf parola politikası: min 6, karmaşıklık yok | [config.toml:182,185](supabase/config.toml) | Prod'da min 8 + `letters_digits`. |
| P2-3 | E-posta doğrulaması kapalı (`enable_confirmations=false`) → doğrulanmamış e-posta ile kayıt | [config.toml:227](supabase/config.toml) | **Kasıtlı** (E2E testine bağlı). Oyun için kabul; dokümante edildi. |
| P2-4 | `npm audit`: 10 açık (1 critical) | vite/esbuild/vitest zinciri | **Yalnız devDependencies** — prod runtime'a gitmez. `audit fix --force` major-breaking; opsiyonel. |
| P2-5 | Canlı advisors: 2× anonim-erişim WARN (`profiles`, `saves`) | 0001–0003 | **Kasıtlı** — misafir-oyun gereği, `auth.uid()` scope'lu. Kabul, gerekçe kayıtlı. |
| P2-6 | `profiles_select_all` = tüm nickname'ler oturumsuz okunabilir | [0001_identity.sql:41-42](supabase/migrations/0001_identity.sql) | Leaderboard için kasıtlı; nickname dışında PII yok. Kabul. |
| P2-7 | Proxy sembollerinde `encodeURIComponent` yok (yahoo/crypto/series) | yahooSource/cryptoSource/seriesSource | Host sabit (SSRF yok); yalnız upstream'e ekstra query param sızabilir. Düşük; eklemek temizlik. |
| P2-8 | Hesap enumerasyonu: kayıt hatasında `email_exists`/`user_already_exists` → "Bu e-posta zaten kayıtlı" mevcudiyeti ifşa eder | [authErrors.ts:7-9](src/lib/api/authErrors.ts) | Dosyanın kendi yorumu "kayıtlı e-posta SIZDIRILMAZ" diyor ama bu mesaj çelişiyor. UX↔güvenlik ödünleşimi; ya bilinçli kabul et (yorumu düzelt) ya jenerikleştir. |

---

## Prod'da Doğrulanacaklar (dashboard/config — kod dışı)

1. **Captcha (Turnstile) enabled + secret** — P1-4.
2. **Şifre kurtarma e-posta şablonu** `/auth/confirm?token_hash=…&type=recovery`'ye işaret ediyor mu (Task 14 — kod yolu **doğru**, risk şablon/redirect-URL config'inde).
3. **Redirect URL allow-list** prod domain'i içeriyor mu (Supabase Auth → URL Configuration).
4. **Cookie `SameSite`/`Secure`** prod'da (CSRF savunması buna dayanıyor — POST endpoint'leri için).

---

## Önerilen Düzeltme Sırası

1. **P1-1 güvenlik başlıkları** (tek dosya, `hooks.server.ts`, en yüksek görünür getiri).
2. **P1-2 + P1-3 proxy sınırları** (liste cap + keyed cache — aynı oturumda).
3. **P1-4 captcha doğrulama** (dashboard, 2 dk).
4. P2'ler kullanıcı onayıyla, ayrı.

**Doğrulama:** Her düzeltme sonrası `npm run test` + `npm run build`; header/proxy değişiklikleri için dev preview'da davranış kontrolü.
