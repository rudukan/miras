# Miras Oyunu - Proje Hafızası ve Yol Haritası (Project Memory)

Bu doküman, "Miras Oyunu" projesinin tasarım kararlarını, teknik mimarisini, güncel denge parametrelerini ve gelecek geliştirme planlarını içeren ana bilgi deposudur.

---

## 1. Proje Tanımı ve Vizyonu

"Miras Oyunu", oyuncunun hiç tanımadığı büyük amcasından kalan **1.000.000 USD** tutarındaki mirası, Türkiye'nin dalgalı makroekonomik koşullarında 365 gün boyunca işletmesini konu alan, tarayıcı tabanlı bir finansal simülasyon ve tycoon oyunudur.

### Hedef Kitle ve Çekici Faktör (The Hook)
* **Kültürel Aşinalık:** "Amca mirası", resmi sulh hukuk mahkemesi tebligatları ve Türkiye'nin milli sporu haline gelmiş olan enflasyon/kur takibi gibi temalar üzerinden yüksek mizahi (meme) potansiyel barındırır.
* **Bürokrasi ve Hiciv:** Tapu dairesindeki gecikmeler ve bu süreci atlamak için ödenen "rüşvet" mekaniği, oyunun ironik ve eğlenceli yapısını güçlendirir.

### 1.1 Ticari Vizyon ve Markalaşma Stratejisi
* **Faz-Öncelikli Dağıtım:** İlk aşamada tarayıcı tabanlı (Web) sürüm kusursuzlaştırılarak geniş kitlelere ve sosyal medya viralliğine (kullanıcı edinim maliyeti sıfır) ulaşılacaktır. İkinci aşamada, gelen talebe göre yerel mobil uygulamalara (iOS / Android) geçiş yapılacaktır.
* **Marka & IP Koruma:** "Miras Oyunu" ismi altında güçlü bir fikri mülkiyet (IP) inşa edilerek, uzun vadeli gelir getirebilecek bir marka haline getirilecektir.
* **Gelir Modeli (Monetization):** Mobil geçişle birlikte oyuncuyu sıkmayan satirik reklamlar, premium modlar ("Miras Vergisi Muafiyeti Paketi" gibi mizahi mikro-ödemeler) ve sponsorlu içerikler ile Yönetim Kurulu Başkanına sürdürülebilir ve güçlü bir finansal gelir akışı sağlanması hedeflenmektedir.

---

## 2. Mevcut Teknik Mimari

> **Güncelleme notu (2026-07-02):** Proje Mayıs 2026'da vanilla JS'ten (`server.js`/`app.js`/`index.html`) SvelteKit 2 + Svelte 5 + TypeScript'e tamamen yeniden yazıldı. Eski dosyalar artık yalnız `legacy/` altında referans olarak duruyor, build'e dahil değil. Aşağıdaki "Dosya Dağılımı" güncel; **B-H alt başlıklarındaki ekonomi mekanikleri (emlak/tapu/rüşvet, vergi, Tech Agent) legacy'de tamamlanmıştı ama SvelteKit'e henüz portlanmadı** — CLAUDE.md'nin "Ekonomi Kanonları" bölümündeki sayılarla tutarlı, hâlâ kanonik tasarım referansı, sadece kod tabanında karşılığı yok. SvelteKit'te şu an gerçekten var olanlar için Bölüm 2.I'e bak.

### Dosya Dağılımı (güncel — SvelteKit)
* **`src/lib/domain/`** — Saf TS iş mantığı (money, fx, deposit, snapshot, scenario, series, calendar, time), UI'sız, TDD ile test edilir.
* **`src/lib/stores/`** — Svelte 5 runes store'ları; sistemler arası tek iletişim kanalı. `liveGameStore.svelte.ts` oyunun kalbi.
* **`src/lib/components/`** — Svelte component'lar (panels/, chart/, ui/); `format.ts` saf gösterim yardımcıları (node'da test edilir).
* **`src/lib/api/`** — Dış API client'ları: `yahoo.ts`, `binance.ts`, `fx.ts`.
* **`src/routes/api/`** — Sunucu tarafı proxy endpoint'leri (`/api/yahoo`, `/api/crypto`, `/api/series`, `/api/telemetry`), 5s cache.
* **`legacy/`** — Eski vanilla-JS uygulama (server.js/app.js/index.html), build'den hariç, referans için tutuluyor.
* Deploy: GitHub push (main) → Vercel otomatik prod deploy → miras-one.vercel.app.

### Önemli Teknik Bileşenler (B-H: legacy'de tamamlanmış, SvelteKit'e henüz portlanmamış kanonik tasarım)

