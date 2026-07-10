# SP1.5 — Giriş & Reset — Tasarım (Design Spec)

**Tarih:** 2026-07-09 (tasarım), 2026-07-10 (açık avı + e-posta genişletmesi)
**Durum:** kullanıcı incelemesi bekliyor → writing-plans
**Uygulama:** Sonnet oturumlarında, TDD (muhtemelen 2 oturum, §8 ara-kapı).

## 1. Amaç ve Kapsam

SP1 hesap altyapısını prod'a aldı ama boşluklar bıraktı; SP1.5 bunları kapatır:

1. **Giriş yolu yok.** Yeni cihazda eski hesaba dönüş imkânsız (`AccountPanel.svelte:44`
   yalnız `linkIdentity`). Karşılama ekranı + Google girişi + **e-posta/şifre kaydı-girişi** gelir.
2. **OAuth dönüşü ham.** `redirectTo: location.origin` → `/?code=...` client takası boot ile
   yarışır. Sunucu tarafı `/auth/callback` + e-posta linkleri için `/auth/confirm` gelir.
3. **Reset bulutu bilmiyor.** "Sıfırla ve yeni oyun" yalnız local siler; senkronlu ikinci cihaz
   eski oyunu geri push edebilir (hortlama). Reset her yerde geçerli olur.
4. **Silme kalıntısı (KVKK).** `miras.playerId`/`touchedAt`/`cardSeen`/`lastVisitPing` hesap
   silmede kalıyor. Temizlenir.
5. **Açık avında bulunanlar (2026-07-10):** oturum-kaybı çıkmazı, hidrasyon/BAŞLA yarışı,
   bayat-sekme zombi kaydı, ownerId damgalama yarışı — hepsi bu dilimde kapatılır (§4).

