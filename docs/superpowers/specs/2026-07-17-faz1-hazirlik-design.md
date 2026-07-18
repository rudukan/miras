# Faz 1 — Hazırlık Kapısı (Design Spec)

> **Durum:** brainstorming çıktısı, onay bekliyor. Bir sonraki adım: `superpowers:writing-plans` ile uygulama planı.
> **Model ekonomisi:** bu spec güçlü modelde (Opus) yazıldı; uygulama ayrı Sonnet oturum(lar)ında.
> **Tetikleyici:** SP2 haftalık lig planından önceki ikinci kapı (birincisi Faz 0'dı, kapandı). Dış AI audit (`docs/external-ai-audit-2026-07-14.md`) önerisi.

## Amaç

Lig planını açmadan önce tek bir soruya **dürüst** bir GO / ITERATE / NO-GO cevabı vermek:

> Gerçek bir kullanıcı, yardımsız, oyunu anlıyor ve haftalık ligde oynamak istiyor mu?

Bu kapı üç iş kolundan oluşur; **deney driver, diğer ikisi onu güvenilir kılmak için var:**

1. **Funnel telemetri** — deneyi ölçmek için minimal, sorgulanabilir enstrümantasyon.
2. **Veri metodolojisi dili** — testçileri (ve gelecekteki oyuncuları) verinin ne olduğu konusunda yanıltmamak.
3. **10-15 kişilik GO/NO-GO deneyi** — asıl teslim.

**Kapsam dışı (ayrı, trivial hijyen — bu spec'e girmez):** README/AGENTS/`.codex` drift temizliği. **İstisna:** `memory.md`'deki bir kaynak-zehirlenmesi satırı bu spec'in bir çıktısı olarak düzeltilmeli (aşağıda §5).

## Mimari & Kısıtlar

- Mevcut katman sınırları korunur: domain saf kalır, store'lar tek iletişim kanalı, endpoint'ler ince proxy.
- Para asla `number` değil (`Money`); identifier İngilizce, UI Türkçe; renkler `term.*` token (hard-coded #hex yasak); bileşen ≤~200 satır; Svelte 5 runes.
- **Supabase kuralı:** yeni server-side client YARATMA — hep `locals.supabase`.
- TDD: her davranış önce başarısız test.

---

## Bölüm 1 — Funnel telemetri

### 1.1 Doğrulanmış zemin (kod okumasıyla)

Mevcut telemetri kasıtlı olarak incedir ve **iki taşıyıcı gerçek** bu tasarımı şekillendirir:

- **`player_id` kararlıdır ve KVKK-ertelemelidir.** `getOrCreatePlayerId(localStorage)` (`src/lib/stores/savegame.ts:169`) idempotent, localStorage-destekli; reload ve ertesi gün aynı tarayıcıda dönüşte AYNI id okunur (`savegame.test.ts:303`). Kimlik + günlük `visit` pingi **yalnız `enterGame()` içinde** üretilir (`src/routes/+page.svelte:222-227`), sayfa açılışında değil — sp15 spec §4.F gereği: *"welcome'da bekleyen/hesabını silmiş kullanıcı için UUID basılmaz, telemetri gitmez."*
- **Kalıcı depo YOK.** `/api/telemetry` yalnız `console.log` + opsiyonel Discord webhook yapıyor (`src/routes/api/telemetry/+server.ts:43-55`); Vercel logu ~1 saat yaşıyor. **Gün-farkı join'in dayanacağı tablo yok** — bu yüzden telemetry tablosu funnel sorgusunun ÖN KOŞULU.

### 1.2 Funnel tanımı (düzeltilmiş)

```
visit  →  first_trade  →  ertesi gün visit (D1)
```

- **`visit` = "oyuna girdi"** (siteye indi DEĞİL). İstanbul günü başına 1, cihaz-yerel dedupe (`pingDailyVisit`, `telemetry.ts:24`). Bir oyuncunun ilk `visit`'i (`MIN(received_at)`) = "oyuna ilk giriş".
- **`game_start` EKLENMEZ.** `visit` zaten `enterGame`'de atıyor (`+page.svelte:227`), `phase='playing'` 11 satır sonra (`:238`); ayrı bir `game_start` yapısal kopya olur, dönüşümü inşaen %100 çıkar → hiçbir şey ölçmez, sadece "karşılama ekranı mükemmel" diye yanıltır. **Sıfır kod: sadece funnel tanımını böyle yaz.**
- **Landing (siteye indi ama girmedi) ÖLÇÜLMEZ.** KVKK §4.F `player_id`'li landing event'ini yasaklar; kimliksiz sunucu sayacı N=10-15 için ölçtüğünden fazla gürültü/altyapı getirir. Karşılama ekranı terk-etmesi **moderatörlü seanslarda gözle ve nedeniyle** görülür (Bölüm 3) — sayaçtan zengin.
- **Auth/misafir adımı EKLENMEZ.** Google/e-posta girişi `reload → boot → intro → tıklama` yolundan geçtiği için (`+page.svelte:310-311`, `:527`) auth başarısı ile `visit` arasında zorunlu bir kullanıcı tıklaması var; auth'u funnel basamağı yapmak bu tıklamayı görünmez kılar.

### 1.3 Aktivasyon: `first_trade`

**Kapsam: `buy | sell | openDeposit`.** Üçü de kullanıcıya açık, sermaye-riske-atma aksiyonu (`DepositCard` mounted, `+page.svelte:779`). Dışarıda: `breakDeposit`/`collectRent` (çıkış/hasat, aktivasyon değil), emlak (öksüz — `PropertyCard` hiçbir yerden import edilmiyor). Per-action dikiş sayesinde emlak açılırsa tek satırla eklenir.

**Seam (kod-doğrulanmış — reducer'a KOYULAMAZ):**
- `buyAsset`/`sellAsset` saf reducer (`gameState.ts:53` — *"reducer'lar saf kalsın diye updatedAt'i DEĞİŞTİRMEZ"*); telemetri oraya konsa 1000-seed denge simülasyonu (`tests/balance/`, `RUNS=1000`) her koşuda binlerce POST atardı.
- Store sarmalayıcıları `apply()`'a delege ediyor ama **`apply` void döner ve hatayı yutar** (`liveGameStore.svelte.ts:332`) → başarı/başarısızlık ayırt edilemez. Bu yüzden:

```ts
// liveGameStore.svelte.ts:332 — imza değişikliği
function apply(fn: () => GameState, onOk?: () => void): void {
  try {
    game = { ...fn(), updatedAt: now() };
    lastError = null;
    persist();
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return;                       // erken çıkış: başarı testi tek noktada sabit
  }
  try { onOk?.(); } catch { /* telemetri best-effort — oyunu bozmaz */ }
}
```
- **`onOk` try'ın DIŞINDA olmalı.** İçine koyulursa `storage.setItem` (Safari private mode / kota) throw ettiğinde `apply`'ın catch'i yakalar → `game` **zaten atanmış** ve `persist()` koşmuş olmasına rağmen (ikisi de catch'ten önce, try'ın ilk ifadeleri) `lastError` null→hata mesajına ezilir → kullanıcıya başarılı işlem için **sahte hata** (`lastError` → Toast) gösterilir. `onOk` dışarıda + erken `return` bunu keser.
- `onFirstTrade?: () => void` seçeneği `LiveGameStoreOptions`'a eklenir; **yalnız** `buy` (`:357`), `sell` (`:363`), `openDepositAction` (`:369`) çağrılarına bağlanır.
- **`playerId` sayfadan okunur, STORE'dan DEĞİL.** Kayıtlı oyunda store'un iç playerId'si `'restored'` olur (`+page.svelte:74`, `:228` guard store'u yeniden kurmaz) → tüm dönen oyuncular tek id'ye çökerdi. Share handler'larıyla aynı kalıp (`:214 if (playerId) sendTelemetry(...)`).

```ts
// telemetry.ts — pingDailyVisit kalıbının birebir eşi
const FIRST_TRADE_KEY = 'miras.firstTradeSent';
export function pingFirstTrade(storage: Storage, playerId: string): void {
  if (storage.getItem(FIRST_TRADE_KEY) === '1') return;
  sendTelemetry(playerId, 'first_trade');
  storage.setItem(FIRST_TRADE_KEY, '1');
}
```

### 1.4 Veri modeli — `migration 0006_telemetry_events.sql`

> Numara **0006** (0005 dolu: `0005_service_role_grant_correction.sql`).

```sql
create table public.telemetry_events (
  id          bigint generated always as identity primary key,
  player_id   text        not null,
  event       text        not null,
  ts          timestamptz not null,          -- istemci saati (güvenilmez)
  received_at timestamptz not null default now(),  -- sunucu saati — gün kovası bundan
  constraint player_id_format check (player_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint event_valid check (event in ('visit','share_click','share_done','first_trade'))
);
alter table public.telemetry_events enable row level security;

-- REVOKE-FIRST (derinlemesine savunma) + GRANT (yük taşıyan). auto_expose_new_tables
-- lokalde + yeni cloud default'ta KAPALI (config.toml:24 unset) → yeni tablo hiçbir default
-- grant ile doğmaz; bu yüzden aşağıdaki `grant insert` ZORUNLU (o olmadan insert çalışmaz).
-- `revoke all` legacy auto-expose'a karşı savunma (prod o davranışla yaratılmış olabilir —
-- 0001 anon/authenticated'ı revoke etmek zorunda kalmıştı) + service_role'ü kapatır.
revoke all on table public.telemetry_events from anon, authenticated, service_role;

-- SONRA GEREKENİ AÇ: yalnız INSERT, yalnız client'ın yazması meşru kolonlar.
-- received_at + id GRANT'TE YOK → sunucu saati/kimliği client'a bırakılmaz (0001:18 gerekçesi).
grant insert (player_id, event, ts) on table public.telemetry_events to anon, authenticated;

create policy telemetry_insert_any on public.telemetry_events
  for insert to anon, authenticated with check (true);
-- SELECT grant/policy YOK → okuma yalnız owner (postgres / SQL editor).
```

- **Rol: `anon` VE `authenticated`.** Projenin kendi tasarım dokümanı bunu *"Anonim tuzak: Supabase'de misafir oturum da `authenticated` rolündedir"* diye adlandırıyor (`2026-07-04-cok-kullanicili-yayin-design.md:69`). Misafir = authenticated, offline = anon; `enterGame()` üç yoldan da `pingDailyVisit` çağırır → iki rol de gerçek trafik üretir. Yalnız birine verirsem diğerinin telemetrisi **sessizce 403'e düşer** (`telemetry.ts:20 .catch(() => {})`).
- **service_role GRANT'i YAZILMAZ.** SQL editor direct connection = `postgres` = tablo sahibi = implicit yetki (canlıda doğrulandı). 0004 açıkça *"PostgREST uzerinden"* diyor; okuma PostgREST'ten geçmiyor. İleride bir E2E testi service-role ile okumak isterse o zaman eklenir — **şimdi bilinçli olarak yazılmıyor**, sonradan ad-hoc eklenmesin.
- **Trigger gereksiz.** 0001'deki `set_updated_at` trigger'ı UPDATE'te `default now()` yeniden ateşlenmediği için vardı; tablo insert-only olduğundan `default now()` yeterli.

### 1.5 Yazma yolu — `/api/telemetry/+server.ts`

- `locals.supabase.from('telemetry_events').insert({ player_id, event, ts })` — `/api/profile/+server.ts:18` kalıbı (kullanıcının kendi JWT'siyle, RLS geçerli).
- **`received_at` GÖNDERİLMEZ** — PostgREST grant'i olmayan bir kolonu client gönderirse 403 döner (sessizce yok saymaz).
- Mevcut `console.log` + Discord webhook + strict payload doğrulaması (`PLAYER_ID_RE`, `VALID_EVENTS`) korunur. Insert hatası yutulur (best-effort, oyunu asla bloklamaz). Endpoint yine 204/400 döner.
- **`isSameOrigin` guard'ı EKLENİR** (`/api/profile/+server.ts:9`, `/api/account/delete/+server.ts:13` kalıbı). Tablo yazılır hale gelince çapraz-site sahte satır şişirme yüzeyi açılıyor; tabloyu getiren dilim korumasını da getirir. Rate-limit (B2) ayrı planda kalır.
- **Handler imzası `{ request }` → `{ request, locals, url }`** olur (`isSameOrigin` `url.origin` okur, insert `locals.supabase` ister). Mevcut `server.test.ts` mock'u (`postReq`) yalnız `request` sağlıyor → **harness yeniden yazılır**: bkz. iş kalemi 5.
- **Event union iki dosyada kopya** (`telemetry.ts:1` + `+server.ts:3` + `VALID_EVENTS`); `'first_trade'` **üçüne + CHECK constraint'e** eklenir yoksa sunucu 400'ler ve event sessizce yutulur. `server.test.ts:28` kalıbına `first_trade → 204` testi.

### 1.6 Funnel/retention sorguları (ham SQL, dashboard YOK)

- Gün kovası **`received_at`'ten** türetilir (istemci `ts`'i değil): `(received_at at time zone 'Europe/Istanbul')::date`. Saat-kaymış cihazlar kohortu bozmasın.
- Funnel: event başına `count(distinct player_id)`.
- D1: `visit`'lerin `player_id` üzerinde gün-farkı self-join'i. **D1 = "geri döndü VE oyuna tekrar girdi"** (siteye döndü değil) — sp15 §4.F undercount'u; rubrikte böyle adlandırılır. **D1 birincil, D7 "zayıf sinyal" etiketli** (N=15 + kayan başlangıçta neredeyse anlamsız; hesaplanır ama ağırlık verilmez).

### 1.7 Bilinen metrik sapmaları (dürüstçe belgelenir)

- **`player_id` = tarayıcı-profili başına kalıcı anonim kimlik**, "kişi başına" DEĞİL. Aynı insan telefon+laptop = iki id (D1 eksik sayar); signOut sonrası aynı tarayıcıyı kullanan ikinci insan = tek id (D1 fazla sayar — signOut kimliği bilerek korur). `user.id` ile birleştirme mümkün ama `ownerId` telemetri payload'ında yok; Faz 1'de yapılmaz.
- **Hesap silme kimliği sıfırlar** (`clearLocalIdentity` → `player_id` + `lastVisitPing` silinir; KVKK gereği doğru). Silip dönen aynı insan yeni D0 kohortu olarak sayılır → retention paydası şişer. Düzeltme kodda değil, **metrik tanımında bir uyarı notu**.

---

## Bölüm 2 — GO/NO-GO deneyi (asıl teslim)

### 2.1 Testçi havuzu ve önyargı azaltma

- 10-15 kişi; **en az 3-4 "yabancı"** (arkadaşın arkadaşı) karıştır — arkadaşlar fazla naziktir, ölçümü öldürür.
- Karışık finans-okuryazarlığı (kur/enflasyon takip eden meraklı + acemi); onboarding ancak acemide gerçekten test edilir.
- **Fikir sorma, davranış ölç.** Moderatörlü seansta "beğendin mi?" YASAK. Anket anonim.

### 2.2 Erişim ve pencere

- Prod URL (`miras-one.vercel.app`); ayrı staging kurulmaz (telemetri prod'da).
- ~1 hafta davet + her testçi için kendi katılımından D1/D7 → toplam ~2 hafta.

### 2.3 Moderatörlü seans protokolü (3-4 kişi, ~30-40 dk)

- Ekran paylaşımı + think-aloud. Görev tabanlı, **yardım YOK**: *"linki aç, sana hiçbir şey anlatmayacağım, sesli düşün."* Soru gelirse moderatör cevaplamaz, *"sen ne yapardın?"* diye geri sorar (yardım = ölçüm ölür).
- Davranışsal anlar: karşılama ekranını geçti mi / ne kadarda → **ilk işlemi yardımsız yapabildi mi / kaç dakikada** → net servet panelini doğru okudu mu → nerede takıldı. Sonda sorular yalnız seans sonunda.

### 2.4 Anket (10+, anonim, ≤10 soru)

- Anlamayı **kanıtlat, sorma**: *"Oyunun amacını 1 cümlede yaz"* (açık uçlu).
- Niyet: *"Haftalık lig olsa oynar mıydın + neden."*
- Takılma noktası (açık uçlu).
- **"Verinin gecikmeli olduğunu fark ettin mi?"** — Bölüm 3'ün (veri dili) işe yarayıp yaramadığını doğrudan test eder.

### 2.5 GO/NO-GO rubriği

| Kapı | Kriter | Sonuç |
|------|--------|-------|
| **Teknik (sert, ikili)** | Sıfır kritik hata: veri kaybı, yanlış para hesabı, crash | Herhangi biri → **NO-GO** (Faz 0'ın ruhu, taviz yok) |
| **Anlama** | Seansların ≥3/4'ünde ilk işlem **yardımsız**; ankette çoğunluk amacı doğru yazıyor | Sistematik aynı-noktada takılma → **ITERATE** |
| **Niyet** | Çoğunluk (≈≥%60) "ligde oynardım" — nedeni **oyunun kendisi** ("arkadaşım yaptı" değil) | Düşükse → **ITERATE/NO-GO** |
| **Funnel** | visit→first_trade + D1 | **Yalnız sanity.** Nitel okumayla çelişirse uyarı işareti; tek başına kapı değil |

- Eşikler "insan" kriterleri, sert nicel değil — N=10-15'te saf yüzde istatistiksel olarak dürüst değil (her kişi ≈%7-10).
- **Çıktı:** yazılı hüküm (GO → SP2 lig planı açılır / ITERATE / NO-GO) + kanıt: hangi adımda kaç kişi tıkandı.

---

## Bölüm 3 — Veri metodolojisi dili

Faz 0'ın "güven/doğruluk" temasının kullanıcıya bakan yüzü. **İddialar kod-doğrulanmış** — Faz 1'in amacı dürüstlük olduğu için yanlış iddia bu kapının kendisini baltalar.

### 3.1 "Veri Hakkında" notu — içerik (yalnız kodda karşılığı olan iddialar)

- **Kripto:** WS ile canlı (500 ms throttle); 24s % değişim 20 sn'lik REST poll'dan gelir; WS koparsa REST'e düşer, 3 sn'de bir yeniden bağlanır. *(tek tam-doğru iddia)*
- **BIST:** ~15 dk gecikmeli (Yahoo ücretsiz feed); istemci 20 sn'de bir çeker, sunucuda 5 sn cache.
- **Altın/gümüş:** COMEX vadeli (`GC=F`/`SI=F`) ons fiyatından gram + TRY'ye çevrilir (türetilmiş, spot değil).
- **Döviz:** Yahoo FX pariteleri (`USDTRY=X` vb.).
- **Kur mührü:** günlük mühürlü + **%0.75 eşikli** reseal (gürültüde sakin, gerçek harekette hızlı); canlı kur Binance **USDT/TRY** tick'inden (mühür + Yahoo `USDTRY=X` yedeğiyle) — **USDT/TRY'yi "USD/TRY" diye sunma.**
- **"Yatırım tavsiyesi değildir."** (asgari sürüm; tam metin SP3a.)
- **İddia YOK — VASİYET verisi.** `macro2025.ts:20` *"TÜMÜ knowledge-cutoff tahmini"*, gürültü gün granülünde (`noise.ts:3` *"random walk yok"*), ±%4.5 yalnız legacy'de, VASİYET modu `+page.svelte`'ye bağlı değil (oynanamıyor). **"Gerçek 2025 verisi" / "intra-day dalgalanma" / "±%4.5" ifadeleri yazılmaz.**

### 3.2 Yerleşim

- Yeni bileşen `src/lib/components/ui/DataInfoModal.svelte` (`ui/` dizini mevcut ama boş — CLAUDE.md zaten öngörüyor). `src/lib/components/ChartOverlay.svelte` dialog iskeletini kalıp al: örtü butonu (`:43`) + `role="dialog"`/`aria-modal` (`:50-51`) + Escape (`:35-37`) + `closeBtn` focus (`:30-33` `$state`/`$effect` + `bind:this` `:66`). `term.*` token, ≤200 satır.
- Tetikleyici info butonu **`PriceList.svelte:92-94` başlık bloğuna** (PriceRow'a KOYMA — satır zaten tek `<button>` ve 1 sn'lik hover-popover'ı var). `open` state'i PriceList'te lokal `$state`. PriceList 190 satır → modal ayrı dosyada.

### 3.3 Piyasa kuru görünürlüğü (küçük iş kalemi, ~5 satır)

"Piyasa kuru ayrıca gösteriliyor" iddiası **bugün yanlış**: `store.liveUsdTry` hazır (`liveGameStore.svelte.ts:597`) ama hiçbir bileşen okumuyor; tüm UI mühürlü kuru gösteriyor (`WalletSummary.svelte:17`). `WalletSummary`'ye **"mühürlü ₺X · piyasa ₺Y"** ikinci satırı eklenir — iddia dürüstleşir VE mührün "neye göre" mühürlendiği ekranda görünür (`[[esikli_muhur_karari]]` "önce göster" tercihiyle tutarlı).

---

## Bölüm 4 — Uygulama öncesi doğrulama adımı

- **Lokal (E2E stack):** `auto_expose_new_tables` KAPALI (`config.toml:24` unset — yeni cloud default). Yani lokalde **revoke'suz** bir tablo bile anon/authenticated'a **boş** default ACL ile doğar — beklenen sonuç budur ve `grant insert`in **zorunlu** (savunma değil) olduğunu kanıtlar. `revoke all`'u lokalde no-op ama legacy auto-expose'a karşı savunma olarak tut. (Doğrulamak için: migration'ı uygula, `select relacl from pg_class where relname='telemetry_events'` → anon/authenticated yalnız kolon-`a` (INSERT) taşımalı.)
- **Prod:** gerçek default'u ancak **push-sonrası** `relacl` belirler (prod projesi 2026-07-08'de yaratıldı; 0001'in anon/authenticated revoke'u o dönem auto-expose'un AÇIK olabileceğini düşündürüyor — lokal ≠ prod olabilir). Push: **yalnız migration dosyası, elle geniş komut YOK** (0005 dersi); push sonrası `relacl` doğrula: anon/authenticated yalnız kolon-`a`, **service_role ACL'de hiç görünmez.**
- **Not (phantom 0004):** `0004_service_role_saves_select` prod migration history'sinde KAYITLI DEĞİL (ad-hoc uygulandı; prod'da 0001/0002/0003/0005 var, MCP ile doğrulandı 2026-07-17). Faz 1 migration'ı `supabase db push`'landığında **0004 + 0006 birlikte** gider — 0004 idempotent `grant select` (zararsız), ama beklenmedik gelmesin.

---

## Bölüm 5 — Kaynak zehirlenmesi düzeltmesi (bu spec'in çıktısı)

`memory.md:37-40` (§2.A "Tarihsel Veri Seti") legacy v3.1.0'ı tarif ediyor — "2024 gerçek fiyat hareketleri", "0.5s aralıklarla", "+/- 4.5%" — ama LEGACY etiketi yok ve `macro2025.ts` ile çelişiyor (2024-gerçek vs 2025-tahmin). Bu satır bu oturumda **bana** İddia 4'ü yanlış yazdırdı. `memory.md`'ye "LEGACY (portlanmadı)" etiketi eklenir, yoksa hata her oturumda yeniden üretilir. *(Bu tek dosya düzeltmesi drift hijyeninin parçası ama kaynağı burada olduğu için burada kaydediliyor.)*

---

## İş kalemleri özeti (writing-plans girdisi)

**Telemetri (mühendislik):**
1. `migration 0006_telemetry_events.sql` (revoke-first, anon+authenticated INSERT-only, CHECK constraint, service_role kapalı).
2. Event union'a `first_trade` — `telemetry.ts` + `+server.ts` + `VALID_EVENTS` + CHECK (senkron).
3. `pingFirstTrade(storage, playerId)` — telemetry.ts, DI'lı, TDD.
4. `apply(fn, onOk?)` seam (onOk try DIŞINDA) + `onFirstTrade` option → buy/sell/openDeposit; liveGameStore.test.ts (başarı bir kez / Insufficient USD hiç / bloklu hiç).
5. `/api/telemetry` insert (`locals.supabase`, `received_at` GÖNDERME) + `isSameOrigin` guard. Handler imzası `{ request, locals, url }` olur → **`server.test.ts` harness'ı (`postReq`) yeniden yazılır**: `url` (`new URL('http://localhost/api/telemetry')`) + mock `locals.supabase` (insert best-effort) + eşleşen `origin` header enjekte edilir; mevcut testlerin hepsi yeni harness'la geçmeli; ayrı **"origin uyuşmaz → 403"** testi eklenir.
6. `+page.svelte` `onFirstTrade` kablolaması (playerId sayfa state'inden).

**Veri dili:**
7. `DataInfoModal.svelte` (ui/, ChartOverlay iskeleti) + PriceList başlık info butonu; component smoke test.
8. `WalletSummary` "mühürlü · piyasa" ikinci satırı (~5 satır).

**Deney (kod değil — süreç dokümanı):**
9. Moderatör betiği + anket soruları + GO/NO-GO rubriği (spec Bölüm 2'den derlenir).

**Hijyen:**
10. `memory.md:37-40` LEGACY etiketi.

**Doğrulama:** lokal `relacl` kontrolü (Bölüm 4); `npm run test` + `npm run build` + gerçek tarayıcıda telemetri insert'ünün DB'ye düştüğünü doğrula.