#### A. Tarihsel Veri Seti (Jan 2024 - Jan 2025) — ⚠️ LEGACY (v3.1.0, SvelteKit'e PORTLANMADI)
> **Uyarı:** Bu bölüm legacy'yi tarif eder, kodda karşılığı YOK. SvelteKit'te veri `src/lib/data/macro2025.ts` = 2025 TAHMİNİ ("TÜMÜ knowledge-cutoff tahmini", quant doğrulayacak); gürültü GÜN granülünde (`fx/noise.ts` — "random walk yok", akümülatif değil); "±%4.5 intra-day" yalnız `legacy/app.js`'te. "2024 gerçek veri" / "0.5s dalgalanma" / "±%4.5" iddialarını BURADAN ALMA (Faz 1 spec İddia 4'ü tam bu yüzden çıkardı).

Türkiye'nin 2024 yılına ait 52 haftalık gerçek verileri (USD/TRY kuru, Merkez Bankası politika faiz kararları, KFE konut endeksi ve hisse fiyatları) doğrusal interpolasyon (linear interpolation) ile JS içerisine entegre edilmiştir.
* **USD/TRY Kur Eğrisi:** ₺29.90 seviyesinden başlayıp ₺35.30 seviyesine kadar kademeli devalüasyonu simüle eder.
* **BIST Equities:** 9 adet hisse senedinin (**THYAO, EREGL, ASELS, GUBRF, KCHOL, TUPRS, SASA, YKBNK, BIMAS**) 2024 yılındaki gerçek fiyat hareketleri temel alınmış, 0.5s aralıklarla canlı tahta hissi uyandıracak küçük yapay dalgalanmalar (+/- 4.5%) eklenmiştir.

#### B. Otomatik Döviz Dönüştürme ve Mevduat Entegrasyon Motoru (`ensureTRYBalance`)
Oyuncu TRY ile yapılan bir işlemde (Hisse alımı, vadeli hesaba para yatırma, emlak satın alımı veya vergi/rüşvet ödemesi) yetersiz nakit Lira bakiyesine sahipse, sistem arkada **otomatik olarak** şu adımları izler:
1. **Vadeli Mevduat Hesabı Kontrolü**: Gerekli tutar öncelikle oyuncunun Vadeli Mevduat (Bank) hesabındaki Lira bakiyesinden çekilir.
2. **Dolar Satış Çevirimi**: Mevduat hesabı da yetersiz kalırsa, kalan açık için gerekli miktarda USD güncel kurdan bozulur (Tech Agent aktif değilse %0.1 komisyon uygulanır) ve TRY kasasına aktarılır.
$$\text{Gerekli USD} = \frac{\text{Açık Tutar}_{TRY}}{\text{Kur}_{USD/TRY} \times (1 - \text{Komisyon})}$$

#### C. Türkiye Geneli Varlık Portföyü (6 Farklı Emlak ve İşletme)
Emlak alanı genişletilerek Türkiye genelinde Arsa, Konut ve İşletmeleri kapsayacak şekilde dinamik hale getirilmiştir. Yatırım dengesinin korunması amacıyla kira getirileri 2.0x oranında optimize edilmiştir:
1. **İç Anadolu Tarım Arazisi** (Arsa): Başlangıç bedeli ₺1.2M, Güncel Kira: ₺700/sn. Tapu süresi: 5 gün.
2. **İstanbul 1+1 Daire** (Konut): Başlangıç bedeli ₺4.5M, Güncel Kira: ₺2,600/sn. Tapu süresi: 8 gün.
3. **Ege Turizm İmarı** (Arsa): Başlangıç bedeli ₺9.0M, Güncel Kira: ₺5,600/sn. Tapu süresi: 10 gün.
4. **Kadıköy Butik Kafe** (İşletme): Başlangıç bedeli ₺15.0M, Güncel Kira: ₺10,000/sn. Tapu süresi: 12 gün.
5. **Antalya Deniz Rezidans** (Konut): Başlangıç bedeli ₺28.0M, Güncel Kira: ₺20,000/sn. Tapu süresi: 14 gün.
6. **Bodrum Butik Otel** (İşletme): Başlangıç bedeli ₺65.0M, Güncel Kira: ₺50,000/sn. Tapu süresi: 18 gün.

#### D. Tapu Dairesi Gecikmeleri ve Rüşvet Mekaniği
Gayrimenkuller satın alındığında doğrudan portföye eklenmez. **Tapu Başvurusu** olarak beklemeye alınır:
* **Bürokratik Bekleme:** Emlak değerine göre 5 ile 18 gün arası sürer. Bekleme süresince kira geliri aktarılmaz.
* **Rüşvet Düğmesi ("Hızlandır"):** Emlak bedelinin %8'i kadar rüşvet ödenerek tapu süreci anında atlanabilir ve kira akışı başlatılabilir.