**Kapsam eki** (SP1 final review minor'ları): yanıltıcı "silinemedi" mesajı; boot
saves-sorgusunun kendi try/catch'i.

**Kapsam dışı:** landing/OG (SP3b), haftalık lig (SP2), yeni yatırım aracı,
**misafir→e-posta yükseltme** (iki adımlı `updateUser` akışı hantal; misafirin yükseltme yolu
Google olarak kalır — ileride ayrı küçük dilim).

## 2. Kullanıcı Kararları (K1-K8, sabit)

- **K1 — Tam karşılama ekranı** (oturum yokken): GOOGLE İLE GİRİŞ + E-POSTA + MİSAFİR.
  Anon oturum sayfa açılışında otomatik DEĞİL; misafir butonuyla açılır.
- **K2 — Reset her yerde geçerli:** bulut kaydı silinir + jenerasyon kuralı + tombstone.
- **K3 — Silmede kimlik anahtarları silinir** (playerId dahil; `resetAt` HARİÇ — §4.G).
  Oyun reset'inde playerId KALIR.
- **K4 — Mimari:** karşılama `+page.svelte` içinde faz; callback takası sunucuda.
- **K5 — Yabancı-local çatışmasında bulut sessizce kazanır** (seçim ekranı yok).
- **K6 — ÇIKIŞ YAP dahil** (yalnız kalıcı hesaba görünür — §4.H).
- **K7 — E-posta+şifre girişi SP1.5 kapsamında** (2026-07-10; Google + misafire ek üçüncü yol).
- **K8 — E-posta doğrulaması GEÇİCİ KAPALI başlar** (yerleşik Supabase maili üretim için
  değil; custom SMTP domain ister, domain SP3a'da). Domain+SMTP gelince doğrulama toggle'la
  açılır — UI "mail gönderildi" durumunu şimdiden içerir, geçiş kilitlenmez. Risk belgelenir
  (§7): başkasının e-postasıyla kayıt olunabilir; gerçek sahip şifre sıfırlamayla geri alır.

## 3. Doğrulanmış Kod Gerçekleri (tasarımın zemini)

- `GameState.playerId` oyuna kuruluşta gömülür (`gameState.ts:40`); `createGameState`
  playerId'yi yalnız **yeni oyunda** ister → kimlik üretimi oyuna-giriş anına ertelenebilir.
- `@supabase/ssr` `createBrowserClient` (`+layout.ts`) PKCE code-verifier'ı **cookie'de** tutar;
  server client cookie okur → `exchangeCodeForSession`/`verifyOtp` sunucuda çalışır. Takaslar
  **`locals.supabase`** ile yapılır (ws-transport'lu) → Vercel WebSocket sorunu doğmaz.
- Misafir `signInAnonymously` → `SIGNED_IN` eventi → `+layout.svelte` INITIAL_SESSION filtresi
  döngü yaratmaz. OAuth/e-posta linki dönüşleri tam-sayfa 303-reload.
- `getTurnstileToken` her çağrıda taze widget render eder → buton-tetikli akışlar bayatlamaz.
  Captcha koruması auth-geneli açık → `signUp`/`signInWithPassword`/`resetPasswordForEmail`
  de `captchaToken` ister.
- Migration 0001/0002'de `saves` için DELETE grant/policy YOK → migration 0003 gerekir.
- `+layout.server.ts` yok; session SSR data'da değil (bilinçli sadeleştirme, değişmiyor).
- `user.is_anonymous` alanı anon-destekli supabase-js sürümlerinde mevcut (plan doğrular).
- Oturumsuz durumda `cloudPush` zaten no-op (getUser null → push yok).

## 4. Tasarım

### 4.A Fazlar ve initialPhase
Faz: `'boot' | 'welcome' | 'intro' | 'playing'`.
- `initial = loadGame(localStorage)` senkron. **`initial` varsa → `intro`** (anında, flash yok).
- `initial` yoksa → `boot` ("[ MİRAS — CANLI ÇEKİRDEK ]" başlığı + "BAĞLANIYOR…" satırı);
  `onMount`'ta `getSession()`:
  - **Oturum yok → `welcome`.**
  - **Oturum var → `boot`'ta KAL, bulut hidrasyon sorgusu bitene kadar bekle** (açık #2 fix):
    kayıt geldiyse hydrate+reload → `intro` (DEVAM ET); kayıt yok/sorgu hatası/timeout (~5s) →
    `intro` (BAŞLA, fail-safe — kalıntı risk §7).
  - Bu bekleme, "hidrasyon dönmeden BAŞLA'ya basıp yeni jenerasyonla gerçek bulut oyununu ezme"
    veri kaybını (bugünkü kodda da var olan deliği) ve BAŞLA→DEVAM flash'ını kapatır.
- `onMount`'taki otomatik `ensureSession` KALDIRILIR (K1).
- `initialPhase(session, initial)` saf fonksiyon (test edilebilir).
- Açılışta (fazdan bağımsız) `?auth_error=1` görülürse Toast + `replaceState` ile URL temizliği.

### 4.B WelcomeScreen.svelte (yeni component)
`term.*` renkleri, `font-mono`, Türkçe UI; dikey buton yığını (genişlemeye açık):
1. **GOOGLE İLE GİRİŞ** → `signInWithOAuth({provider:'google',
   options:{redirectTo: origin+'/auth/callback'}})`.
2. **E-POSTA İLE GİRİŞ / KAYIT** → alt görünüm (§4.J).
3. **MİSAFİR OLARAK OYNA** → `getTurnstileToken` → `ensureSession` → oyuna giriş (§4.F).
   Altında mikro-metin: "Yeni bulut kimliği oluşturur".
   Hata → toast + **"yine de çevrimdışı oyna"** fallback (auth oyunu asla bloke etmez;
   çevrimdışı başlayanın sonradan bağlanma yolu §4.K).
Props: callback'ler (onGoogle, onEmail…, onGuest, onOfflineContinue) + durum. Component ~200
satırı aşarsa e-posta alt görünümü ayrı dosyaya çıkarılır (CLAUDE.md kuralı).

### 4.C /auth/callback/+server.ts (yeni, GET — OAuth/PKCE)
- `?code` → `locals.supabase.auth.exchangeCodeForSession(code)` → 303 `/`.
- `?error` ya da takas hatası → 303 `/?auth_error=1`.
- `AccountPanel.linkIdentity` redirect'i de `/auth/callback` olur.

### 4.D chooseSource v2 + ownerId (cloudSave.ts)
Girdi: `{localTouchedAt, localCreatedAt, cloudUpdatedAt, cloudCreatedAt, resetAt,
localOwnerId, sessionUserId}`. Karar sırası:
1. **Yabancı local** (`localOwnerId` ≠ `sessionUserId`, ikisi de doluyken):
   - tombstone'lanmamış bulut VARSA → `cloud` (K5);
   - bulut YOKSA → local **benimsenir** (`adopt`: ownerId oturum kullanıcısına damgalanır,
     oyun onun kasasına akmaya başlar — paylaşılan cihazda sahipsiz kalmış oyun devralınır).
2. `cloudCreatedAt <= resetAt` → bulut tombstone'lu, diskalifiye.
3. İkisi de yoksa `none`; tek varsa o.
4. Jenerasyonlar farklıysa büyük `createdAt` kazanır.
5. Aynı jenerasyonda `cloudUpdatedAt > localTouchedAt` → `cloud`, değilse `local`.
- Local envelope yoksa `localTouchedAt` yok sayılır.
- **ownerId damgalama YALNIZ benimseme anlarında** (açık #4 fix): yeni oyun kuruluşu, bulut
  hidrasyonu, kural-1b adoption. `onPersist` damgayı DEĞİŞTİRMEZ (yalnız mevcut damgayı korur);
  körlemesine yeniden damgalama, yabancı defteri ilk persist'te "benim" yapardı.
- **cloudPush kapısı:** boot uzlaşması (chooseSource kararı) tamamlanana kadar push devre dışı
  (`enable()` benzeri kapı); ayrıca ownerId ≠ oturum user.id olan envelope push edilmez.

### 4.E Reset v2 (handleResetSave) + persist tombstone guard'ı
Sıra: `cloudPush.cancel()` (yeni metod — bekleyen debounce/flush iptali) →
`markPendingWipe(session)` → `clearSave(local)` → `touchedAt`+`cloudHydrated`+`ownerId` sil +
`miras.resetAt = Date.now()` → best-effort `await saves.delete().eq('user_id', user.id)`
(hata yutulur) → `location.reload()`.
- **onPersist tombstone guard'ı (açık #3 fix):** `game.createdAt <= resetAt` olan envelope
  localStorage'a YAZILMAZ ve push edilmez. `pendingWipe` tek-atımlık; canlı ikinci sekme her
  saniye persist ederek zombi kayıt üretebiliyordu — guard bayat sekmenin kalemini kırar.
- Çevrimdışı reset: DELETE başarısız olsa da tombstone bu cihazı korur; yeni oyun başlayınca
  jenerasyon kuralı diğer cihazları yakınsar (§7 sınırlama).

### 4.F Kimlik/telemetri ertelemesi
- `getOrCreatePlayerId` + `pingDailyVisit` component init'ten çıkar; yalnız **oyuna-giriş
  anında** çalışır (intro'dan BAŞLA/DEVAM, welcome'dan misafir/e-posta/Google dönüşü/çevrimdışı).
- Yeni oyun kuruluşu da bu ana ertelenir (playerId doğru gömülür; store'un playerId'yi yalnız
  fresh-game'de tükettiği doğrulandı — `liveGameStore.svelte.ts:156,169`).
- Sonuç: welcome'da bekleyen/hesabını silmiş kullanıcı için UUID basılmaz, telemetri gitmez.
- **Not (SP3b funnel):** 'visit' pingi artık sayfa-açılışı değil oyuna-giriş sayar — D1/D7
  metriklerinde hafif undercount, bilinçli.

### 4.G Hesap silme v2 (AccountPanel)
- POST `/api/account/delete` başarılı → `signOut` + `clearSave` + `clearLocalIdentity`
  (playerId, touchedAt, cardSeen, lastVisitPing, ownerId) + `cloudHydrated` sil +
  **`miras.resetAt = Date.now()` SET edilir** (silme de bir reset'tir; zombi-sekme guard'ı
  burada da gerekli — `resetAt` kişisel veri değil, salt zaman damgası) + `markPendingWipe` +
  reload → welcome.
- POST-sonrası adım patlarsa "silinemedi" DENMEZ (yalnız POST hatasında gösterilir).
- `clearLocalIdentity` yeni helper (savegame.ts) — anahtar listesi tek yerde.

### 4.H ÇIKIŞ YAP + hesap-geçiş akışı
- ÇIKIŞ YAP **yalnız `!user.is_anonymous`** iken görünür (Google VEYA e-posta = kalıcı hesap;
  misafire asla — anon signOut geri dönüşsüz oyun kaybı olurdu).
- Çift-tık onay + mikro-metin: "Kaydın bulutta — tekrar girince kaldığın yerden".
- Akış: `cloudPush.flush()` → **flush/signOut başarısı beklenir; çevrimdışıysa uyarı gösterilir
  ve devam edilmez** (açık #6 fix — son ilerleme buluta gitmeden local silinmez) → `signOut` →
  `clearSave` + touchedAt/cloudHydrated/ownerId sil (playerId KALIR) → reload → welcome.
- **`identity_already_exists` geçiş akışı (açık #5 fix):** misafir, başka hesaba bağlı
  Google'ı bağlamaya çalışırsa özel mesaj + tek-tuş buton: **"Misafir oyununu bırak ve Google
  hesabına geç"** — çift-tık onaylı; `signOut` + `clearSave` + touchedAt/cloudHydrated/ownerId
  silme DAHİL (yoksa kullanıcı local-kayıt-var+oturum-yok çıkmazına düşer) → welcome → GİRİŞ.

### 4.I Migration 0003 (0003_saves_delete.sql)
```sql
grant delete on table public.saves to authenticated;
create policy saves_delete_own on public.saves
  for delete to authenticated using (user_id = auth.uid());
```
RLS `using (user_id = auth.uid())` başkasının satırını silmeyi engeller.

### 4.J E-posta + Şifre (K7)
**Welcome alt görünümü** (durumlar: `signin | signup | forgot | sent`):
- **Kayıt:** e-posta + şifre (min 8) → `signUp({email, password, options:{captchaToken}})`.
  - Doğrulama KAPALIyken (K8 başlangıç): direkt oturum → oyuna giriş.
  - Doğrulama AÇIKken (SP3a sonrası): `sent` durumu — "Doğrulama maili gönderildi — zaten
    kayıtlıysan GİRİŞ yap" (enumerasyon-nötr metin; Supabase kayıtlı e-postayı ele vermez).
- **Giriş:** `signInWithPassword({email, password, options:{captchaToken}})` → intro + bulut
  hidrasyonu (mevcut mekanizma; e-posta kullanıcısı sadece bir `user.id`).
- **Şifremi unuttum:** `resetPasswordForEmail(email, {captchaToken})` → `sent` durumu
  (yerleşik mail, best-effort — K8). Linkin hedefi mail ŞABLONUNDA tanımlanır
  (`/auth/confirm?token_hash=...&type=recovery` kalıbı — aşağıdaki ayarlar paragrafı).
- Tüm submit'ler taze Turnstile token'ı alır; hata mesajları Türkçe ve enumerasyon-nötr.

**`/auth/confirm/+server.ts` (yeni, GET — e-posta linkleri):** `token_hash` + `type` →
`locals.supabase.auth.verifyOtp({type, token_hash})` → başarıda: `type==='recovery'` →
303 `/?pw_reset=1` (şifre-yenile görünümü açılır), diğerleri → 303 `/`; hata → `/?auth_error=1`.

**Şifre yenile görünümü:** `?pw_reset=1` + aktif oturum → mini panel "YENİ ŞİFRE BELİRLE" →
`updateUser({password})` → toast + normal akış. (Rota değil, +page durumu — K4 ile tutarlı.)

**Supabase ayarları (Task-0 tipi el işi, kullanıcı):** Email provider ayarları — Confirm email
KAPALI (K8), şifre min 8, **leaked password protection AÇIK** (Pro'da mevcut), e-posta şablonları
Türkçe + `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...` kalıbına çevrilir,
auth rate limitleri gözden geçirilir.

**Davranış notu:** Google'la girmiş kullanıcı "şifremi unuttum" derse Supabase aynı hesaba şifre
ekletir (hesap iki yöntemle de açılır olur) — engellenmez, belgelenir.

### 4.K Oturumsuz AccountPanel durumu (açık #1 fix)
`user == null` artık kalıcı bir durum olabilir (çerez silinmiş eski misafir; "yine de çevrimdışı
oyna" yolu). Mevcut sonsuz "Oturum açılıyor…" yerine panel şunu gösterir:
> "Oturum yok — kayıt yalnız bu cihazda." + **GOOGLE İLE GİRİŞ** + **E-POSTA İLE GİRİŞ** +
> **MİSAFİR OTURUMU AÇ** (mikro-metin: "yeni bulut kimliği").
- Giriş/oturum sonrası sayfa reload → boot uzlaşması (§4.D) sahiplik/benimseme kurallarını işletir.
- Bu, "local kayıt varken welcome görünmez" kuralının kapattığı kapıyı içeriden açar — çevrimdışı
  başlayan ya da oturumunu kaybeden oyuncu buluta buradan bağlanır.

## 5. Test Planı (TDD)

**Unit (Vitest, node):**
- `initialPhase(session, initial)` kural tablosu.
- `chooseSource` v2: ownerId-mismatch (bulut var/yok=adopt), tombstone, jenerasyon,
  aynı-jenerasyon, local-envelope-yok.
- `createCloudPush`: `cancel()`, uzlaşma kapısı (enable öncesi push yok), ownerId uyuşmazlığında
  push reddi.
- savegame: `clearLocalIdentity`, ownerId/resetAt helper'ları, **onPersist tombstone guard'ı**
  (createdAt <= resetAt yazılmaz).
- `/auth/callback`: code→exchange→303 `/`; error→`/?auth_error=1`.
- `/auth/confirm`: token_hash+type→verifyOtp→303 (recovery→`/?pw_reset=1`); hata→auth_error.
  (İkisi de mevcut `server.test.ts` kalıbı, fake `locals.supabase`.)
- Welcome e-posta alt-görünümü durum makinesi saf fonksiyonsa test edilir; değilse manuel.

**Manuel checklist (taze tarayıcı):** Google giriş (welcome→callback→intro), e-posta kayıt →
direkt oyun (K8), e-posta giriş ikinci cihazdan → hidrasyon, şifremi unuttum → mail → yeni şifre,
misafir akışı, çok-sekmeli reset (ikinci sekme zombi kayıt YAZAMIYOR olmalı — guard),
silme→welcome (kimlik anahtarları gitmiş, resetAt duruyor), auth_error toast, yabancı-local
(bulut varken bulut kazanır / bulut yokken adopt), ÇIKIŞ YAP (yalnız kalıcı hesapta, çevrimdışı
uyarısı), identity_already_exists geçişi, oturumsuz AccountPanel'den bağlanma.

## 6. Değişen/Yeni Dosyalar
- `src/routes/+page.svelte` — faz sistemi, hidrasyon-bekleyen boot, kimlik ertelemesi,
  auth_error/pw_reset, reset v2, cloudPush kapısı.
- `src/lib/components/WelcomeScreen.svelte` — **yeni** (+ gerekirse e-posta alt-görünüm dosyası).
- `src/lib/components/panels/AccountPanel.svelte` — oturumsuz durum, ÇIKIŞ YAP,
  identity_already_exists geçişi, silme v2, mesaj fix, `is_anonymous`.
- `src/routes/auth/callback/+server.ts` — **yeni**.
- `src/routes/auth/confirm/+server.ts` — **yeni**.
- `src/lib/stores/cloudSave.ts` — chooseSource v2, ownerId, cancel(), uzlaşma kapısı.
- `src/lib/stores/savegame.ts` — clearLocalIdentity, ownerId/resetAt, persist guard.
- `supabase/migrations/0003_saves_delete.sql` — **yeni**.
- İlgili `*.test.ts` dosyaları. CI env değişikliği YOK.

## 7. Bilinen Sınırlamalar (belgelenir)
- **K8 dönemi:** doğrulanmamış e-postayla kayıt mümkün (gerçek sahip şifre sıfırlamayla geri
  alır; PII sızıntısı yok); şifre-sıfırlama maili yerleşik servisten best-effort (saatlik düşük
  limit) — domain+SMTP (SP3a) ile ikisi de kapanır.
- Cihazlar arası **saat kayması** jenerasyon karşılaştırmasını nadiren yanıltabilir (yeni oyun
  kullanıcı-tetikli ve seyrek — kabul).
- Çevrimdışı reset sonrası yeni oyun hiç başlamazsa ikinci cihaz eski oyunda kalabilir.
- Hidrasyon sorgusu hata/timeout'unda intro fail-safe açılır → çok nadir pencerede ikinci
  cihazda BAŞLA eski bulut oyununu ezebilir (sunucu-taraflı jenerasyon karşılaştırması SP2+).
- Yabancı-local + bulut varken paylaşılan cihazdaki login'siz günün ilerlemesi sessizce
  değişir (K5).

## 8. Uygulama Notu
Dilim büyüdü (K7). Plan iki doğal parçaya ayrılır: **Parça 1** — fazlar/welcome/callback/reset/
KVKK/guard'lar (e-postasız da yayınlanabilir durur); **Parça 2** — e-posta+şifre (§4.J) +
`/auth/confirm` + şifre-yenile. Her parça kendi test+build kanıtıyla kapanır; muhtemelen iki
Sonnet oturumu.
