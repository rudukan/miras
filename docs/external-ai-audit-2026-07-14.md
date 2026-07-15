# Miras Oyunu — Bağımsız Yapay Zekâ Audit Raporu ve Claude Handoff

> **Hazırlayan:** OpenAI Codex (GPT-5), bağımsız dış inceleme  
> **Tarih:** 14 Temmuz 2026  
> **Audit tabanı:** `ce5ca2aefb6ebe86c7b860ae947b12420ad4f672` (`main`)  
> **Amaç:** Claude'un mevcut projeyi yeniden değerlendirip risk-temelli, hızlı ve verimli bir uygulama planı hazırlamasına kanıtlı girdi sağlamak.  
> **Önemli:** Bu rapor bir uygulama planı değildir. Claude her yüksek riskli bulguyu güncel `HEAD` üzerinde yeniden doğrulamalı; doğrulanmamış bir öneriyi doğrudan uygulamamalıdır.

## 1. İnceleme yöntemi ve güven seviyesi

Audit salt-okunur yürütüldü; audit sırasında üretim kodu değiştirilmedi. Aşağıdaki kaynaklar incelendi:

- `AGENTS.md`, `CLAUDE.md`, `memory.md`, `CHANGELOG.md`, `README.md`
- `docs/superpowers/specs/`, `docs/superpowers/plans/`, `.claude/plans/`
- `.Codex/agents/` altındaki dokuz ajan tanımı
- Git geçmişi, commit dağılımı ve çalışma ağacı
- Domain, store, API, auth, Supabase, grafik ve ana sayfa kodları
- Vitest, Playwright ve GitHub Actions yapılandırması
- Kullanıcı deneyi runbook'u ve telemetri olayları
- Yahoo, Borsa İstanbul, TCMB ve LinkedIn'in resmî sayfaları

Doğrudan doğrulanan teknik sağlık:

- `npm run test`: **44 test dosyası, 554/554 test başarılı**
- `npm run check`: **0 hata, 0 uyarı**
- `npm run build`: **başarılı**
- E2E bu audit sırasında çalıştırılmadı; depoda CI'ı bloklayan 12 Playwright senaryosu bulundu.

Rapor etiketleri:

- **DOĞRULANDI:** Kod, test çıktısı veya git geçmişiyle doğrudan teyit edildi.
- **ÇIKARIM:** Kanıtlardan türetilmiş ürün/süreç yorumu; kullanıcı verisiyle sınanmalı.
- **ÖNERİ:** Uygulanmadan önce kurucu kararı ve Claude planı gerekir.

## 2. Yönetici özeti

Miras Oyunu sıradan bir prototip değildir. Test disiplini, domain ayrımı, canlı veri entegrasyonu, Supabase/RLS, E2E, güvenlik review'ları ve production hata analizleri güçlüdür. Kod mühendisliği seviyesi yüksektir.

Ancak proje iki ayrı açıdan gereğinden pahalı ilerlemektedir:

1. **Ürün belirsizliği kod yazarak çözülüyor.** 365 günlük Türkiye makro tycoon'u vaadi, çalışan üründe açık uçlu canlı paper-trading sandbox'ına dönüşmüş durumda. Kullanıcı tutunması doğrulanmadan auth, cloud save, güvenlik ve geniş varlık evrenine ciddi yatırım yapılmış.
2. **Süreç belgeleri ikinci bir kod tabanına dönüşmüş.** Yaklaşık 7.100 satır üretim koduna karşı yalnız spec/planlarda yaklaşık 18.100 satır bulunuyor. Belgeler yine de güncel durumdan sapıyor.

En kısa hüküm:

> **Yazılım mühendisliği güçlü; ürün mühendisliği ve süreç ekonomisi zayıf. Proje güvenli ama pahalı ilerliyor.**

Yönsel değerlendirme:

| Alan | Audit hükmü |
|---|---:|
| Kod ve test disiplini | 8.5/10 |
| Güvenlik ve mimari karar kalitesi | 8/10 |
| Süreç verimliliği | 5/10 |
| Ürün doğrulama | 4/10 |
| Bugünkü LinkedIn/portföy değeri | 7–8/10 |
| Odaklı haftalık lig + kullanıcı kanıtıyla potansiyel | 9/10 |