#### E. Enflasyon ve Hedef Eşik
Başlangıçtaki $1,000,000 USD, günlük **%0.01** (yıllık **~3.71%**) USD enflasyon oranına bağlı olarak büyür (yıl sonu hedefi: **~$1,037,172 USD**). Bu oran, 2024 yılındaki gerçekçi USD enflasyon seyrini yansıtır ve tüm yatırım stratejilerinin (Mevduat, Borsa, Emlak, Kripto, Tech Startup) dengeli ve rekabetçi bir şekilde oyunu kazanabilmesini sağlar.

#### F. Vergi ve Denetim Mekanizmaları
* **Mevduat Stopajı**: Banka mevduatından kazanılan günlük faiz gelirlerinden otomatik olarak %7.5 oranında stopaj vergisi kesilir.
* **Kira Gelir Vergisi**: Her 50 günde bir vergi dairesi denetim yapar. 50 günlük birikmiş kira geliri ₺100.000'yi aşıyorsa progressive vergi (dilimlerine göre %15 ila %30 arası) tahsil edilir.
* **Fırsatçı Fiyat Cezası**: Kafe veya Otel için fiyatlandırma politikası "Fırsatçı" olarak seçildiğinde, günlük %3 olasılıkla müşteri şikayet denetimi tetiklenir ve ₺100K-350K arası zabıta cezası kesilir.

#### G. Tech Agent (Yazılım Girişimi)
Amcanızdan kalan AI yazılım startup'ını uyandırmak ($50,000) ve yükseltmek pasif nakit akışı sağlar:
* **Başlangıç Pasif Akış**: +$80.00/sn
* **Bulut Sunucu Ölçekleme** (Maliyet: $75,000): +$250.00/sn ek gelir sağlar ve BIST hisselerinde (GUBRF) otomatik AI ticaret yazılımını devreye sokar.
* **Viral Reklam Kampanyası** (Maliyet: $160,000): +$650.00/sn ek gelir sağlar.
* **Komisyon Muafiyeti**: Tech Agent aktif olduğunda tüm döviz çevrim komisyonları (%0.1) ve BIST hisse komisyonları (%0.2) sıfırlanır.

#### H. Web Audio Sentezleyici
Harici ses dosyası yüklemeden, tarayıcının yerleşik ses API'siyle sentezlenen sesler (Daktilo sesleri, beeper, system hum).

#### I. SvelteKit'te Şu An Gerçekten Var Olanlar (2026-07-02 itibarıyla)
Yukarıdaki B-H'nin aksine, aşağıdakiler mevcut SvelteKit kod tabanında gerçekten çalışıyor:
* **USD-taban para modeli:** Her şey `Money` tipiyle (`src/lib/domain/money.ts`) USD üzerinden tutulur; TRY yalnız gösterim/çevrim anı.
* **Günlük mühürlü + eşikli operatif kur:** `liveGameStore`'da `sealedUsdTry()` — canlı kur günde bir mühürlenir (net servet gürültüden etkilenmesin), ama mühürden %0.75'ten fazla sapan GERÇEK hareket aynı gün yeniden mühürlenir (`resealThresholdPct`). Canlı piyasa kuru ayrıca bilgi amaçlı her zaman görünür ("piyasa (canlı)" satırı).
* **Hibrit canlı veri:** Kripto Binance WS (birincil, throttle 500ms) + `/api/crypto` snapshot (WS kopukken fallback + cold-start tohumlama). BIST/altın/gümüş/döviz `/api/yahoo` poll (20s), ~15dk gecikmeli (Yahoo Finance ücretsiz feed sınırı).
* **Mevduat (TL vadeli):** streaming yield + mark-to-market, stopaj dahil.
* **Cüzdan/Net Servet UX:** Net servet paneli "Kalan Nakit / Yatırımda" dağılımı gösterir; cüzdandaki pozisyonlara tıklayınca İŞLEM PANELİ'nde seçilir.
* **Market grafik + işlem pop-up:** Piyasa satırına hover/tap (1sn) ile canvas çizgi grafik + gerçek AL/SAT içeren pop-up.
* **Al/Sat miktar girişi:** Adet ve Tutar ($) alanları yazarken binlik virgülüyle canlı gruplanır, imleç konumu korunur.
* **Emlak (süper sade, 2026-07-03):** 3 emlak (`src/lib/domain/property/property.ts`) — tapu anında geçer, rüşvet/vergi yok. Kira **kasaya** birikir (zaman-damgası tabanlı, offline da işler), 48 saatlik kira dolunca birikim durur (bağımlılık döngüsü — TAHSİL ET ile boşalt). SAT: bedel (TL sabit) + kasa birlikte USD'ye.
* **Hesap altyapısı (SP1):** Google+misafir auth, bulut kayıt senkronu, takma ad, KVKK silme — canlı.
* **Haftalık lig (SP2a, 2026-07-27):** CANLI SEANS artık lig — sunucu damgalı `/api/trade` (istemci fiyat GÖNDERMEZ) + kapanışta `/api/league/tick` replay'i (istemcinin çalıştırdığı AYNI `buyAsset`/`sellAsset` reducer'larıyla), `saves` payload'u skorda hiç kullanılmıyor. Kod tarafı main'de, CI yeşil, 15/15 task + final review tamam. **Prod'da henüz devrede değil** — Vercel'in `CRON_SECRET` ortam değişkeni eksik (Task 0, kullanıcı adımı). Detay: Bölüm 6.
* Tapu bekleme/rüşvet katmanı, kira vergisi denetimi, Tech Agent — **henüz yok** (bkz. Bölüm 4 aktif plan).

