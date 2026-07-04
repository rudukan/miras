# Çok Kullanıcılı Yayın (Multiplayer Launch) — Tasarım

**Tarih:** 2026-07-04
**Durum:** Kullanıcı incelemesi bekliyor
**Kapsam:** Miras Oyunu'nu hesap açılabilen, kendi domaininde yayınlanan, haftalık ligli gerçek bir oyuna dönüştürmek.

---

## 1. Amaç

Bugün oyun tamamen client-side: kayıt yalnız localStorage'da, hesap yok, deploy miras-one.vercel.app. Hedef: Google + misafir girişli hesaplar, buluta kayıt senkronu, haftalık skor ligi, kendi domaini, KVKK uyumu ve "olabilecek en güvenli" altyapı duruşu. Oyun motoru client'ta kalır; backend yalnız **kimlik + kalıcılık + lig** ekler.

## 2. Verilen Kararlar (özet)

| Konu | Karar |
|---|---|
| Çok kullanıcılılık modeli | Skor yarışı — herkes kendi oyununu oynar; realtime etkileşim YOK |
| Rekabet birimi | Haftalık lig; **CANLI SEANS = lig** (tek oyun, ayrı slot yok) |
| Hafta döngüsü | Pazartesi 00:00 TSİ herkes $1M; Cuma 18:15 (BIST kapanışı sonrası) skor kilidi; hafta sonu antrenman (skor sayılmaz) |
| Giriş | Google OAuth + anonim misafir; kayıt duvarı yalnız "lige katıl" anında |
| Hile koruması | Orta: işlem log'u + **sunucu damgalı fiyat** + hafta kapanışında replay |
| Backend | Supabase (Auth + Postgres + RLS) + Vercel (hosting, API proxy'ler, cron) |
| Launch içeriği | Amerikan Borsası (`.claude/plans/amerikan-borsasi.md`) + paylaşım kartı; emlak kapalı kalır |
| Domain | İsim henüz yok — aday çalışması + müsaitlik kontrolü yapılacak |
| Monetization | Launch'ta YOK (bilinçli erteleme) |

## 3. Mimari

```
Tarayıcı (SvelteKit — mevcut oyun aynen)
 ├─ Supabase JS (@supabase/ssr) → Auth, profil, save senkronu, lig okuma
 └─ Vercel /api/*
     ├─ /api/yahoo, /api/crypto, /api/series (değişmez; + CDN cache başlıkları)
     └─ /api/trade (YENİ) → lig işlemini sunucu fiyatıyla damgalar, Postgres'e yazar

Supabase Postgres (+ Auth + RLS)
 └─ profiles, saves, leagues, league_entries, trades

Vercel Cron (Pro)
 ├─ Pazartesi 00:00 TSİ → yeni lig satırı
 └─ Cuma 18:15 TSİ → replay + kapanış değerlemesi → skor/rank mühürlenir
     (B planı: Supabase pg_cron — dakika hassasiyetli, ücretsiz)
```

**Kilit prensipler:**
- Oyun motoru (`src/lib/domain/`, `liveGameStore`) değişmez; backend üstüne eklenir.
- Client'ın beyan ettiği hiçbir fiyata güvenilmez: `/api/trade` fiyatı kendi proxy cache'inden damgalar. Skor = $1M → damgalı fiyatlarla işlem replay'i → kapanış fiyatıyla değerleme. Ayrı fiyat geçmişi tablosu gerekmez.
- Lig işlemi offline yapılamaz (damga şart); oyunun kendisi Supabase erişilemese bile localStorage ile oynanmaya devam eder (mevcut dayanıklılık korunur).

## 4. Veri Modeli

- `profiles` — id (auth uid), benzersiz takma ad (uzunluk/karakter kuralı + küfür filtresi), created_at. E-posta/isim/avatar **saklanmaz** (veri minimizasyonu; e-posta auth şemasında kalır).
- `saves` — user_id, payload (jsonb), **schema_version** (save formatı değişince migration bununla), updated_at.
- `leagues` — week_start, week_end, status (open/closed).
- `league_entries` — league_id + user_id, final_score ve rank kapanışta yazılır.
- `trades` — league_id, user_id, varlık, yön, adet, **server_price, server_ts**; insert-only.

### Yetkilendirme matrisi (GRANT + RLS — iki ayrı katman)

| Tablo | `anon` (oturumsuz) | `authenticated` (misafir + Google) | `service_role` |
|---|---|---|---|
| `profiles` | SELECT (leaderboard/paylaşım linki ziyaretçisi) | SELECT herkes; INSERT/UPDATE yalnız kendi satırı | tam |
| `saves` | REVOKE ALL | yalnız kendi satırı (RLS) | tam |
| `leagues` | SELECT | SELECT | tam |
| `league_entries` | SELECT | SELECT herkes; INSERT yalnız kendisi **VE** `(auth.jwt()->>'is_anonymous')::boolean = false` | tam |
| `trades` | REVOKE ALL | SELECT yalnız kendi satırları; INSERT/UPDATE/DELETE **REVOKE** | tam |

- Duruş: **varsayılan ret, açık izin** — şema default privilege'leri kısılır, tablo tablo grant verilir.
- Anonim tuzak: Supabase'de misafir oturum da `authenticated` rolündedir → "lige yalnız kayıtlı hesap" kuralı UI'da değil RLS'te zorlanır.
- `trades` çift kilit: policy'siz RLS (deny) + açık REVOKE — kazayla policy eklenmesine karşı iki katman.
- View gerekirse `security_invoker`; `SECURITY DEFINER` fonksiyon kullanılmaz (zorunluysa boş `search_path`).
- Her migration sonrası Supabase güvenlik lint'i (`get_advisors`) koşulur.

## 5. Akışlar

**Misafir → hesap:** İlk açılışta sessiz anonim oturum; localStorage kaydı buluta taşınır. "Lige katıl" anında Google `linkIdentity` → **aynı user id, ilerleme kaybolmaz**.

**Save senkronu:** localStorage birincil (offline dayanıklılık). Arkada ~30 sn debounce + sayfa kapanışında buluta yazım. Girişte bulut/yerel `updated_at` karşılaştırılır, yeni olan kazanır. `schema_version` ile ileri migration.

**Hafta döngüsü:** Cron pazartesi ligi açar. İşlemler hafta boyu `/api/trade`'den damgalanır (JWT doğrulama `getUser()` ile, girdi şema validasyonu: katalog dışı sembol / negatif-absürt adet ret, idempotency anahtarı, kullanıcı başına rate limit). Cuma 18:15 kapanış cron'u (CRON_SECRET korumalı): replay deterministik ve yan etkisiz → başarısızlıkta güvenle tekrar denenir. Kapanışta paylaşım kartı verisi hazırlanır.

## 6. Güvenlik ("olabilecek en güvenli" duruşu)

### Tehdit modeli

| Varlık | Tehdit | Ana önlem |
|---|---|---|
| Kullanıcı verisi | sızıntı, KVKK ihlali | veri minimizasyonu + matris + httpOnly cookie |
| Lig bütünlüğü | hile, sahte skor | sunucu damgalı fiyat + replay |
| Altyapı hesapları | Supabase/Vercel/GitHub/registrar ele geçirme | 2FA + registrar lock (**asıl kale**) |
| Service key | sızarsa RLS devre dışı | yalnız Vercel server env; yeni publishable/secret key modeli |
| Fatura/kaynak | anonim hesap spam'i, API flood | Turnstile + rate limit |

### Katmanlar
- **Oturum:** `@supabase/ssr` ile httpOnly cookie + PKCE; token'a JS dokunamaz. Sunucuda kimlik **daima `getUser()`** (`getSession()` sunucuda imza doğrulamaz).
- **Kötüye kullanım:** Anonim girişe Cloudflare Turnstile (görünmez mod). 30 gün hareketsiz anonim hesaplar periyodik temizlenir.
- **Tarayıcı:** SvelteKit hooks'ta CSP, HSTS, frame-ancestors none, Referrer-Policy, Permissions-Policy. `{@html}` yasak.
- **Hesaplar:** Supabase/Vercel/GitHub/registrar'da 2FA; registrar transfer kilidi + WHOIS gizliliği; **DMARC p=reject** + SPF/DKIM (mail göndermesek bile spoofing'e karşı).
- **Tedarik zinciri:** `npm audit` CI'da + Dependabot. Sentry'de PII scrubbing açık.
- **Google-only bonus:** şifre veritabanı yok → sıfır şifre saldırı yüzeyi, SMTP bağımlılığı yok.
- **Yedek:** Supabase Pro günlük yedek (7 gün). PITR v1'de yok (kullanıcı parası tutulmuyor); büyüyünce eklenir.