## 3. Güçlü taraflar — korunmalı

### 3.1 Test ve doğrulama kültürü

- 554 Vitest testi gerçekten geçiyor; testler yalnız domain happy-path'lerinden oluşmuyor.
- CI `test → check → build` yanında gerçek lokal Supabase kullanan Playwright job'ını bloklayıcı çalıştırıyor: `.github/workflows/ci.yml`.
- Playwright'ta piyasa verisi deterministik mock, auth backend'i ise gerçek lokal Supabase. Bu dengeli ve olgun bir test seçimi.
- `workers: 1` kararı gerçek flake taramasıyla verilmiş; rastgele paralellik yerine güvenilirlik seçilmiş: `playwright.config.ts:8-20`.

### 3.2 Güvenlik yaklaşımı

- RLS + GRANT çift katmanı, `getUser()` tabanlı server auth kontrolü, same-origin guard, Turnstile ve girdi whitelist'leri mevcut.
- Pre-launch güvenlik denetimi P0/P1/P2 olarak sınıflandırılmış; ertelenen riskler gerekçeli.
- Canlı DB review'ı unit testlerin yakalamadığı PostgREST grant hatasını bulmuş.
- Vercel runtime'daki WebSocket ve auth invalidation sorunları production gözlemiyle çözülmüş.

### 3.3 Karar izi

- Önemli özelliklerde kapsam dışı maddeler, başarı kriterleri ve trade-off'lar yazılı.
- Review bulguları ayrı fix commitleriyle izlenebilir.
- Denge açığı saklanmıyor: muhafazakâr stratejinin agresif stratejiyi domine ettiği backlog'a açıkça yazılmış.

### 3.4 Teknik portföy değeri

Tek projede Svelte 5, strict TypeScript, hibrit WebSocket/poll veri akışı, Supabase auth/RLS, Monte Carlo simülasyonu, canvas grafik, E2E ve production debugging gösterilebiliyor. Bu, işe alım vitrini için güçlü bir bileşim.

## 4. Öncelikli teknik bulgular

### P0 — Bulut kayıt hatası sessiz veri kaybına dönüşebilir

**Durum: DOĞRULANDI.**

Kanıt zinciri:

1. `src/routes/+page.svelte:54-63` içindeki Supabase `upsert()` çağrısının döndürdüğü `error` kontrol edilmiyor. Supabase sorgu hatası Promise'i zorunlu olarak reject etmez; `{ error }` dönebilir.
2. `src/lib/stores/cloudSave.ts:51-60` içinde `pending`, gönderimden önce `null` yapılıyor. `push()` hata verirse envelope kuyruğa geri konmuyor.
3. `src/routes/+page.svelte:415-425` çıkıştan önce `flush()` çağırıyor. İlk başarısız flush kullanıcıyı durdurabilir; fakat pending kaybolduğu için ikinci çıkış denemesi boş kuyruğu başarılı sayıp local kaydı silebilir.
4. Mevcut unit test bu davranışı fiilen kabul ediyor: ilk başarısız flush sonrası ikinci flush'ın `true` dönmesini bekliyor.

Olası sonuç: Bulut yazımı başarısızken kullanıcı ikinci çıkış denemesinde son ilerlemesini kaybedebilir.

Claude'dan beklenen:

- Önce başarısız Supabase response'u ve ikinci çıkış denemesini kapsayan bir regresyon testiyle bulguyu yeniden üret.
- Hata durumunda envelope'un nasıl korunacağını tasarla.
- `flush()` sözleşmesini ve kullanıcıya gösterilecek hata davranışını açıklaştır.
- E2E'de yalnız request çıkmasını değil başarılı persistence sonucunu doğrula.

### P1 — Finansal kuralların tek doğruluk kaynağı yok

**Durum: DOĞRULANDI.**

