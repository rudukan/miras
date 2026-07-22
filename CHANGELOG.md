# Değişiklik Günlüğü

Aylık, tema bazlı geliştirme özeti. `memory.md`'nin aksine bu dosya BİRİKİR (üzerine yazılmaz) — her ay sonunda ya da istendiğinde yeni bir bölüm en üste eklenir.

> **Not (AI ajanlar için):** Bu dosyayı rutin "devam edelim" / "s" (save) akışında OKUMANA gerek yok — `memory.md` Bölüm 6 (son oturum özeti) o iş için yeterli. Bu dosyayı yalnız biri geçmiş bir dönemi sorduğunda aç, ve gerekirse yalnız ilgili ay bölümünü oku (tamamını değil).

---

## Haziran 2026

96 commit, 62 dosyada ~4.700 satır ekleme — ayın büyük kısmı mimari temel attı (USD-taban model, hibrit canlı veri, mevduat, mühürlü kur), sonra UX ince ayarları geldi.

**1-2 Haziran — Canlı Çekirdek'in ilk oynanabilir hali**
İlk dikey dilim (katalog + store + UI) hayata geçti. "Eğlence ölçütü" turu: günlük %değişim rozetleri, "şu an"-lık göreli zaman, bağlam kartı, pozisyonlarda K/Z, hızlı tutar girişi + MAX butonu. Playtest #1 geri bildirimiyle CRT scanline efekti kaldırıldı.

**3 Haziran — BIST100 arama**
Statik 100 hisselik arama listesi + on-demand ekleme (aramadan seçilen hisse canlı takibe girer).

**5-6 Haziran — USD-taban para modeli (büyük mimari refactor)**
Motor TRY'den USD'ye taşındı: `UsdPriceOracle` seam'i, oto-takas mantığı, TRY/mevduat/convert kaldırıldı. Bugünkü mimarinin temel taşı.

**8 Haziran — Hibrit canlı kur**
Binance WS (`usdttry@trade`) birincil, Yahoo `USDTRY=X` fallback.

**10 Haziran — Evren genişletme**
SOL/XRP/DOGE/AVAX + gram gümüş eklendi, piyasa listesi sekme+grup düzenine geçti.

**11 Haziran — Paylaşım + mobil düzenin başlangıcı**
Paylaşılabilir kapanış kartı + "5 kullanıcılık deney" altyapısı (ilk gerçek dış test), mobil tek-akış düzen.

**13 Haziran — Sadeleştirme**
Süre seçimi kaldırıldı (direkt BAŞLA), gerçek takvim gün sayacı, günlük döküm paneli, iOS alt siyahlık fix.

**14 Haziran — Mevduat dilimi (8 görevlik büyük özellik)**
TL vadeli mevduat: streaming yield, mark-to-market değerleme, cüzdana entegrasyon. Aynı gün günlük-mühürlü-kur spec'i yazıldı.

**17-18 Haziran — Günlük mühürlü kur + Cüzdan/Net Servet UX**
`sealedUsdTry`/`ensureSeal`, "Kalan Nakit / Yatırımda" dağılımı, cüzdandan tıkla-işlem, tutar↔adet iki yönlü senkron.

**22 Haziran — Market grafik + işlem pop-up (büyük özellik)**
`series/` domain modülü, bağımsız canvas çizgi grafik, `/api/series` proxy, hover/tap ile pop-up (grafik+periyot+gerçek AL/SAT), toast bildirimleri.

**23 Haziran - 1 Temmuz — sessizlik (commit yok, 10 gün ara)**

---

## Temmuz 2026

**2 Temmuz**
- Ürün önceliği netleşti: VASİYET SEFERİ ertelendi, odak CANLI SEANS'ın veri doğruluğuna kaydı.
- Eşikli mühür: günlük kur artık büyük gün-içi hareketlerde (>%0.75 sapma) aynı gün yeniden mühürleniyor.
- Kripto cold-start fix: WS ilk poll'dan önce bağlanırsa tohumlanmayan coin fiyatları düzeltildi.
- Al/Sat miktar girişi yazarken binlik virgülüyle canlı gruplanıyor.
- Eksik favicon eklendi, küçük yazım/a11y düzeltmeleri.
- `memory.md` 5 haftalık gecikmeden sonra güncel SvelteKit mimarisine taşındı.

