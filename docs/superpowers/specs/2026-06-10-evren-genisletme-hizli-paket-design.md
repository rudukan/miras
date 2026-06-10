# Evren Genişletme — Hızlı Paket + Piyasa Listesi Düzeni

**Tarih:** 2026-06-10 · **Durum:** Tasarım onaylı (brainstorm bölüm bölüm sunuldu, kullanıcı onayladı)

## 1. Amaç ve Bağlam

"Başka hangi yatırım araçlarını ekleyebiliriz" brainstorm'unun ilk uygulanabilir dilimi.
Süzgeç **C = kesişim**: kültürel fantezi gücü × teknik ucuzluk birlikte puanlandı.

Bu dilim üç işi kapsar:

1. **Gram gümüş** canlı kataloğa girer (proxy zaten `XAGGRAM` çekiyor — neredeyse bedava).
2. **4 yeni kripto:** SOL, XRP, DOGE, AVAX (Binance WS altyapısı hazır; AVAX'ın Türk kurucusu kültürel kanca).
3. **Piyasa listesi yeniden düzeni:** kullanıcı şikâyeti "çok dağınık" → hibrit sekme+grup düzeni + satır temizliği.

Motor (`gameState.ts`), oracle (`usdOracle.ts`) ve Binance WS koduna **dokunulmaz** —
değişiklik yalnız katalog + UI katmanında.

## 2. Yol Haritası Kararları (bu spec'in dışında, sıraya girenler)

| İş | Durum |
|----|-------|
| **Mevduat dilimi** | SIRADAKİ ayrı iş — rafta hazır `domain/deposit/` (15 test) USD-taban motora bağlanacak; vade/faiz kaynağı/panel/gerçek-zaman bekleme mekaniği kendi brainstorm'unu hak ediyor. Retention sinerjisi: gerçek-zamanda 32 günlük vade = 32 gün gerçek bekleyiş → dönüp bakma kancası. |
| **ABD hisseleri** | Onun ardından ayrı sprint — BIST arama akışının USD-native kopyası (Yahoo soneksiz, kur çevrimsiz) + NYSE takvimi. |
| **Elenenler** | Çeyrek/yarım/tam altın (kullanıcı: gerek yok; türetilmiş fiyat "doğru mu?" süzgecine takılır) · KKM (ürün gerçekte kapandı) · Eurobond/TEFAS/tahvil (borsacı işi, kitle süzgecine takılır) · araba (veri yok). Emlak Task 5b'de beklemeye devam (ayrı kurgu modeli ister). |

## 3. Varlık Ekleme (katalog katmanı)

`src/lib/catalog/liveAssets.ts` → `LIVE_ASSETS`'e 5 satır:

| id | label | category | source |
|----|-------|----------|--------|
| `SOL` | Solana | crypto | crypto |
| `XRP` | Ripple | crypto | crypto |
| `DOGE` | Dogecoin | crypto | crypto |
| `AVAX` | Avalanche | crypto | crypto |
| `XAGGRAM` | Gram Gümüş | commodity | yahoo |

- Türev listeler (`CRYPTO_SYMBOLS`, `CRYPTO_SET`, `CORE_ASSETS`, `BIST_SYMBOLS`) filtreden üretiliyor → kendiliğinden doğru.
- Fiyat yolları mevcut genel mekanizma: kripto → `cryptoUsd` (kayıpsız USD), `XAGGRAM` → `fxCache.prices[id]/usdTry` (proxy `SI=F`'i zaten her snapshot'ta çekiyor).
- Binance WS aboneliği sembol listesinden türediği için kod değişmez (`solusdt@trade` vb. otomatik).
- **Uygulama sırasında doğrulanacak:** SOLUSDT / XRPUSDT / DOGEUSDT / AVAXUSDT pariteleri Binance spot'ta dönüyor mu (ticker smoke).

## 4. Piyasa Listesi Yeniden Düzeni (UI)

### 4.1 Bileşen yapısı (CLAUDE.md ~200 satır kuralı)

- `PriceList.svelte` → kabuk: arama kutusu + kategori sekmeleri + liste orkestrasyonu.
- **Yeni** `PriceRow.svelte` → tek varlık satırı (props: row, onSelect).
- **Yeni saf helper** `groupByCategory(prices)` → `src/lib/components/format.ts` (testlenebilir; kategori sırası sabit: crypto → bist → commodity → fx).

### 4.2 Sekmeler (karar: hibrit C)

`TÜMÜ · KRİPTO · BIST · ALTIN&GÜMÜŞ · DÖVİZ`

- **TÜMÜ** = tüm varlıklar kategori başlıkları altında gruplu.
- Kategori sekmesi = yalnız o grubun satırları (başlığıyla birlikte — tek render yolu).
- Etiket kararı: "EMTİA" jargon → hedef kitle (sıradan kriz-insanı) için **ALTIN&GÜMÜŞ**. Grup başlığında da aynı etiket.
- ABD hisseleri geldiğinde **ABD** sekmesi eklenecek (bu spec'te yok).
- Sekme durumu: `let tab = $state('all')` — store'a girmez, salt UI durumu.

### 4.3 Arama (karar: A — arama her şeyi ezer)

- Yazmaya başlayınca sekme yok sayılır, tüm evrende aranır.
- **Arama sonuçları da aynı gruplu görünümle çizilir** (özel düz-liste yolu yok — tek render yolu).
- Altına mevcut "BIST100 — Ekle" bölümü gelir (`+ EKLE` satırları, davranış değişmez).
- Kutu boşalınca seçili sekme görünümüne dönülür.

### 4.4 Satır temizliği

- Satırdaki kategori etiketi (KRİPTO/BIST/…) **kalkar** — grup başlığı zaten söylüyor; satır kısalır.
- **% rozeti fiyatın yanına** taşınır (aynı satır), **USD karşılığı altta** küçük kalır.
- **AÇIK rozeti tamamen kalkar.** Yalnız piyasa **kapalıyken** satırda `KAPALI` görünür (kripto 7/24 → hiç rozet yok). Dağınıklığın ana kaynağı her satırda tekrarlayan "AÇIK" yazısıydı.
- **Fiyatı henüz gelmemiş satır** (ör. ekran görüntüsündeki Ethereum "—"): % rozeti **gizlenir**, satır soluk (opacity) çizilir — "—" + canlı % rozeti tutarsızlığı kapanır.
- Renkler `term.*` token'larından; hard-coded hex yok.

## 5. Test ve Doğrulama

- **Katalog testleri:** 5 yeni varlık var/etiketli; `CRYPTO_SET` üyelikleri (SOL/XRP/DOGE/AVAX ∈, XAGGRAM ∉); `CORE_ASSETS` BIST içermez.
- **`groupByCategory` TDD:** boş liste → boş; karışık giriş → sabit kategori sırası; grup içi giriş sırası korunur; bilinmeyen kategori sona.
- **Store:** yeni kriptoların oracle yolu mevcut genel testlerle kapsanıyor; gerekirse 1-2 ek üyelik testi.
- **Binance smoke:** 4 yeni USDT paritesi ticker'dan gerçek veri dönüyor (uygulama sırasında).
- **Kapanış gate'i** (`verification-before-completion`): `npm run test` + `npm run check` + `npm run build` yeşil + dev server'da gözle smoke: 4 coin + gümüş fiyatı akıyor, sekmeler/gruplar çalışıyor, ETH-tipi eksik fiyat satırı soluk ve rozetsiz.

## 6. Kapsam Dışı

- Mevduat, ABD hisseleri (bölüm 2 — sıradaki ayrı işler).
- Motor/oracle/WS değişikliği; emir sistemi; sıralama/favori özellikleri.
- Mobil yerleşim; genel 3-kolon ekranın yeniden tasarımı (playtest bulgusu yönü verecek — [project-state] içgörüsü).

## 7. Kabul Kriterleri

1. Piyasa listesinde 9 çekirdek varlık (BTC, ETH, SOL, XRP, DOGE, AVAX, Gram Altın, Gram Gümüş, EUR) + aktif BIST'ler (THYAO, ASELS + aramayla eklenenler).
2. Yeni kriptolar canlı tick alıyor (WS), gümüş poll'dan TRY+USD fiyat gösteriyor; ikisi de AL/SAT'tan işlem görebiliyor (mevcut genel yol).
3. Sekmeler: TÜMÜ gruplu, kategori sekmesi filtreli; arama sekmeyi ezip gruplu sonuç + "+ EKLE" gösteriyor.
4. Satırlarda kategori etiketi ve "AÇIK" rozeti yok; KAPALI yalnız kapalı piyasada; fiyatsız satır soluk ve %-rozetsiz.
5. Tüm test/check/build yeşil; motor dosyalarının `git diff`'i boş.
