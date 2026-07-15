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

#### A. Tarihsel Veri Seti (Jan 2024 - Jan 2025)
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

> **Kapı güncellemesi (2026-07-15, dış audit + kurucu onayı):** SP2 lig planı yazılmadan önce iki kapı var: **Faz 0** (güven/doğruluk düzeltmeleri — `docs/superpowers/plans/2026-07-15-faz0-guven-duzeltmeleri.md`) ve **Faz 1** (funnel + drift temizliği + küçük kullanıcı deneyi). Yeni özellik genişletmesi bu iki kapı kapanana dek dondu.

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
  - **Funnel/retention analytics** — landing → ilk işlem → D1/D7 dönüş; mevcut `/api/telemetry` üstüne kurulabilir.
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

## 6. Son Oturum Geliştirme Özeti & Kaldığımız Yer (2026-07-15 — 17. oturum, FAZ 0 UYGULAMASI BAŞLADI — YARIM, DEVAM EDECEK)

> Her "s" (save) komutunda bu bölüm üzerine yazılır (kümülatif değil). Önceki oturum özeti (16. — dış audit değerlendirmesi + Faz 0 planı) için: `git show 274b7c3:memory.md`.

### A. Bu Oturumda Tamamlananlar
1. **Faz 0 uygulaması başladı** — izole worktree kuruldu: `.claude/worktrees/faz0-guven-duzeltmeleri` (branch `worktree-faz0-guven-duzeltmeleri`), superpowers:subagent-driven-development ile `docs/superpowers/plans/2026-07-15-faz0-guven-duzeltmeleri.md` koşuluyor. **Henüz main'e merge edilmedi, worktree hâlâ açık.**
2. **Pre-flight scan:** planın dosya/satır referansları HEAD'e karşı tek tek doğrulandı — şaşırtıcı derecede isabetli çıktı. Tek sapma: Task 7'nin önerdiği `createKeyedTtlCache` ismi, `src/lib/api/keyedTtlCache.ts`'teki mevcut ve alakasız (senkron get/set, `/api/usSearch` için) bir cache ile çakışıyordu → `createKeyedTtlFetchCache` olarak yeniden adlandırıldı (ledger'da not var).
3. **Task 1 (`createSavesPusher`) TAMAMLANDI** — implement (sonnet) + review (sonnet), ilk turda onaylandı. Commit `877d632`.
4. **Task 2 (`fire()` requeue) TAMAMLANDI** — implement (haiku) + review (sonnet) döngüsünde review gerçek bir P0-sınıfı bug yakaladı: `cancel()`, uçuştaki (in-flight) başarısız bir push ile aynı ana denk gelirse iptal edilen envelope'u diriltebiliyordu — `handleResetSave`'in az önce sildiği bulut kaydını, kaçak bir `visibilitychange` flush'ı geri yazabilirdi (tam da audit'in hedeflediği "sessiz veri dirilmesi" sınıfı, ve doğrudan planın kendi referans koduna izleniyor — implementer hatası değil). Kurucuya soruldu, onaylanan generation-flag (`cancelled`) fix'i uygulandı, re-review onayladı. Commit'ler `98ad484`, `fca2bf1`.
5. **Task 3 YARIM KALDI** — implementer subagent `+page.svelte` kablolamasını doğru yaptı (plana birebir uygun, `data` prop gölgelenmesi düzeltmesi dahil — bkz. task-3-brief.md) ama oturum token limiti nedeniyle kullanıcı burada durdurdu. **Bu değişiklik worktree'de UNCOMMITTED duruyor** (`git diff src/routes/+page.svelte` ile görünür) — henüz test/check/build/smoke/review'dan geçmedi. Sonraki oturum ya bu diff'i doğrulayıp commit'e taşımalı ya da (güvenmiyorsa) sıfırdan Task 3'ü tekrar dispatch etmeli.
6. Maliyet gözlemi: Task 1 (~176K token, tam mekanik/plan-verilmiş bir task için) ve Task 2 (~407K token, fix döngüsü dahil) — kullanıcıyla konuşuldu, mekanik task'larda (2, 3, 9, 11, 12) implementer'ı haiku'ya düşürme kararı alındı (review rigor'u etkilemez, yalnız implementer model tier'ı).

### B. Blokerler & Kalan İşler
- **Faz 0 devam ediyor** — worktree açık, ledger güncel: `.claude/worktrees/faz0-guven-duzeltmeleri/.superpowers/sdd/progress.md` (Task 1-2 detayları, pre-flight notu). Devam: worktree'ye gir → ledger'ı oku → Task 3'ün uncommitted diff'ini doğrula (test/check/build/smoke) → commit → review → Task 4 (E2E signout-persistence) → ... → Task 13 → final whole-branch review → preview smoke → finishing-a-development-branch (merge kararı kurucuyla).
- Task 10 hâlâ Task 5'in `nowMsTick`'ine bağımlı — sıra (1→13) korunmalı.
- **Lokal Supabase stack bu oturumda durduruldu** (`npx supabase stop`, veri Docker volume'ünde duruyor). Task 4/13 E2E için tekrar gerekecek: **ANA checkout'tan** `npx supabase start` (worktree içinden DEĞİL — bkz. `[[worktree-oturum-notlari]]`, bind-mount kilidi riski).
- **Faz 1 planı Faz 0 bitince** (kısa güçlü-model oturumu): funnel telemetri olayları, README/AGENTS/`.codex` drift temizliği, veri metodolojisi dili, 10-15 kişilik deney + GO/NO-GO eşikleri.
- **SP2 lig planı Faz 0+1 kapılarından SONRA** (audit hükmü, kurucu onaylı). ABD hissesi grafik dilimi ayrı (bilinen sınırlama). B2 rate-limit + B5 CSP kendi planlarını bekliyor.

### C. Değişiklik Geçmişi
Aylık özet `CHANGELOG.md`'de (üzerine yazılmaz, rutin "s"te dokunulmaz).

### D. Yeni Chat'te Başlangıç Rehberi
1. **Faz 0 worktree'sine dön:** `.claude/worktrees/faz0-guven-duzeltmeleri` (branch `worktree-faz0-guven-duzeltmeleri`) — silinmedi, açık. `git status` ile Task 3'ün uncommitted `+page.svelte` diff'ini kontrol et.
2. **Çalıştırma:** `npm run dev` (`http://localhost:5173`). E2E: Docker açık → ANA checkout'tan `npx supabase start` → worktree'den `npm run e2e`. NOT: `.env.local`'daki `PUBLIC_SUPABASE_URL` PROD'u gösteriyor — `npm run dev`'de manuel kayıt GERÇEK prod kullanıcısı yaratır.
3. **Doğrulama:** `npm run test` + `npm run check` + `npm run build` + `npm run e2e` (sabit sayı yazma).
4. **Güvenlik durumu:** pre-launch P0/P1 tümü kapalı (14. oturum); değişmedi.
5. **Sıradaki adım: FAZ 0'A DEVAM** — Task 3'ün yarım kalan diff'inden başla (yukarıya bak), sonra Task 4→13, final review, smoke, merge kararı. Sonra Faz 1 planı (güçlü model), sonra SP2.
6. Emlak gizli; yeni yatırım aracı yok (lig verisi gelmeden).
7. **"s" kısayolu:** kullanıcı "s" yazarsa: git durumu kontrol + commit/push + bu bölümü (6) o oturum özetiyle güncelle.
