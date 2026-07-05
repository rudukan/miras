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

### ANA PLAN (2026-07-04): Çok Kullanıcılı Yayın (Multiplayer Launch)
Onaylı spec: **`docs/superpowers/specs/2026-07-04-cok-kullanicili-yayin-design.md`** — hesaplı (Google + anonim misafir, linkIdentity ile yükseltme), haftalık ligli (**CANLI SEANS = lig**: Pazartesi 00:00 TSİ $1M reset, Cuma NYSE kapanışında kilit — DST-duyarlı, ABD tatil cumasında BIST 18:15; hafta sonu antrenman), kendi domaininde, Supabase Pro (eu-central-1) + Vercel Pro üzerinde, "olabilecek en güvenli" duruşla (GRANT+RLS çift katman, httpOnly cookie/PKCE, `getUser()` kuralı, Turnstile, sunucu damgalı fiyat + replay hile koruması, KVKK yurt dışı aktarım beyanı). Monetization launch sonrası; realtime etkileşim kapsam dışı.

Alt projeler:
- **SP0 Amerikan Borsası — TAMAMLANDI (2026-07-04), prod'da canlı.** Aranabilir katalog (48 hisse, `usStocks.ts`), DST-duyarlı NYSE seansı (`newYorkParts`+2026 tatil takvimi, gerçek tarayıcıda hafta sonu "KAPALI" doğrulandı), `activeUs`+`addUs` (addBist kalıbı), PriceList ABD sekmesi. Plan uygulaması sırasında 2 plan-dışı bug bulunup TDD ile düzeltildi: (1) `computeInitialActiveBist` US holding'i BIST'e sızdırıyordu (isBistLikeId CATALOG'da olmayan her id'yi BIST sayıyordu) → activeUs'teki id'ler hariç tutuldu; (2) `positions` derived'da holding etiketi US sembolde sembolün kendisine düşüyordu → `holdingLabel()` CATALOG→BIST100→US_STOCKS sırayla dener. Commit `eaa024e`..`42150cc` (11 commit), 438/438 test yeşil, Vercel prod deploy READY + 0 runtime error. Plan: `.claude/plans/amerikan-borsasi.md` (referans, arşivlendi).
- **SP3a Domain + KVKK taslakları** — paralel; domain ismi seçilecek (aday çalışması yapılacak). Google OAuth consent prod'u domain+gizlilik sayfası ister → SP1'den önce.
- **SP1 Hesap altyapısı** — plan HAZIR: `docs/superpowers/plans/2026-07-04-sp1-hesap-altyapisi.md` (10 task, tam kodlu). **Bloker: Supabase Pro satın alımı** (free slotlar dolu, "yakında").
- **SP2 Haftalık lig** — planı bilinçli yazılmadı (SP0+SP1 merge olmadan yazılırsa çürür); onlar bitince kısa güçlü-model oturumunda yazılacak. 30-gün anonim hesap temizliği de SP2'de.
- **SP3b Yayın cilası** — paylaşım kartı, landing/OG, Sentry, güvenlik başlıkları, `/api/yahoo` CDN cache.

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

## 6. Son Oturum Geliştirme Özeti & Kaldığımız Yer (2026-07-04 — 3. oturum, SP0 uygulama)

> Her "s" (save) komutunda bu bölüm üzerine yazılır (kümülatif değil). Önceki oturum özeti için git geçmişine bak (`git show be04437:memory.md`).