---

## 3. Tasarım Standartları ve Token'ları

Bloomberg Terminali ve Binance estetiğini korumak için belirlenen kurallar:
* **Yazı Tipi:** `JetBrains Mono` (Google Fonts). Sabit aralıklı (monospace) veri okumayı kolaylaştırır.
* **Renk Paleti:**
  * Arka Plan: `#070a13`
  * Panel Kartları: `#0e1322`
  * Aktif/Pozitif/Yükseliş: `#00ff66`
  * Pasif/Negatif/Düşüş: `#ff3366`
  * Uyarı/Enflasyon: `#f59e0b`
  * Bilgi/FX Kur: `#00e1ff`

---

## 4. Gelecek Sürümler Yol Haritası (Roadmap)

> **Öncelik notu (2026-07-02):** Aktif geliştirme odağı CANLI SEANS'a kaydı. VASİYET SEFERİ + Faz 2 (2001 Kriz, 2018 Kur Şoku) aşağıda roadmap'te duruyor ama aktif çalışma yok — kullanıcı açıkça istemedikçe bu modlara dokunulmuyor.

> **Kapı güncellemesi (2026-07-15, dış audit + kurucu onayı; 2026-07-18 güncellendi):** SP2 lig planı yazılmadan önce iki kapı var: **Faz 0** (güven/doğruluk düzeltmeleri — TAMAMLANDI 2026-07-16) ve **Faz 1** (funnel telemetri + veri dili + küçük kullanıcı deneyi — `docs/superpowers/plans/2026-07-18-faz1-hazirlik.md`). **Faz 1'in KOD tarafı 2026-07-18'de tamamlandı** (11 task, final review "Ready to merge", main'e push, CI yeşil) — ama Faz 1'in asıl amacı olan GATE (10-15 kişilik GO/NO-GO deneyi, `docs/faz1-gonogo-runbook.md`) henüz ÇALIŞTIRILMADI; bu insan koordinasyonu gerektiriyor. SP2 planlaması, spec'in kendi mantığına göre, kod bitti diye değil bu deneyin GO/ITERATE/NO-GO hükmü çıkınca başlamalı.

> **Kapalı piyasada işlem — TAMAMLANDI (2026-07-21), prod'da canlı.** Midas 24/5 esinli "bekleyen emir" mekaniği: piyasa kapalı/veri bayatken emir her zaman kabul edilir, taze fiyat yoksa kuyruğa girer ve açılışı izleyen ilk taze fiyatta otomatik gerçekleşir (bakiye yetmezse iptal). Spec: `docs/superpowers/specs/2026-07-19-kapali-piyasa-islem-design.md`, plan: `docs/superpowers/plans/2026-07-19-kapali-piyasa-islem.md` (5 task, worktree'de subagent-driven-development). Bu, Faz 1'in GATE'inden bağımsız bir dilimdi — SP2 planlaması hâlâ GATE'i bekliyor, bu paragraf o beklemeyi değiştirmez.

### ANA PLAN (2026-07-04): Çok Kullanıcılı Yayın (Multiplayer Launch)
Onaylı spec: **`docs/superpowers/specs/2026-07-04-cok-kullanicili-yayin-design.md`** — hesaplı (Google + anonim misafir, linkIdentity ile yükseltme), haftalık ligli (**CANLI SEANS = lig**: Pazartesi 00:00 TSİ $1M reset, Cuma NYSE kapanışında kilit — DST-duyarlı, ABD tatil cumasında BIST 18:15; hafta sonu antrenman), kendi domaininde, Supabase Pro (eu-central-1) + Vercel Pro üzerinde, "olabilecek en güvenli" duruşla (GRANT+RLS çift katman, httpOnly cookie/PKCE, `getUser()` kuralı, Turnstile, sunucu damgalı fiyat + replay hile koruması, KVKK yurt dışı aktarım beyanı). Monetization launch sonrası; realtime etkileşim kapsam dışı.