## 7. KVKK ve Hukuk

- **Yurt dışı aktarım:** Supabase'in TR region'ı yok (en yakın Frankfurt) → aydınlatma metninde beyan + açık rıza akışı **zorunlu**.
- Metin seti: aydınlatma metni, çerez politikası, kullanım şartları, "eğlence amaçlıdır — yatırım tavsiyesi değildir" uyarısı. Taslaklar legal-consultant agent'tan; **yayın öncesi insan onayı şart** (bu tasarım hukuki danışmanlık değildir).
- KVKK hakları UI'da: **hesap silme** (cascade + auth kullanıcısı dahil) ve veri indirme.
- VERBİS muafiyeti insan tarafından doğrulanacak (muhtemelen muaf, teyit gerek).
- Google OAuth consent ekranı gizlilik politikası URL'si ister → **domain + gizlilik sayfası, Google girişinin prod'a alınmasından önce hazır olmalı** (yalnız e-posta/profil scope → Google incelemesi gerekmez).

## 8. Maliyet ve Operasyon

| Kalem | Ne zaman | Tutar |
|---|---|---|
| Supabase Pro | SP1 başlamadan (**ön koşul** — free slot yok) | $25/ay |
| Vercel Pro | launch'ta (ticari kullanım ToS + cron hassasiyeti) | $20/ay |
| Domain | isim seçilince | ~$12-15/yıl |
| Sentry + Turnstile + analytics | — | free tier |