### A. Bu Oturumda Tamamlananlar
1. **SP0 Amerikan Borsası uygulandı ve prod'a çıktı.** `.claude/plans/amerikan-borsasi.md`'deki 12 dosyalık plan Sonnet oturumunda TDD ile baştan sona yürütüldü (11 commit, `eaa024e`..`42150cc`), 438/438 test yeşil, `svelte-check` 0 hata. Plan'ın öngörmediği 2 bug bulunup düzeltildi: (1) `computeInitialActiveBist` bir US holding'ini BIST'e sızdırıyordu (isBistLikeId CATALOG'da olmayan her id'yi BIST sayıyordu) → activeUs'teki id'ler hariç tutuldu; (2) `positions` derived'da US holding etiketi sembolün kendisine düşüyordu → `holdingLabel()` (CATALOG→BIST100→US_STOCKS) eklendi. Gerçek tarayıcıda uçtan uca doğrulandı: arama→ekle→gerçek canlı AAPL fiyatı→al (net servet korunuyor)→yenile→kalıcılık sağlam. Vercel prod deploy READY + 0 runtime error.
2. **Kullanıcı raporu: "tüm amerikan borsası yok galiba" → tanı workflow'u (4 paralel ajan) → kök neden bulundu.** Kod prod'da gerçekten vardı (fetch ile doğrulandı, Vercel alias doğruydu) — sorun `activeUs`'un sabit varsayılan taşımaması + boş durumda "Sonuç bulunamadı" mesajının başarısız aramayla ayırt edilemez olmasıydı (özellik var ama keşfedilemiyordu). Düzeltme: "ABD BORSASI" sekmesi boşken "Henüz ABD hissesi eklemedin — ör. AAPL, Tesla, Microsoft yaz ve ekle" ipucu (commit `fdc756e`, prod'da READY, 0 runtime error).
3. **Kullanıcı asıl demek istediğini netleştirdi: "vertiv (VRT) gibi bazı hisseler yok"** — yani özellik değil, statik 48'lik kataloğun KAPSAMI eksik (ABD borsasında binlerce hisse var). Yahoo Finance'in canlı arama API'si (`query1.finance.yahoo.com/v1/finance/search?q=...`) curl ile doğrulandı — VRT'yi doğru buluyor (NYSE, Vertiv Holdings Co). **AÇIK KARAR (kullanıcı henüz seçmedi, "kaydedelim sonra devam ederiz" dedi):** statik listeyi genişletmek (hızlı, kalıcı değil) mi, yoksa Yahoo canlı arama API'sine bağlanıp gerçek kapsamlı arama kurmak (biraz daha iş, kalıcı çözüm — BIST'teki gibi bir daha "bu hisse yok" şikayeti gelmez) mi?

### B. Operasyonel Ders (yeni)
Bu proje aynı anda birden fazla oturumda/pencerede açık olabiliyor ve `npm run dev` port 5173'ü paylaşıyor. `.claude/launch.json`'a `autoPort:true` eklendi (port çakışmasında otomatik farklı port). **Dikkat:** aynı origin'i paylaşan iki tarayıcı sekmesi AYNI localStorage'ı paylaşır — kullanıcı canlı test ederken otomasyonla `localStorage.clear()`/`location.reload()` çağırmak onun oturumunu bozar. Bu oturumda böyle bir çakışma yaşandı (kullanıcının INTC/AAPL test alımları benim otomasyonumla karıştı) — fark edilince otomasyon durduruldu, doğrulama sunulan bundle'ı `curl` ile grep'lemeye kaydırıldı (DOM'a dokunmadan).

### C. Blokerler & Paralel İşler
- **Supabase Pro satın alımı** ("yakında") → SP1'in tetiği. Alınınca ilk iş SP1 planındaki Task 0 (proje kurulumu eu-central-1, Google OAuth client, Turnstile) — kullanıcı aksiyonları.
- **Domain ismi yok** → SP3a: aday çalışması + müsaitlik kontrolü; Google OAuth consent prod'unun ön koşulu.
- **ABD hisse kataloğu kapsam kararı** (yukarı A.3) — sonraki oturumun ilk işi bu kararı almak.

### D. Değişiklik Geçmişi
Aylık tema-bazlı özet `CHANGELOG.md`'de birikiyor (bu bölümün aksine üzerine yazılmaz, rutin "s" akışında dokunulmaz).

### E. Yeni Chat'te Kaldığımız Yerden Başlangıç Rehberi
1. **Nasıl çalıştırılır:** `npm run dev` (Vite/SvelteKit, `http://localhost:5173`, port doluysa autoPort farklı port verir).
2. **Doğrulama:** `npm run test` (Vitest) + `npm run check` (svelte-check) + `npm run build`. Windows'ta adapter-vercel'in son adımında symlink EPERM hatası bilinen ve kabul edilen bir durum.
3. **Sıradaki adım: ABD hisse kataloğu kapsam kararı (yukarı A.3).** Kullanıcıya sor: "canlı arama" (Yahoo search API, kalıcı) mı "liste genişlet" (hızlı yama) mı? Karar netleşince uygula. Ardından: Supabase Pro alınınca SP1 (`docs/superpowers/plans/2026-07-04-sp1-hesap-altyapisi.md`, önce Task 0); SP3a (domain+KVKK) paralel başlanabilir. Emlak gizli kaldı, açıkça istenmeden dönülmeyecek.
4. **"s" kısayolu:** Oturum sonunda kullanıcı **"s"** yazarsa: git durumu kontrol et (commit/push gerekiyorsa yap), bu bölümü (6) o oturumun özetiyle güncelle.

