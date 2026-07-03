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

### Aktif Plan: Oyun Derinliği + Bağımlılık Katmanı (2026-07-03 karar)
CANLI SEANS içinde veri doğruluğundan sonraki adım: oyunu geri-dönüş sebebi olan bir "oyun" yapmak. Süreç kuralı basit tutulacak — **küçük dilim → bitir → deploy → sonraki**, her dilim kendi mini planını alır (CLAUDE.md kanonları bu plan kapsamında esnetilebilir, bkz. memory `feedback_claudemd_esnek`). Sıra:
1. **Emlak süper sade + kira kasası** — [TAMAMLANDI, commit `b33d673`] (bkz. Bölüm 2.I)
2. **Haftalık sezon ligi v1** — anonim auth + takma ad; pazartesi herkes $1M ile başlar, cuma BIST kapanışında skor kilitlenir (günlük challenge yerine bu seçildi — canlı piyasada tek gün kısa/şanslı kalıyordu)
3. **Tapu bekleme + rüşvet katmanı** — hiciv kimliği emlağın üstüne geri gelir
4. **Paylaşım kartı** — lig sonucu → WhatsApp'a atılacak görsel
5. **Araya serpme adayları** — TEFAS para piyasası fonu, Eurobond, haber/olay akışı (fiziki altın çeşitleri + VIOP/kaldıraç + KKM de değerlendirildi, sıraya girmedi)

Bağımlılık mekaniği olarak **kasa + TAHSİL ET** (idle-game döngüsü) seçildi; günlük seri (streak) ve FOMO fırsat pencereleri değerlendirildi ama ertelendi.

### Ara Faz: 52 Haftalık "Vasiyet Seferi" Kampanya Modu (v2.4.0)
* **Tarihsel Kampanya:** Oyunun 365 günlük tycoon yapısını korumak amacıyla, Mayıs 2025 - Mayıs 2026 arasındaki 1 yıllık gerçek verileri ve haftalık gerçek haber başlıklarını ön-paketleyen statik veri modeli (`macroData.js`). 

### Faz 1: "Canlı Seans Mücadelesi" Modu (v3.0.0) [TAMAMLANDI]
* **API Entegrasyonu (Yerel Proxy):** Binance API'leri (Kripto) ve yerel Node.js proxy sunucusu (`server.js` - Yahoo Finance entegrasyonlu) ile gerçek zamanlı BIST 100 ve Gram Altın fiyatlarının çekildiği mod. Rate-limit koruması için 5s caching ve ağ kesilmelerinde drift simülasyonuna geçiş yapan graceful fallback mekanizması kurulmuştur.

### Faz 2: Tarihsel Senaryo Paketleri (Speedrun Scenarios)
* **2001 Kriz Paketi:** Gecelik faizlerin %7500'e çıktığı, dolar kurunun bir günde ikiye katlandığı tarihi 2001 krizinde hayatta kalma mücadelesi.
* **2018 Kur Şoku:** Rahip Brunson krizi ve kur atakları döneminde döviz sepetini koruma testi.