- Production mevduat sabiti `%50`: `src/lib/domain/deposit/deposit.ts:14`.
- 2025 senaryo verisi `%42`: `src/lib/data/macro2025.ts:77`.
- `openDeposit()` senaryo oranını değil global `%50` sabitini kullanıyor: `src/lib/stores/gameState.ts:131-148`.
- `netWorthUsd()` yalnız nakit + holding hesaplıyor: `src/lib/stores/gameState.ts:113-118`.
- Mevduat ve emlak daha sonra live store içinde ayrı ekleniyor: `src/lib/stores/liveGameStore.svelte.ts:228-246`.
- Kazanma çizgisi production domain'inde yalnız `$1M` üzerine çıkmayı ölçüyor; enflasyonlu hedef test simülatöründe ayrı yaşıyor: `src/lib/stores/gameState.ts:125-127`.

Ek latent bug:

- `src/lib/domain/money.ts:53-56` içindeki TRY→USD komisyon formülü paydayı küçülttüğü için komisyon arttıkça kullanıcı daha fazla USD alıyor. Fonksiyon şu an production akışında kullanılmıyor; kampanya/legacy mekanikleri geri geldiğinde hata aktive olabilir.

Claude'dan beklenen:

- Önce “production'daki kanonik değerleme ve kazanma modeli nedir?” sorusunu netleştir.
- Senaryo oranları, değerleme, kazanma eşiği ve simülasyon runner'ı için tek production-domain doğruluk kaynağı öner.
- Kullanılmayan `toUSD()` latent bug'ını ayrı ve küçük TDD işi olarak sınıflandır; büyük refactor'a gömme.

### P1 — Zaman bazlı servet değerleri reaktif saate bağlı değil

**Durum: GÜÇLÜ TEKNİK BULGU; Claude tarayıcıda yeniden üretmeli.**

- Mevduat ve emlak değerleri `$derived` içinde doğrudan `now()` çağırıyor: `src/lib/stores/liveGameStore.svelte.ts:228-237`.
- Varsayılan `now()` yalnız `Date.now()`; Svelte açısından reaktif dependency değildir.
- Sayfadaki saniyelik `nowMs` kart UI'ına akıyor, live store değerlemesine akmıyor: `src/routes/+page.svelte:103`, `:235`.

Olası sonuç: Fiyat poll'u veya başka reaktif state değişimi olmadığında mevduat faizi, kira ve üst net-servet göstergesi zamanla akmayabilir.

Ek değerleme sorunu:

- Bir holding fiyatı eksikse `netWorth` catch bloğu yalnız mevduat + emlak değerini döndürüyor; nakit ve fiyatı bulunan pozisyonlar da toplamdan düşüyor: `src/lib/stores/liveGameStore.svelte.ts:239-245`.

Claude'dan beklenen:

- Fake clock veya tarayıcı testiyle net servetin yalnız zaman ilerlediğinde güncellenip güncellenmediğini kanıtla.
- Reaktif saatin store'a nasıl gireceğini minimum değişiklikle tasarla.
- Eksik fiyat durumunda “yanlış düşük toplam”, “son tam değer” ve `null/—` seçeneklerini ürün anlamıyla değerlendir.

### P1 — Parametreli piyasa istekleri zorunlu server cache'ini bypass ediyor

**Durum: DOĞRULANDI.**

- Varsayılan sembol seti cache'leniyor; `?bist`, `?us` veya `?coins` geldiğinde doğrudan upstream çağrılıyor:
  - `src/routes/api/yahoo/+server.ts:20-30`
  - `src/routes/api/crypto/+server.ts:18-27`
- Normal store poll'u aktif sembol listelerini parametre olarak gönderiyor: `src/lib/stores/liveGameStore.svelte.ts:430-432`.
- Dolayısıyla AGENTS/README'deki “5s server cache zorunlu” iddiası normal oyuncu trafiğinde fiilen sağlanmıyor.
- Poll `setInterval` ile async başlatılıyor; yavaş upstream durumunda çağrılar üst üste binebilir: `src/lib/stores/liveGameStore.svelte.ts:509-514`.

Risk: Kullanıcı sayısı arttığında Yahoo/Binance rate-limit, maliyet ve güvenilirlik sorunu.

Claude'dan beklenen:

- Bounded keyed TTL + inflight dedup tasarla.
- Sembol setinin normalize edilmesini ve cache-key patlamasının engellenmesini açıkla.
- Poll'u önceki istek tamamlandıktan sonra planlayan minimum çözümü değerlendir.
- Rate-limit altyapısını ürün doğrulamasından önce gereksiz büyütme; fakat açık proxy abuse riskini ayrı ele al.

