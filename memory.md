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
* Emlak/tapu/rüşvet, vergi denetimi, Tech Agent — **henüz yok** (bkz. yukarıdaki not).

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

> **Öncelik notu (2026-07-02):** Aktif geliştirme odağı CANLI SEANS'ın veri doğruluğuna kaydı. VASİYET SEFERİ + Faz 2 (2001 Kriz, 2018 Kur Şoku) aşağıda roadmap'te duruyor ama aktif çalışma yok — kullanıcı açıkça istemedikçe bu modlara dokunulmuyor.

### Ara Faz: 52 Haftalık "Vasiyet Seferi" Kampanya Modu (v2.4.0)
* **Tarihsel Kampanya:** Oyunun 365 günlük tycoon yapısını korumak amacıyla, Mayıs 2025 - Mayıs 2026 arasındaki 1 yıllık gerçek verileri ve haftalık gerçek haber başlıklarını ön-paketleyen statik veri modeli (`macroData.js`). 

### Faz 1: "Canlı Seans Mücadelesi" Modu (v3.0.0) [TAMAMLANDI]
* **API Entegrasyonu (Yerel Proxy):** Binance API'leri (Kripto) ve yerel Node.js proxy sunucusu (`server.js` - Yahoo Finance entegrasyonlu) ile gerçek zamanlı BIST 100 ve Gram Altın fiyatlarının çekildiği mod. Rate-limit koruması için 5s caching ve ağ kesilmelerinde drift simülasyonuna geçiş yapan graceful fallback mekanizması kurulmuştur.

### Faz 2: Tarihsel Senaryo Paketleri (Speedrun Scenarios)
* **2001 Kriz Paketi:** Gecelik faizlerin %7500'e çıktığı, dolar kurunun bir günde ikiye katlandığı tarihi 2001 krizinde hayatta kalma mücadelesi.
* **2018 Kur Şoku:** Rahip Brunson krizi ve kur atakları döneminde döviz sepetini koruma testi.

### Faz 3: Sosyal ve Rekabetçi Katman
* **Günlük Mücadele (Daily Challenge):** Her sabah saat 10:00'da tüm oyunculara aynı piyasa verileri ve 1M USD verilir. Liderlik tablosu güncellenir.
* **Skor Paylaşımı:** Twitter (X) entegrasyonlu komik mahkeme beratı paylaşım görselleri üretmek.

### Faz 4: Altyapı ve Kapsam Genişletme (sinyal var, iş başlamadı)
* **Supabase geçişi:** Firebase (anon auth + Firestore) yerine Supabase — muhtemelen gerçek kullanıcı hesapları (Faz 3'ün ötesinde, Supabase Auth) ile birlikte gelir.
* **Gerçek kullanıcı hesapları:** Anonim auth'tan kayıtlı kullanıcıya geçiş — olumlu geri bildirim aldığı izlenimi var.
* **Amerikan borsası:** S&P 500/NASDAQ hisseleri yeni varlık sınıfı olarak. Muhtemel entegrasyon noktası: mevcut `/api/yahoo` proxy kalıbı + `liveAssets.ts` kataloğu (Yahoo Finance ABD hisselerini de destekliyor).

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

## 6. Son Oturum Geliştirme Özeti & Kaldığımız Yer (2026-07-02)

> Bu bölüm en son 2026-05-24'te güncellenmişti (o zamanki v3.1.0 legacy vanilla-JS mimarisini anlatıyordu — bkz. Bölüm 2'deki güncelleme notu). Aradan geçen sürede proje SvelteKit'e tamamen yeniden yazıldı; bu bölüm artık bugünkü oturumu anlatıyor ve her "s" (save) komutunda üzerine yazılır.