### Faz 3: Sosyal ve Rekabetçi Katman
> 2026-07-03: Günlük Challenge yerine **Haftalık sezon ligi** seçildi (yukarıdaki Aktif Plan #2) — canlı piyasada tek gün çok kısa/şanslı kalıyordu.
* ~~Günlük Mücadele (Daily Challenge)~~ → Haftalık sezon ligi v1 (Aktif Plan #2).
* **Skor Paylaşımı:** Twitter (X) entegrasyonlu komik mahkeme beratı paylaşım görselleri üretmek (Aktif Plan #4).

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

## 6. Son Oturum Geliştirme Özeti & Kaldığımız Yer (2026-07-03)

> Her "s" (save) komutunda bu bölüm üzerine yazılır (kümülatif değil). Önceki oturum özeti için git geçmişine bak (`git show f65bc36:memory.md`).

### A. Bu Oturumda Tamamlananlar
1. **Genel sağlık kontrolü:** `npm run test` (391/391), `npm run check` (0/0), `npm run build` + Vercel `get_runtime_errors` taraması (7 gün). Tek gerçek eksik bulundu: `/favicon.png` prod'da 404 (11 Haziran'dan beri, 18 istek/11 kullanıcı) — önceki favicon fix'i yalnız SVG'ye geçmişti; PNG isteyenler (eski cache + bot'lar) ve iOS Safari (SVG desteklemiyor) karşılıksız kalıyordu. 180×180 PNG üretildi (System.Drawing, SVG tasarımıyla birebir), `apple-touch-icon` linki eklendi. Commit `e9fbfaa`, prod'da 200 doğrulandı.
2. **Ürün değerlendirmesi:** Eksiklikler + yeni yatırım araçları (TEFAS, Eurobond, altın çeşitleri, VIOP/kaldıraç, KKM) + scoreboard fikri masaya yattı. Sonuç: emlak portu en yüksek öncelik (tasarım zaten legacy'de hazır), scoreboard büyüme motoru olarak güçlü ama önce karar-yüzeyi derinliği (emlak/olaylar) gerekiyor.
3. **Süreç kararı:** CLAUDE.md kanonları bu çalışma akışında **esnetilebilir** kabul edildi (kullanıcı açık onayı — bkz. memory `feedback_claudemd_esnek`). Basit süreç: küçük dilim → bitir → deploy → sonraki.
4. **Bağımlılık mekaniği kararı:** Kullanıcı özellikle "bağımlılık yapıcı özellik" istedi. 3 seçenek sunuldu (kasa+TAHSİL ET / günlük seri / FOMO pencereleri) — **kasa+TAHSİL ET** seçildi (idle-game döngüsü, emlak dilimine bedavaya gömülüyordu).
5. **Dilim 1 uygulandı ve deploy edildi — Süper sade emlak + kira kasası:**
   - 3 emlak (İç Anadolu Tarım Arazisi ₺1.2M, İstanbul 1+1 Daire ₺4.5M, Kadıköy Butik Kafe ₺15M), tapu anında geçer, rüşvet/vergi bu dilimde yok.
   - Kira **kasaya** birikir (saniyelik, zaman-damgası tabanlı → offline da işler), kasa 48 saatlik kira dolunca DURUR (amber "KASA DOLDU" uyarısı) — TAHSİL ET ile boşalt. SAT: bedel (TL sabit) + kasa birlikte USD'ye.
   - Yeni: `src/lib/domain/property/property.ts` (+test, deposit.ts kalıbı). Değişen: `gameState.ts` (buyProperty/sellProperty/collectPropertyRent), `savegame.ts` (properties revive, eski kayıt kırılmaz), `liveGameStore.svelte.ts` (propertiesUsd → netWorth), `PropertyCard.svelte` (yeni panel, DepositCard şablonu), `+page.svelte` (mount).
   - TDD ile 24 yeni test (415/415 toplam yeşil), `svelte-check` 0/0, build temiz. Tarayıcıda uçtan uca doğrulandı: satın al → nakit düşer, kasa saniyelik birikir (matematik doğrulandı), TAHSİL ET → nakde geçer, sayfa yenile → restore + offline birikim çalışıyor.
   - Commit `b33d673`, push'landı, Vercel prod READY.
6. Plan dosyası: `C:\Users\Test\.claude\plans\bu-arada-claude-md-esnetilebilir-bright-kazoo.md` (5 adımlık yol haritası, bkz. Bölüm 4 "Aktif Plan").

### B. Yakın Dönem Sinyaller (henüz iş başlamadı — bkz. Bölüm 4 Faz 4)
Supabase geçişi, gerçek kullanıcı hesapları, Amerikan borsası. Açıkça istenmeden büyük mimari değişikliğe girişilmeyecek. Not: Amerikan borsası "Araya serpme adayları" (Aktif Plan #5) ile aynı kovada değerlendirilebilir ama henüz sıraya girmedi.

### C. Değişiklik Geçmişi
Aylık tema-bazlı özet `CHANGELOG.md`'de birikiyor (bu bölümün aksine üzerine yazılmaz, rutin "s" akışında dokunulmaz).

### D. Yeni Chat'te Kaldığımız Yerden Başlangıç Rehberi
1. **Nasıl çalıştırılır:** `npm run dev` (Vite/SvelteKit, `http://localhost:5173`).
2. **Doğrulama:** `npm run test` (Vitest) + `npm run check` (svelte-check) + `npm run build`. Windows'ta adapter-vercel'in son adımında symlink EPERM hatası bilinen ve kabul edilen bir durum.
3. **Sıradaki adım:** Bölüm 4 "Aktif Plan" #2 — **Haftalık sezon ligi v1** (anonim auth + takma ad, pazartesi-cuma). Sonrasında #3 tapu/rüşvet, #4 paylaşım kartı, #5 araya serpme (TEFAS/Eurobond/haber akışı).
4. **"s" kısayolu:** Oturum sonunda kullanıcı **"s"** yazarsa: git durumu kontrol et (commit/push gerekiyorsa yap), bu bölümü (6) o oturumun özetiyle güncelle.