### P1 — “Piyasa kapalı/eski” bilgisi işlem bütünlüğüne uygulanmıyor

**Durum: DOĞRULANDI.**

- UI `KAPALI` etiketi gösteriyor: `src/lib/components/PriceRow.svelte:63`.
- Trade form yine doğrudan `store.buy()` / `store.sell()` çağırıyor: `src/lib/components/TradeForm.svelte:95`, `:105`.
- `marketOpen` ve `dataStale` değerleri işlem reducer'ında guard olarak kullanılmıyor.

Bugünkü sandbox'ta bu bir ürün tercihi olabilir; haftalık rekabetçi ligde ise hile/fairness açığıdır.

Claude'dan beklenen:

- Kurucuya şu semantik seçenekleri sun: kapalı piyasada yasak, son kapanış fiyatı, sonraki açılışa emir kuyruğu.
- Stale fiyat politikasını ayrıca belirle.
- SP2 lig planı yazılmadan server-damgalı fiyat ve idempotent trade sözleşmesini netleştir.

### P1 — Veri doğruluğu ve lisans dili lansman öncesi netleşmeli

**Durum: DOĞRULANDI + hukuki inceleme gerektirir.**

- `src/lib/data/macro2025.ts:3` kur çapalarını “quant doğrulayacak” olarak işaretliyor.
- Aynı dosyanın `:20` satırı fiyat/yön değerlerinin tümünü “knowledge-cutoff tahmini” olarak tanımlıyor.
- Buna rağmen README ve proje anlatısı yer yer “gerçek 2025 verileri” diyor.
- Canlı modda Yahoo verisi kendi proxy'lerinden yeniden sunuluyor.

Bu rapor hukuki ihlal hükmü vermiyor. Ancak ticari/public lansman öncesi kaynak ve yeniden dağıtım şartları doğrulanmalıdır:

- Yahoo Terms of Service: <https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html>
- Borsa İstanbul lisanslı veri dağıtıcıları: <https://www.borsaistanbul.com/en/data/data-dissemination/data-vendors-directory>
- TCMB EVDS açık veri duyurusu: <https://tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Duyurular/Basin/2026/DUY2026-03>

Doğru geçici ürün dili:

- Tarihsel mod: **“2025 koşullarından esinlenerek kalibre edilmiş kurmaca senaryo.”**
- Canlı mod: **“Canlı/gecikmeli referans fiyatlı paper-trading oyunu.”**

“Kaynaklı 2025 tarihsel replay” iddiası ancak gerçek günlük seri, provenance, dönüşüm yöntemi ve dataset sürümü yayımlandıktan sonra kullanılmalı.

### P2 — ABD hissesi grafikleri bilinen şekilde yanlış upstream'e gidiyor

**Durum: DOĞRULANDI.**

- `upstreamFor()` Yahoo'daki özel üç sembol dışında her varlığa `.IS` ekliyor: `src/lib/api/seriesSource.ts:16-24`.
- Böylece `AAPL → AAPL.IS` oluyor.
- `memory.md` de ABD grafiklerinin “veri yok” gösterdiğini açıkça kaydediyor.
- Genel E2E series fixture'ı sembolden bağımsız cevap verdiği için hata E2E'de görünmüyor.

LinkedIn videosu veya public lansman öncesi demo yolunda bu hata kapatılmalı.

### P2 — Supabase client invarianti gerçek ihtiyaçlarla çelişiyor

**Durum: DOĞRULANDI.**

- AGENTS mutlak olarak “yeni server-side client yaratma, hep `locals.supabase`” diyor.
- Universal `+layout.ts` SSR sırasında yeni browser client yaratıyor: `src/routes/+layout.ts:6-16`.
- Hesap silme rotası service-role admin işlemi için yeni client yaratıyor: `src/routes/api/account/delete/+server.ts:12-23`.

Admin client işlevsel olarak gerekli olabilir; sorun koddan çok kuralın yanlış mutlaklığı ve client oluşturma workaround'unun çoğalmasıdır.

Claude'dan beklenen:

- Kuralı “kullanıcı kapsamlı server işlemleri `locals.supabase`; service-role yalnız merkezi server-only factory ve açık istisna” şeklinde değerlendirsin.
- Server/client oluşturmayı merkezileştirme, generated `Database` tipleri, destructive route testleri ve çapraz-kullanıcı RLS testi için ayrı plan önersin.
- Tam nonce'lu CSP bilinen backlog; ürün doğrulamasını bloke edip etmediğini riskle gerekçelendirsin.

### P2 — Mimari hotspot'lar AGENTS sınırlarını aşmış

**Durum: DOĞRULANDI.**

- `src/routes/+page.svelte`: **828 satır**
- `src/lib/stores/liveGameStore.svelte.ts`: **589 satır**
- `src/lib/components/panels/AccountPanel.svelte`: **262 satır**
- AGENTS component hedefi yaklaşık 200 satır.
- `+page.svelte` auth, cloud reconcile, reset/silme, telemetri, popover, overlay, toast ve oyun boot akışlarını birlikte yönetiyor.
- Saf reducer'lar `src/lib/stores/gameState.ts` altında; domain klasörleri de belgelenen izolasyondan daha fazla birbirine bağımlı.

Öneri: Büyük çaplı “mimari temizlik sprint'i” açılmamalı. Önce P0/P1 işlerinde dokunulan sınırlar cerrahi biçimde ayrıştırılmalı; yalnız yeni ihlalleri engelleyen hafif dependency-boundary testi düşünülmeli.

### P2 — Test sayısı güçlü, kapsam iddiası zayıf

**Durum: DOĞRULANDI.**

- 554 test geçiyor, fakat Vitest coverage provider/eşik tanımlamıyor.
- Kritik negatif yollar eksik: cloud upsert error, ikinci sign-out denemesi, parametreli cache, kapalı/stale trade, ABD chart URL/para birimi, reactive time, bazı destructive route/RLS akışları.
- E2E yalnız Chromium.

Öneri: Yüzde hedefini gösteriş metriğine çevirmeden, kritik domain/server modüllerinde branch coverage ve risk-bazlı negatif senaryolar eklenmeli.

## 5. Ürün ve kullanıcı doğrulama bulguları

### 5.1 Çalışan ürün ile ana vaat ayrışmış

**Durum: DOĞRULANDI.**

Ana vaat:

- 1 milyon USD miras
- Türkiye'nin 2025 makro koşulları
- 365 günlük tycoon
- bürokrasi, emlak, vergi, Tech Agent ve kriz modları

Çalışan ana ekran:

- `[ MİRAS — CANLI ÇEKİRDEK ]`
- açık uçlu canlı fiyatlı portföy sandbox'ı
- net ortak bitiş/kazanma döngüsü yok
- emlak gizli, tycoon katmanlarının önemli kısmı legacy/backlog
- dört mod parity yalnız kısmi iskelet

Çıkarım: Ürünün en farklılaştırıcı kısmı teknik dashboard'un arkasında kalmış.

### 5.2 Kullanıcı deneyi tasarlanmış, sonucu kayıtlı değil

**Durum: DOĞRULANDI.**

`docs/deney-runbook.md` beş kişilik deney için açık eşikler tanımlıyor:

- GO: en az 3/5 kişinin D1/D2/D3'te kendiliğinden dönmesi
- Viral sinyal: en az bir istenmemiş `share_done`
- NO-GO: en fazla bir dönüş

Audit sırasında repo ve git geçmişinde tamamlanmış deney matrisi veya sonuç hükmü bulunamadı. Buna rağmen Supabase/account altyapısına geçildi.

Telemetri yalnız şunları ölçüyor:

- `visit`
- `share_click`
- `share_done`

Eksik temel olaylar:

- landing/welcome görüntüleme
- oyuna giriş
- ilk varlık seçimi
- ilk işlem ve ilk işleme kadar süre
- kapanış/sonuç görüntüleme
- ikinci oturum / D1 / D3 / D7
- hata ve terk noktası

En önemli süreç hükmü:

> Yeni büyük özellikten önce ürün belirsizliği gerçek kullanıcı davranışıyla azaltılmalı.

### 5.3 Önerilen tek ürün tezi

**ÖNERİ — kurucu onayı gerekir.**

En güçlü ve mevcut altyapıyla en uyumlu tez:

