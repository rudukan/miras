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