Alt projeler:
- **SP0 Amerikan Borsası — TAMAMLANDI (2026-07-04), prod'da canlı.** Aranabilir katalog (48 hisse, `usStocks.ts`), DST-duyarlı NYSE seansı (`newYorkParts`+2026 tatil takvimi, gerçek tarayıcıda hafta sonu "KAPALI" doğrulandı), `activeUs`+`addUs` (addBist kalıbı), PriceList ABD sekmesi. Plan uygulaması sırasında 2 plan-dışı bug bulunup TDD ile düzeltildi: (1) `computeInitialActiveBist` US holding'i BIST'e sızdırıyordu (isBistLikeId CATALOG'da olmayan her id'yi BIST sayıyordu) → activeUs'teki id'ler hariç tutuldu; (2) `positions` derived'da holding etiketi US sembolde sembolün kendisine düşüyordu → `holdingLabel()` CATALOG→BIST100→US_STOCKS sırayla dener. Commit `eaa024e`..`42150cc` (11 commit), 438/438 test yeşil, Vercel prod deploy READY + 0 runtime error. Plan: `.claude/plans/amerikan-borsasi.md` (referans, arşivlendi).
- **SP3a Domain + KVKK taslakları** — paralel; domain ismi seçilecek (aday çalışması yapılacak). Google OAuth consent prod'u domain+gizlilik sayfası ister → SP1'den önce. Metinlere **"yatırım tavsiyesi değildir" disclaimer'ı** da dahil (gerçek piyasa verisiyle alım-satım gösteren üründe şart) (2026-07-07).
- **SP1 Hesap altyapısı — TAMAMLANDI + PROD'DA CANLI VE DOĞRULANDI (2026-07-08).** Google+anonim misafir auth, `profiles`/`saves` şeması (RLS+GRANT), takma ad doğrulama, bulut kayıt senkronu, KVKK hesap silme, `+page.svelte` boot kablolaması — hepsi subagent-driven-development ile TDD+review'dan geçti (9/9 task), 488/488 test yeşil. Final whole-branch review'da (opus) canlı DB testiyle kritik bir grant hatası bulundu ve düzeltildi (`supabase/migrations/0002_upsert_grants.sql`, commit `50f5693`).
  **Vercel env eklendi, deploy edildi — ardından 3 ayrı runtime-only hata bulunup düzeltildi** (hiçbiri vitest/svelte-check/build'de yakalanamazdı, yalnız gerçek Vercel serverless ortamında ortaya çıktı): Supabase client'ı her yerde arka planda bir RealtimeClient kuruyor, o da native WebSocket arıyor — Vercel'in bu proje için fiilen çalıştırdığı Node sürümü (proje ayarı 24.x olsa da) bunu sağlamıyor, üç ayrı çağrı noktası aynı sebeple çöküyordu: (1) `hooks.server.ts` (her istekte 500), (2) `+layout.ts`'in universal `load()`'u (SSR sırasında sunucuda da çalışıyor, isme rağmen), (3) `/api/account/delete`'in kendi admin `createClient()`'ı (kullanıcının GERÇEK hesap silme denemesinde yakalandı). Üçü de `ws` paketini transport olarak vererek düzeltildi (hiçbiri gerçekten bağlanmıyor, yalnız crash'i önlüyor) — commit'ler `0561cdc`, `832c0bc`, `c3966c9`. Ayrıca dördüncü bir hata: `+layout.svelte`'deki `onAuthStateChange` ayrım yapmadan her event'te `invalidate` çağırıyordu → `INITIAL_SESSION` event'i her yeni client'ta yeniden tetiklenip sonsuz döngü yaratıyordu (binlerce başarısız istek, local preview'da yakalandı, `INITIAL_SESSION` filtrelenerek düzeltildi, aynı commit `0561cdc`).
  **Sonuç:** kullanıcı prod'da gerçek bir hesap sildi, `POST /api/account/delete 200` loglarda doğrulandı — Task 9'un en riskli manuel kontrol maddesi fiilen geçti. `npm audit`'teki 10 zafiyet build/dev araçlarında (Vite/Vitest/SvelteKit adapter), prod koduna girmiyor; `ws` listede yok. Commit aralığı: `edba7bf`..`c3966c9` (19 commit), plan: `docs/superpowers/plans/2026-07-04-sp1-hesap-altyapisi.md`, üç WebSocket + döngü hatasının detaylı analizi bu sohbetin transkriptinde (kod içinde bir dosya izi yok, yalnız `ws` bağımlılığı + inline yorum satırları var).
  **Kalanlar:** Task 9'un geri kalan manuel maddeleri (Google bağlama gerçek OAuth akışı, çapraz-kullanıcı RLS impersonate testi — hesap silme test edildiği için düşük öncelik). Ertelenen küçük bulgular: `.superpowers/sdd/progress.md`'de.