> **Pazartesi herkese 1 milyon dolar miras kalır. Cuma piyasa kapanınca mahkeme beratı çıkar. Aynı haftayı oynayanlar birbirleriyle kıyaslanır ve sonuçlarını paylaşır.**

Bu yön:

- mevcut canlı veri/auth/cloud save altyapısını kullanır,
- miras temasını ve Türkiye hicvini geri getirir,
- net başlangıç/bitiş üretir,
- paylaşım kartına anlam verir,
- retention'ı haftalık ritme bağlar,
- dört modu aynı anda bitirme ihtiyacını ortadan kaldırır.

Şimdilik dondurulması önerilenler:

- yeni varlık sınıfı ve katalog genişletme
- 2001/2018 modlarının uygulaması
- emlak/rüşvet/vergi katmanının genişletilmesi
- LLM kişiselleştirmeli berat
- mobil native uygulama
- monetization
- kapsamlı görsel/mimari refactor

## 6. Dokümantasyon ve süreç auditi

### 6.1 Ölçülen süreç maliyeti

- Audit tabanında toplam yaklaşık 278 commit.
- 76 commit `docs` önekli.
- `memory.md` yaklaşık 32 kez değiştirilmiş.
- Spec/plan dosyaları yaklaşık 18.100 satır; üretim TS/Svelte/CSS yaklaşık 7.100 satır.
- Planlarda yüzlerce checkbox var, fakat tamamlanmış planların çoğunda kutular hâlâ boş.

Bu hacim auth/güvenlik gibi riskli işlerde kısmen haklı; UI ve küçük domain değişikliklerinde aşırıdır.

### 6.2 Drift örnekleri

- README 471 test diyor; audit koşusunda 554 test var.
- README Playwright'ı roadmap'te gösteriyor; E2E artık CI'da bloklayıcı.
- README Supabase'i “sırada” gösteriyor; canlıda tamamlanmış.
- Bitmiş grafik spec'i “plan yazımı bekliyor” diyor.
- Bitmiş E2E spec'i “onay bekliyor” diyor.
- `AGENTS.md` `.Codex/plans/` dizinine yönlendiriyor; aktif planlar `docs/superpowers/plans/` ve `.claude/plans/` arasında.
- `.Codex/agents/cto.toml` ve `product-owner.toml` hâlâ Firebase, eski sprintler ve eski roadmap anlatıyor.
- AGENTS audit anında git tarafından izlenmiyordu; Claude bunun bilinçli yerel politika mı yoksa paylaşım hatası mı olduğunu kurucuya sormalı.

### 6.3 README'deki aşırı iddialar

Şu ifadeler düzeltilmeli:

1. **“Para asla number değil; float hataları sınıf olarak yok edildi.”**  
   Gerçekte `Money.amount` bir `number`; iki ondalık yuvarlama ve para birimi uyuşmazlığı koruması var. Doğru ifade: “Parasal değerler currency-aware `Money` wrapper'ı ile taşınır ve her operasyonda iki ondalığa normalize edilir.”

2. **“Her strateji %30–70 bandında.”**  
   Audit koşusunda muhafazakâr strateji %100, dengeli %62, agresif %10,9 kazandı. Yalnız dengeli strateji hedef bandında.

3. **“Gerçek 2025 verileri.”**  
   Mevcut tarihsel model tahmini anchor + drift + seed'li gürültü kullanıyor.

### 6.4 Önerilen yalın süreç

| İş sınıfı | Gerekli süreç |
|---|---|
| Küçük, düşük risk | Doğrudan targeted TDD + tek final doğrulama |
| Orta UI/domain | En fazla 1–2 sayfa spec, kısa dosya/test planı, tek final review |
| Auth/DB/security/veri kaybı | Threat model + ayrıntılı plan + görev review + gerçek environment smoke |
| Keşif/bug | Önce reproducer ve kök neden; plan sonra |

Ek öneriler:

- `memory.md` yalnız mevcut hedef, son kararlar, blocker ve sıradaki adımı taşısın; yaklaşık 50–80 satır.
- Kalıcı kararlar kısa ADR'lere, tarih git/CHANGELOG'a taşınsın.
- Planlarda tam implementasyon kodu kopyalanmasın; kontrat, risk, dosya, test ve DoD yeterli.
- Tek kanonik plan dizini seçilsin; tamamlanan plan `done + commit hash` ile arşivlensin.
- Dokuz kalıcı “departman” yerine üç çekirdek rol düşünülsün: ürün/kurucu, uygulayıcı+reviewer, gerektiğinde uzman.
- Memory/docs güncellemesi her küçük save/push için ayrı commit üretmesin; feature kapanışına katılsın.

## 7. LinkedIn ve portföy hükmü

Bugünkü proje teknik çevrede dikkat çeker; fakat README drift'i ve eksik oyun döngüsü nedeniyle “güzel demo” seviyesinde kalabilir. Odaklı haftalık lig, dürüst veri metodolojisi ve küçük de olsa kullanıcı kohortu eklendiğinde çok güçlü bir işe alım vitrini olur.

### 7.1 Anlatı sırası

Teknoloji listesiyle başlanmamalı. Önerilen kanca:

> **“Türkiye'de bugün 1 milyon dolar miras kalsa bir haftada ne yapardın?”**

Ardından gösterilecek kanıt:

1. 30–45 saniyelik doğal ekran videosu
2. Haftalık başlangıç → işlem → sonuç/berat akışı
3. Üç önemli mühendislik kararı
4. Testlerin yakalamadığı bir production hata ve öğrenilen ders
5. Güncel test/check/build/E2E kanıtı
6. Gerçek kullanıcı dönüşüm ve retention sayıları
7. Demo ve GitHub linki

“Dokuz AI departmanı ve yüzlerce test” ana mesaj yapılmamalı. Bu, sahiplik yerine otomasyon gösterisi gibi algılanabilir. Daha güçlü ifade:

> “AI destekli geliştirdim; ürün kararları, doğrulama, güvenlik sınırları ve production sahipliği bende.”

LinkedIn'in Featured bölümü post, harici link, video ve dokümanları iş örneği olarak sergilemeyi destekliyor:

- <https://www.linkedin.com/help/linkedin/answer/a552452/featured-section-on-your-profile-faqs>

Önerilen paylaşım sırası:

- Şimdi: production'da testlerin yakalamadığı hatalar üzerine teknik postmortem.
- Ürün döngüsü tamamlanınca: ana demo/lansman postu.
- İlk gerçek hafta bitince: metrikler ve öğrenimler postu.

## 8. Claude'dan istenen planlama görevi

Claude bu raporu okuduktan sonra **hemen kod yazmamalı**. Önce aşağıdaki çıktıyı hazırlamalı ve kurucu onayı almalıdır.

### 8.1 Ön doğrulama

Claude:

1. `AGENTS.md`, `memory.md` Bölüm 6, güncel `git status` ve son commitleri okusun.
2. Rapor tabanı ile güncel `HEAD` farklıysa değişen bulguları işaretlesin.
3. Özellikle şu dört yüksek riskli bulguyu test/reproducer seviyesinde yeniden doğrulasın:
   - cloud save sessiz veri kaybı,
   - reaktif olmayan zaman bazlı değerleme,
   - parametreli cache bypass,
   - kapalı/stale fiyatla işlem.
4. Finansal tek-doğruluk-kaynağı problemini dosya ve çağrı grafiğiyle teyit etsin.
5. Ürün tezi konusunda kurucu onayı olmadan SP2 uygulama planı yazmasın.

### 8.2 Claude'un sunması gereken plan formatı

Plan dört ayrı faza ayrılmalı:

#### Faz 0 — Kritik güven ve doğruluk

- Cloud save data-loss reproducer + fix
- Zaman bazlı net-servet reproducer + fix
- Cache/inflight davranışı
- Kapalı/stale işlem semantiği kararı
- Finansal oran/değerleme doğruluk kaynağı için küçük ve sıralı işler

Her iş için:

- risk ve kullanıcı etkisi,
- değişecek dosyalar,
- önce yazılacak failing test,
- minimum implementasyon,
- regresyon doğrulaması,
- manual/preview smoke,
- rollback veya failure davranışı.

#### Faz 1 — Ürün doğrulama ve anlatı doğruluğu

- README/memory/ajan drift temizliği
- veri metodolojisi ve doğru ürün dili
- funnel olayları
- 10–15 kullanıcılık deney
- önceden yazılmış GO/NO-GO eşikleri