### A. Bu Oturumda Tamamlananlar
1. **Ürün önceliği netleşti:** VASİYET SEFERİ + Faz 2 senaryoları roadmap'te duruyor ama aktif geliştirme durduruldu — tüm efor CANLI SEANS'ın veri doğruluğuna gidiyor (bkz. Bölüm 4).
2. **Eşikli mühür (günlük kur):** `ensureSeal()` artık canlı kur mühürden %0.75'ten fazla saparsa aynı gün (dateKey değişmeden) de reseal ediyor — küçük tik gürültüsünde net servet sakin kalır, gerçek bir kur hareketinde (ör. MB kararı) ertesi günü beklemeden aynı gün yakalanır. Kullanıcıya iki senaryo (gürültü vs gerçek hareket) grafikle karşılaştırılıp onay alındı.
3. **Kripto cold-start fix:** Binance WS ilk poll yanıtından önce bağlanırsa, düşük hacimli coin'ler (ör. AVAX) ilk trade tick'ine kadar fiyatsız kalıp alım reddediliyordu. Poll snapshot'ı artık yalnız henüz hiç fiyatı olmayan coin'leri tohumluyor.
4. **Al/Sat miktar girişi okunaklılığı:** Adet/Tutar alanları yazarken binlik virgülüyle canlı gruplanıyor (62,161,390 gibi uzun sayılar artık okunuyor), imleç konumu korunuyor. 4 saf fonksiyon TDD ile eklendi (`format.ts`).
5. **Küçük düzeltmeler:** eksik favicon (prod'da 404 düşüyordu) eklendi; İŞLEM PANELİ yazım hatası + tek a11y uyarısı giderildi (`svelte-check` 0/0).
6. Backlog'da commit'lenmemiş iki tamamlanmış plan dokümanı (cüzdan/net servet UX, günlük mühürlü kur) commit'lendi.
7. Her şey test edildi (391/391 birim test yeşil), typecheck temiz, prod'a push'landı ve deploy doğrulandı (miras-one.vercel.app, commit cc4f0e7).
8. `CHANGELOG.md` oluşturuldu — aylık/tema-bazlı geliştirme özeti artık orada birikiyor (bkz. Bölüm 6.C).
9. Market grafik pop-up'una pozisyon maliyeti + K/Z satırı eklendi ("Maliyet: $X/adet · +-Y (%)"), WalletSummary'deki aynı `positionPnl`/`pnlClass` helper'larıyla — yeni domain mantığı yok.

### B. Yakın Dönem Sinyaller (henüz iş başlamadı — bkz. Bölüm 4 Faz 4)
Supabase geçişi, gerçek kullanıcı hesapları, Amerikan borsası. Açıkça istenmeden büyük mimari değişikliğe girişilmeyecek.

### C. Değişiklik Geçmişi
Aylık tema-bazlı özet artık `CHANGELOG.md`'de birikiyor (bu bölümün aksine üzerine yazılmaz). Bu dosya (Bölüm 6) hep yalnız SON oturumu tutar — küçük kalır.

### D. Yeni Chat'te Kaldığımız Yerden Başlangıç Rehberi
1. **Nasıl çalıştırılır:** `npm run dev` (Vite/SvelteKit, `http://localhost:5173`) — legacy `node server.js` artık geçerli değil.
2. **Doğrulama:** `npm run test` (Vitest) + `npm run check` (svelte-check) + `npm run build`. Windows'ta adapter-vercel'in son adımında symlink EPERM hatası bilinen ve kabul edilen bir durum (Vercel'in kendi Linux build'inde sorun çıkarmıyor).
3. **Sıradaki olası adımlar:** CANLI SEANS'ın veri kapsamını/doğruluğunu artırmaya devam (ör. market pop-up grafiğinin görsel güncellemesi — kullanıcı "sonra" dedi, henüz iş açılmadı), ya da B'deki sinyallerden biri somutlaşırsa oradan devam.
4. **"s" kısayolu:** Oturum sonunda kullanıcı **"s"** (Save) yazarsa: git durumu kontrol et (commit/push gerekiyorsa yap), bu bölümü (6) o oturumun özetiyle güncelle.