- **SP2 Haftalık lig** — planı bilinçli yazılmadı (SP0+SP1 merge olmadan yazılırsa çürür); onlar bitince kısa güçlü-model oturumunda yazılacak. 30-gün anonim hesap temizliği de SP2'de.
- **SP3b Yayın cilası + işe-alım vitrini (2026-07-07 genişletildi)** — paylaşım kartı (hafta kapanışı "mahkeme beratı"nı LLM'le kişiselleştirilmiş satirik metne çevirme fikri eklendi — tek completion, agent sistemi DEĞİL; bilinçli anlatı parçası), landing/OG, Sentry, güvenlik başlıkları, `/api/yahoo` CDN cache. Vitrin eklemeleri:
  - **E2E Playwright critical path** (onboarding → işlem → hafta kapanışı) — "test disiplini" iddiasının dürüstlük ön koşulu.
  - **GitHub Actions CI** (test + check + README rozeti) — bağımsız/blokersiz, istenirse SP1'den önce bile öne çekilebilir.
  - **Erişilebilirlik geçişi** — renk-körü dostu K/Z sinyali (renk + işaret), kontrast/küçük font denetimi; çözülmeyenler "bilinen sınırlama + plan" olarak belgelenir.
  - ~~**Funnel/retention analytics**~~ — **YAPILDI (Faz 1, 2026-07-18):** `visit → first_trade` + D1, `telemetry_events` tablosu + ham SQL sorguları. Landing-page ölçümü bilinçli olarak kapsam dışı bırakıldı (KVKK + N=10-15'te gürültü/altyapı maliyeti gerekçesiyle, spec'te belgeli).
  - **README + mimari diyagram** — mevcut spec/plan dosyalarından vitrine derleme; Monte Carlo winnability simülasyonu anlatının merkezine.
  - **LinkedIn postu bunlardan ve lig canlıya çıktıktan SONRA** (tek atımlık dikkat hakkı "oyna" linksiz harcanmaz).

Süreç anlaşması: uygulama oturumları **Sonnet** + dilim başına bir oturum; spec/plan/güvenlik-review güçlü modelde (auto-memory: `feedback_model_oturum_ekonomisi`). Emlak tarihçesi: süper sade dilim tamamlandı (`b33d673`), sonra gizlendi (`02df9fc`) — kod/test duruyor, istenmeden açılmayacak.

### Ara Faz: 52 Haftalık "Vasiyet Seferi" Kampanya Modu (v2.4.0)
* **Tarihsel Kampanya:** Oyunun 365 günlük tycoon yapısını korumak amacıyla, Mayıs 2025 - Mayıs 2026 arasındaki 1 yıllık gerçek verileri ve haftalık gerçek haber başlıklarını ön-paketleyen statik veri modeli (`macroData.js`). 
* **Backlog (2026-07-05):** `tests/balance/winnability.test.ts` (1000 seed Monte Carlo, quant-analyst ajanı ile yazıldı) dengeli stratejinin %30-70 hedefine girdiğini doğruladı, ama gerçek bir kalibrasyon açığı da ortaya çıkardı: mevduat (%42 nominal) hiçbir seed'de agresif (BIST+kripto) stratejiye kaybetmiyor — conservative'in en kötü senaryosu (~$1.22M) aggressive'in en iyisini (~$1.10M) geçiyor, yani risk almanın karşılığı yok. Kök neden: BIST/kripto volatilitesi kalibre edilirken drift'leri sabit/düşük bırakıldı, mevduat faizine hiç dokunulmadı. VASİYET aktif moda dönünce ele alınacak (depositAnnualRate düşür ve/veya BIST-kripto drift yükselt).

### Faz 1: "Canlı Seans Mücadelesi" Modu (v3.0.0) [TAMAMLANDI]
* **API Entegrasyonu (Yerel Proxy):** Binance API'leri (Kripto) ve yerel Node.js proxy sunucusu (`server.js` - Yahoo Finance entegrasyonlu) ile gerçek zamanlı BIST 100 ve Gram Altın fiyatlarının çekildiği mod. Rate-limit koruması için 5s caching ve ağ kesilmelerinde drift simülasyonuna geçiş yapan graceful fallback mekanizması kurulmuştur.

### Faz 2: Tarihsel Senaryo Paketleri (Speedrun Scenarios)
* **2001 Kriz Paketi:** Gecelik faizlerin %7500'e çıktığı, dolar kurunun bir günde ikiye katlandığı tarihi 2001 krizinde hayatta kalma mücadelesi.
* **2018 Kur Şoku:** Rahip Brunson krizi ve kur atakları döneminde döviz sepetini koruma testi.

### Faz 3: Sosyal ve Rekabetçi Katman
> 2026-07-03: Günlük Challenge yerine **Haftalık sezon ligi** seçildi (yukarıdaki Aktif Plan #2) — canlı piyasada tek gün çok kısa/şanslı kalıyordu.
* ~~Günlük Mücadele (Daily Challenge)~~ → Haftalık sezon ligi (ANA PLAN SP2).
* **Skor Paylaşımı:** Twitter (X) entegrasyonlu komik mahkeme beratı paylaşım görselleri üretmek (ANA PLAN SP3b).

### Faz 4: Altyapı ve Kapsam Genişletme → ANA PLAN'a dönüştü (2026-07-04)
Supabase geçişi + gerçek kullanıcı hesapları + Amerikan borsası artık yukarıdaki ANA PLAN'ın alt projeleri (SP1/SP0). Detay spec'te.

---

## 5. Geliştirme Organizasyonu (Miras Simülasyon A.Ş.)

Projeyi koordine etmek, en yüksek kalitede kod yazmak ve matematiksel dengeyi korumak amacıyla kurulan yapay zeka departmanları:
* **Genel Müdür & Baş Mimar (Antigravity):** Proje koordinasyonu, departmanlar arası entegrasyon ve sürüm yönetimi.
* **📈 Quant & Veri Departmanı (`quant_analyst`):** Finansal matematik, kur/borsa modelleri ve 2026/tarihsel veri entegrasyon senaryoları.
* **🎨 Arayüz Tasarım & Frontend Departmanı (`frontend_dev`):** Tailwind CSS, Bloomberg Terminal tasarımı, HTML5 canvas grafikleri ve ses sentezleme.
* **🔍 Kalite Güvence & Test Departmanı (`qa_engineer`):** Sentaks kontrolleri, oyun test profilleri ve dengeleme simülasyonları.
* **💻 Chief Technology Officer (`cto`):** Teknik kısıtlamalar, CORS çözümleri, performans optimizasyonu ve mimari denetim.
* **📢 Marketing & Growth Departmanı (`cmo_marketing`):** Viral büyüme döngüleri, sosyal paylaşım dili (memes) ve haber mizah tonu.
* **📋 Product Owner (`product_owner`):** Backlog yönetimi, kullanıcı hikayeleri (user stories), özellik önceliklendirmesi ve Definition of Done denetimi.
* **⚖️ Hukuk Müşaviri (`legal_consultant`):** Mahkeme celpleri, rüşvet ve vergi mekaniklerinin satirik-hukuki incelemesi ve yasal sorumluluk reddi beyanları.
* **🔊 Ses Tasarımcısı (`sound_designer`):** Web Audio API tabanlı 8-bit retro ses motoru mimarisi, tuş sesleri ve atmosferik terminal efektleri.

---

## 6. Son Oturum Geliştirme Özeti & Kaldığımız Yer (2026-07-25 — 26. oturum, **FAZ 1 GATE İPTAL + SP2a LİG ÇEKİRDEĞİ PLANI YAZILDI** — Opus, kod yazılmadı)

> Her "s" (save) komutunda bu bölüm üzerine yazılır (kümülatif değil). Önceki oturum özeti (25. — grafik hover "yükleniyor" döngüsü fix'i) için: `git show <bu commit'in bir öncesi>:memory.md`.

### A. Bu Oturumda Alınan Kararlar

1. **Faz 1'in GATE'i İPTAL EDİLDİ.** Kurucu: *"Faz 1'deki kişi testlerini unutalım."* 10-15 kişilik GO/NO-GO deneyi (`docs/faz1-gonogo-runbook.md`) çalıştırılmayacak — dosya silinmedi, sadece rafta. Bu, 22. oturumdan beri SP2'yi bekleten TEK blokerdi. Kayıp "ölçüm" değil "lig öncesi ön-doğrulama": Faz 1'in kod tarafı zaten prod'da (`telemetry_events` funnel verisi topluyor).
2. **SP2 ikiye bölündü** (`writing-plans` skill'inin scope check'i gereği): **SP2a lig çekirdeği** (bu oturumda planlandı) + **SP2b lig vitrini** (kendi planını bekliyor).
3. **Üç tasarım kararı kurucuya soruldu, üçünde de öneri kabul edildi:**
   - *Skor otoritesi:* sunucu damgalı işlem + kapanış replay'i. `saves` payload'u skorda HİÇ kullanılmaz (payload'u DevTools'tan düzenlemek skoru değiştiremez).
   - *Lig kapsamı:* yalnız alım-satım (BIST + ABD + kripto + emtia/döviz). **Mevduat ve emlak skora girmez** — replay deterministik kalsın diye.
   - *Oyun/lig ilişkisi:* CANLI SEANS = lig; pazartesi 00:00 TSİ herkes $1M'a döner, ayrı slot yok. Hafta sonu antrenman.

### B. Üretilen Artefakt

**`docs/superpowers/plans/2026-07-25-sp2a-lig-cekirdegi.md`** — 15 task + manuel Task 0. Mimari: her lig işlemi `/api/trade`'e gider, sunucu fiyatı kendi proxy kaynağından çeker, `trades`'e insert-only yazar, damgalı fiyatı yanıtta döner; istemci O fiyatla kendi state'ini günceller (ekran = otorite). Kapanışta replay **istemcinin çalıştırdığı aynı `buyAsset`/`sellAsset` reducer'larıyla** koşar — yuvarlama paritesinin tek garantisi bu.

Kilit tasarım noktaları (plan içinde gerekçeleriyle):
- `trades`'e `authenticated` INSERT **verilmiyor**; yalnız `service_role` yazar. Hile koruması GRANT katmanında, UI'da değil.
- **Kapanış replay'i nihai otorite** — `/api/trade`'in bakiye kontrolü teorik olarak yarışabilir, replay bakiyeyi aşan işlemi reddedip skordan düşürür.
- Cron: Vercel DEĞİL **pg_cron + pg_net**, `*/5 * * * *`, sırlar Supabase Vault'ta (Vercel Pro alınmadı; Hobby günde 1 cron veriyor). Bedeli: bekleyen emir açılıştan en geç 5 dk sonra dolar.
- Bekleyen emirler ligde **sunucuda** settle edilir; yerel `settlePendingOrders` lig modunda tamamen devre dışı (yoksa aynı emir iki yerde dolardı — çift işlem).
- Lig modu `isLeagueActive: () => boolean` getter'ıyla reaktif okunur: store `+page.svelte:97`'de SENKRON kuruluyor, katılım ASENKRON yükleniyor.
- **3 bilinçli CLAUDE.md esnetmesi** planda ayrı bölümde listeli: service-role client, `domain/league` → `stores/gameState` importu, async işlem yolu.

**Self-review 4 gerçek hata yakaladı ve düzeltti** (skill'in self-review adımı boş tik değildi): uydurulmuş E2E helper adı (`registerAndSignIn` yok), `baseOpts` yok (`setup(overrides)` var), senkron store kurulumuyla çelişen "önce await" talimatı, ölü değişken.

### C. Blokerler & Kalan İşler
- **SP2a uygulaması bekliyor** — ayrı Sonnet oturumu, `subagent-driven-development`. Başlangıç komutu §D'de.
- **Task 0 kurucuda:** Vercel'e `CRON_SECRET`, Supabase Vault'a `league_tick_url` + `league_cron_secret`. Task 1-9 ve 11-15 bunsuz ilerler; yalnız Task 10'un doğrulaması bekler.
- **SP2b planı yazılmadı:** leaderboard UI, hafta geri sayımı, geçen hafta arşivi, paylaşım kartı, küfür filtresi, 30-gün anonim temizliği, `/api/trade` Turnstile. Plan sonunda listeli.
- **Bilinen kayıp:** Task 13'ün haftalık reset'i geçen haftanın sonucunu sessizce siliyor — arşivleme SP2b'ye kadar yok.
- ABD borsası gece piyasası: açık soru daraldı. Kapalı piyasada bekleyen emir 21 Temmuz'da çıktı (kuyruk → açılışta dolar); gerçek extended-hours FİYATI (`includePrePost=true`) kodda hiç yok (grep'le doğrulandı). Soru artık "kuyruk yeterli mi, yoksa gece gerçek fiyattan işlem mi?" — ve ligle etkileşiyor (arbitraj yüzeyi).
- Ertelenmiş güvenlik: B2 (rate-limit), B5 (CSP script-src) kendi planlarını bekliyor. SP3a (domain + KVKK) hâlâ Google OAuth prod consent'inin ön koşulu.

### D. Yeni Chat'te Başlangıç Rehberi
1. **Uygulama oturumu (Sonnet) için komut:** *"`docs/superpowers/plans/2026-07-25-sp2a-lig-cekirdegi.md` planını subagent-driven-development ile uygula. Task 0 manuel (Vercel CRON_SECRET + Supabase Vault) — kurucu yapacak, sen Task 1'den başla."*
2. SP2 artık HİÇBİR ŞEYİ beklemiyor — GATE iptal, SP0/SP1/SP1.5/E2E hepsi canlı. Eski "GATE'i bekliyor" ifadesi geçersiz.
3. Migration'lar 0001-0007 lokal+prod senkron; 0008/0009 planda, henüz yazılmadı.
4. Emlak gizli; mevduat duruyor ama **lig skoruna girmiyor** (bilinçli).
5. **"s" kısayolu:** kullanıcı "s" yazarsa: git durumu kontrol + commit/push + bu bölümü (6) o oturum özetiyle güncelle.