Bu fazda yeni büyük özellik yok.

#### Faz 2 — Tek haftalık dikey dilim

- Pazartesi miras başlangıcı
- server-damgalı ve idempotent trade
- cuma kilidi
- temel leaderboard
- mahkeme beratı
- paylaşım
- E2E: onboarding → ilk işlem → kapanış → paylaşım

Kapsam dışı maddeler ayrıca yazılmalı.

#### Faz 3 — Vitrin ve lansman

- ABD grafik hatası
- mobil/a11y smoke
- source/delay etiketleri
- canlı demo ve kısa video
- LinkedIn vaka çalışması
- gerçek ilk hafta metrikleri

### 8.3 Plan kalitesi için zorunlu kurallar

- Riskten bağımsız “her task'a ayrı reviewer” uygulanmasın.
- Küçük fix'ler büyük refactor'lara bağlanmasın.
- Plan içine tam dosya gövdeleri kopyalanmasın.
- Her task'ın başarı kriteri çalıştırılabilir test veya gözlenebilir kullanıcı sonucu olsun.
- “Test sayısı arttı” tek başına başarı kriteri sayılmasın.
- Unit/check/build yanında riskli auth/cloud işlerinde gerçek Supabase ve preview smoke tanımlansın.
- Mevcut kullanıcı değişiklikleri korunmalı; untracked `.codex/` ve `AGENTS.md` kurucuya sorulmadan commit edilmemeli.

## 9. Ölçülebilir başarı kriterleri

### Teknik

- Cloud push hatasında local/en son envelope hiçbir çıkış denemesinde kaybolmuyor.
- Mevduat/kira değerlemesi yalnız zaman ilerlediğinde reaktif güncelleniyor.
- Aynı normalize sembol setine eşzamanlı upstream çağrı tek kez yapılıyor.
- Kapalı/stale trade davranışı domain ve UI'da aynı sözleşmeye uyuyor.
- Production ve balance simülasyonu aynı finansal oran/değerleme kaynağını kullanıyor.
- ABD hissesi grafiği doğru Yahoo sembolünü ve USD birimini kullanıyor.
- `test + check + build + e2e` yeşil.

### Ürün

Örnek ilk kohort eşikleri, kurucu tarafından son kez onaylanmalı:

- Katılımcıların en az %80'i yardım almadan oyuna giriyor.
- En az %70'i 90 saniye içinde ilk işlemi tamamlıyor.
- En az %40'ı D1 veya D3'te kendiliğinden dönüyor.
- En az %60'ı haftalık hedefi ve bitiş anını doğru anlatabiliyor.
- En az bir organik paylaşım gerçekleşiyor.
- En yaygın üç terk nedeni kayda geçiyor.

Kohort küçükse yüzdeler yanında mutlak adetler mutlaka raporlanmalı.

### Portföy

- README güncel ve abartısız.
- Canlı demo kırık ABD grafik yoluna düşmüyor.
- Veri kaynağı/gecikme/dönüşüm tablosu görünür.
- CI ve E2E kanıtı erişilebilir.
- Bir production postmortem yazılı.
- LinkedIn postu teknoloji listesi değil problem → karar → kanıt → sonuç akışında.

## 10. Son hüküm

Miras Oyunu'nun teknik temeli korunmaya değer. Fikir de zayıf değildir; fakat güçlü fikir “bir başka trading dashboard'u” değil, **Türkiye'ye özgü ortak zamanlı miras oyunu**dur.

Bir sonraki başarı sıçraması daha fazla koddan gelmeyecek. Şunlardan gelecek:

1. Veri kaybı ve finansal doğruluk risklerini kapatmak,
2. tek ürün vaadini seçmek,
3. gerçek kullanıcı davranışını ölçmek,
4. yalnız o kanıta hizmet eden haftalık döngüyü tamamlamak,
5. projeyi dürüst ve kanıtlı biçimde anlatmak.

> **Önerilen yönetim kararı:** Yeni özellik genişletmesini geçici olarak dondur; önce Faz 0 teknik güven, ardından Faz 1 kullanıcı doğrulama. SP2 haftalık lig planı bu iki kapıdan sonra yazılsın.