- **Kısıt (2026-07-04):** Kullanıcının Supabase free slotları dolu; Pro satın alımı "yakında". SP1/SP2 buna bloke; SP0 ve SP3'ün Supabase'siz kısımları beklemez.
- `/api/yahoo`'ya CDN cache (`s-maxage` + `stale-while-revalidate`) — bin oyuncuda invocation faturasını patlatmayacak tek ayar.
- Destek kanalı (varsayılan): ayarlarda mailto + X hesabı. Analytics: hafif, çerezsiz bir araç (ör. Vercel Analytics) — çerez politikasını sadeleştirir.

## 9. Test Stratejisi

- Mevcut domain testleri değişmez.
- YENİ — replay hesaplayıcısı unit testleri (aynı TS domain kodu sunucuda koşar).
- YENİ — RLS/GRANT policy testleri (anon/authenticated/misafir rolleriyle erişim denemeleri).
- E2E kritik yol: misafir oyna → Google bağla → lige katıl → işlem → sahte kapanış → leaderboard'da gör.
- `verification-before-completion`: her alt projede test + check + build.

## 10. Alt Projeler ve Sıra

| # | İş | Bağımlılık |
|---|---|---|
| SP0 | Amerikan Borsası (hazır plan: `.claude/plans/amerikan-borsasi.md`) | yok — **hemen başlanabilir** |
| SP3a | Domain isim adayları + müsaitlik + satın alma; KVKK/hukuk taslakları | yok — SP0 ile paralel |
| SP1 | Hesap altyapısı: Supabase kurulum, Google+misafir auth, profil/takma ad, save senkronu | **Supabase Pro** + SP3a (consent ekranı için domain+gizlilik sayfası) |
| SP2 | Haftalık lig: `/api/trade`, hafta döngüsü, kapanış cron'u, leaderboard UI, ad filtresi | SP1 |
| SP3b | Yayın cilası: paylaşım kartı, landing/OG, Sentry+analytics, güvenlik başlıkları, CDN cache | SP2 ile paralel |

**Launch kriteri:** SP0-SP3 tamam + E2E yeşil + mobil tarayıcı kontrolü + 1 hafta kendi kullanımın.

## 11. Kapsam Dışı (v1'de bilinçli YOK)

Gerçek zamanlı etkileşim/sosyal katman (arkadaş, chat), monetization, mobil uygulama, emlak (kod duruyor, kapalı), VASİYET/2001/2018 modları, tam sunucu otoritesi, PITR, e-posta+şifre girişi.

## 12. Açık Konular

1. Domain ismi (SP3a'da aday listesi + müsaitlik kontrolü ile karara bağlanacak).
2. Supabase Pro satın alma tarihi ("yakında" — SP1'in tetiği).
3. KVKK metinlerinin insan onayı (yayın öncesi).
4. Takma ad küfür filtresi kaynağı (basit TR+EN kelime listesi ile başlanır, şikayet butonuyla desteklenir).