**15-16 Temmuz — Faz 0: Güven ve doğruluk düzeltmeleri (dış AI audit'i, 13 görev, main'e merge)**
Dış bir AI denetiminin bulduğu 4 yüksek riskli sorun + 3 finansal doğruluk hatası kapatıldı. Bulut kaydı sessizce veri kaybediyordu — `createSavesPusher` hatayı yüzeyleştiriyor, başarısız push artık gerçekten yeniden deneniyor (P0). Mevduat/kira değerlemesi reaktif olmayan bir zamana bağlıydı — artık saniyede bir kendiliğinden akıyor. Piyasa verisi proxy'lerinde (`/api/yahoo`, `/api/crypto`) parametreli her istek 5s cache'i bypass ediyordu — `createKeyedTtlFetchCache` ile kapatıldı. Net servet, tek bir hissenin fiyatı yüklenemediğinde nakit dahil sıfıra çöküyordu — artık bilinen bileşenlerin kısmi toplamını gösteriyor, kâr göstergeleri yalnız o durumda gizleniyor. Kapalı/stale piyasada (kripto hariç) işlem artık engelleniyor — rekabetçi lig öncesi kapatılan bir arbitraj deliği. `toUSD` komisyon formülündeki tersinlik (komisyon arttıkça kullanıcı fazla dolar alıyordu) ve `openDeposit`'in oran seam'i de bu dilimde. E2E'ye çıkışta bulut kalıcılığının gerçek Postgres satırı okunarak doğrulandığı yeni bir senaryo eklendi (12→13). Whole-branch review (Opus, "Ready to merge: Yes") sonrası main'e merge + push edildi. Yol boyunca bulunan bir yan etki: `service_role`'ün `saves` tablosunda hiç okuma yetkisi yoktu (migration `0004`, prod'a push kararı ayrı/açık).

**17-18 Temmuz — Faz 1 hazırlık kapısı: kod tarafı (11 görev, main'de)**
GO/NO-GO deneyinin ölçüm altyapısı: `telemetry_events` tablosu (migration 0006) + `/api/telemetry` DB insert'i (same-origin guard, best-effort), `first_trade` event'i ve `onFirstTrade` kablolaması (buy/sell/openDeposit → pingFirstTrade), veri metodolojisi dili (DataInfoModal + PriceList info butonu, WalletSummary'de mühürlü/piyasa kur ikinci satırı) ve GO/NO-GO runbook'u (`docs/faz1-gonogo-runbook.md`). Landing-page ölçümü bilinçli kapsam dışı (KVKK + N=10-15'te gürültü, spec'te belgeli). Final review "Ready to merge", CI yeşil. Deneyin kendisi insan koordinasyonu istiyor — GATE bu ayın sonunda hâlâ açık.

**19-21 Temmuz — Kapalı piyasada işlem: bekleyen emir (5 görev, worktree'de subagent-driven)**
Midas 24/5 esinli mekanik: piyasa kapalı/veri bayatken AL/SAT artık reddedilmez — emir kuyruğa girer, açılışı izleyen ilk taze fiyatta otomatik gerçekleşir (bakiye yetmezse izole iptal). Yahoo fiyat damgası (`regularMarketTime`) `FxValue.priceAt` olarak yüzeye çıktı; `orders/` domain modülü + `nextMarketOpen` takvimi; store'da kuyruk/settle/kalıcılık — planın kendi "en riskli" görevi, 3 review turunun üçü de gerçek hata buldu (çift-dolum riski, ayırt etmeyen restore testi, `computeInitialActiveUs`'ün kripto/emtia/döviz'i `activeUs`'e sızdırması). UI'da kuyruk toast'u + KAPANIŞ rozeti + İPTAL + DataInfoModal metni; E2E'ye 15. senaryo (`pending-order.spec.ts`: AL/SAT asla disabled değil). Final Opus review'ın yakaladığı tüketicisiz `marketBadge` PriceRow'a kablolandı. BIST gerçekten kapalıyken manuel tarayıcı doğrulaması yapıldı; fast-forward merge (8 commit), CI yeşil.

**22 Temmuz — Sabah denetimi: kayıp 0007 vakası + hijyen turu**
"Mühendis gibi mi ilerledik" denetimi gerçek bir drift çıkardı: 19 Temmuz'da kopan bir worktree oturumu 0004+0006 migration'larını prod'a uygulamış, kalıntı service_role yetkilerini (TRUNCATE/REFERENCES/TRIGGER) geri çeken 0007'yi yazıp hem lokal hem prod'a basmış — ama hiçbirini commit'leyememişti. Repo↔prod 3 gün ayrık kaldı; memory.md iki oturum boyunca "0006 yalnız lokal" diye yanlış bilgi taşıdı (22 Temmuz sabah incelemesi önce bu bayat kayda dayanıp yanlış alarm verdi, sonra prod `schema_migrations` + Vercel loglarıyla gerçek durumu çıkardı). 0007 sahipsiz worktree'den birebir kurtarılıp repo'ya aynalandı, memory.md/CLAUDE.md senkronlandı, worktree+branch temizlendi; telemetri prod'da canlı doğrulandı (7 visit / 6 oyuncu / 1 first_trade, 19-22 Tem). Ek hijyen: merge'lenmiş iki remote branch (`feat/mobil-duzen`, `feat/sade-zaman`) silindi, CI action'ları Node 24 sürümlerine yükseltildi (checkout/setup-node v5), 9 crawler'ın 404 gürültüsünü kesen `robots.txt` + `sitemap.xml` eklendi. Ders hafızaya işlendi: prod'a dokunan işlem, artefaktını oturum sonunu beklemeden commit'ler.
