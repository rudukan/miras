# Kapalı Piyasada İşlem — Bekleyen Emir (Açılış Kuyruğu)

**Tarih:** 2026-07-19 · **Durum:** Onaylı (kurucu, Fable oturumu) · **Triyaj:** Orta
**Bağlam:** Kurucu isteği (2026-07-16): "Midas gibi, piyasa kapalıyken de işlem yapabilelim — ABD + BIST."
Araştırma: auto-memory `abd-borsasi-gece-piyasasi` (Midas 24/5 ve limit-emir-only; Yahoo `includePrePost`
yolu; BIST'te gece fiyatı diye bir şey dünyada yok). Kurucunun net çerçevesi: "kullanıcı istediği işlemi
yapabilsin, gösterim dürüst olsun — illa canlı olması gerekmiyor."

## Karar özeti (tek kural)

Emir her zaman kabul edilir. Varlıkta **taze fiyat** varsa bugünkü gibi anında gerçekleşir; yoksa
**bekleyen emir** olur ve gelen ilk taze fiyattan otomatik gerçekleşir.

"Seans kapalı" ile "veri bayat" (`fxStale`) aynı yola düşer — `tradeBlockReason`'ın iki blok nedeni de
kalkar, emir kabulü hiçbir zaman reddedilmez (gerçekleşme anında iptal olabilir, aşağıda). Kripto dahil
tüm varlıklar aynı kurala uyar; kripto fiilen hep anında (WS canlı), yalnız bağlantı koptuğunda o da
kuyruğa düşer. Özel durum ve ikinci kavram yok.

**Elenen alternatifler:** donuk-son-fiyattan-anında-işlem (ligde bayat-fiyat arbitraj deliği + yanlış
finans modeli); Midas-birebir limit emir + 4 isimli seans (en pahalı; hedef "işlemi yapabilmek",
canlılık değil). Limit emir ileride bu kuyruğun ÜSTÜNE eklenebilir — kuyruk altyapısı ön koşulu.

## "Taze fiyat" tanımı — kritik tuzak

Koşul iki parçalı: `isMarketOpen(kategori, şimdi)` **VE** sembolün fiyat damgası (Yahoo
`regularMarketTime` / son bar zamanı) bugünkü seans açılışından sonra. Seans kavramı olmayan
kategorilerde (kripto/döviz/emtia — `isMarketOpen` hep true) ikinci parça "feed canlı / veri bayat
değil" koşuluna indirgenir.

Tek başına `isMarketOpen` YETMEZ: Yahoo ~15 dk gecikmeli — BIST 10:00'da açılınca feed ~10:15'e kadar
hâlâ dünkü kapanışı gösterir. Damga kontrolü olmazsa kuyruk emirleri dünkü fiyattan dolar ve Task 10'un
kapattığı bayat-fiyat arbitraj deliği bu özellikle geri açılır. Sonuç: BIST emirleri ~10:15 civarı,
ABD emirleri açılıştan hemen sonra, kripto anında dolar — bu gecikme DataInfoModal'da belgeli veri
gerçeğinin dürüst yansımasıdır.

## Domain: yeni modül `src/lib/domain/orders/`

Saf TS; yalnız `money.ts` + kendi type'larına bağımlı (sistem sınırı kuralı).

- `PendingOrder { id, assetId, side: 'buy'|'sell', kind: 'units'|'amountUsd', units?, amountUsd? (Money), placedAt }`
- Tutar-modunda adet çevrimi **gerçekleşme anında** (`resolveUnits(order, fillPriceUsd)`) — "kapalıyken
  $500'luk TSLA al" emri açılış fiyatıyla boyutlanır, bayat fiyatla değil.
- Karar mantığı saf fonksiyonlarda (`isPriceFresh(...)`, `resolveUnits(...)` vb.); kuyruk VERİSİ store'da yaşar.

## Store entegrasyonu (`liveGameStore`)

- `tradeBlockReason(assetId)` → **`tradeMode(assetId): 'instant' | 'queued'`**. Tek-kaynak deseni
  korunur: hem `apply()` içindeki yönlendirme hem TradeForm etiketi aynı fonksiyonu okur. `buy`/`sell`
  dış imzaları değişmez; içeride `queued` ise emir kuyruğa yazılır.
- **Settle döngüsü: yeni timer YOK.** Fiyat güncellemelerinin zaten işlendiği yerde (poll sonucu +
  WS tick sonrası, `ensureSeal()` civarı) `settlePendingOrders()` çağrılır. Dolan emir mevcut
  `buyAsset`/`sellAsset` yolundan geçer — komisyon, mühürlü kur çevrimi ve `onFirstTrade` telemetrisi
  otomatik doğru çalışır.
- **Kalıcılık:** `pendingOrders` save JSON'ına alan olarak girer (localStorage + bulut `saves`).
  Eski kayıtta alan yoksa `[]` varsayılır. **DB migration gerekmez.**
- **Offline:** açılış anında oyuncu offline'sa emirler, uygulama tekrar açıldığında görülen ilk taze
  fiyattan dolar (kira tahakkukunun zaman-damgası mantığıyla tutarlı; client-authoritative).
- Bekleyen emri olan sembol `activeBist`/`activeUs`'ten düşürülmez (holding koruması genişler).
- `nextMarketOpen()` 'us' kategorisini de öğrenir (UI'da "açılışa ~X" göstermek için).

## Gerçekleşme kuralları

- Kısmi dolum yok — tam dolar ya da iptal olur (likidite simülasyonu yok).
- Rezervasyon yok; **fail-at-fill**: gerçekleşme anında bakiye (AL) / adet (SAT) yetmezse emir net bir
  mesajla iptal olur. Emir verilirken uyarı gösterilir ("açılışta bakiye yetersizse emir iptal olur").
- Bekleyen emir bir sonraki açılışta (kesin ifadeyle: açılışı izleyen İLK taze fiyatta) **mutlaka
  sonuçlanır** — dolum ya da iptal. GTC/süresiz emir yok.
- Aynı varlıkta birden çok bekleyen emir serbest; her biri tek tek İPTAL edilebilir.

## UI

- **TradeForm:** AL/SAT butonu kapalıyken de çalışır; `queued` modda buton altında tek satır:
  "emir açılışta gerçekleşir; bakiye yetmezse iptal olur".
- **Fiyat rozetleri:** mevcut KAPALI göstergesinin üstüne dürüst ayrım: `CANLI` / `KAPANIŞ`.
- **Cüzdan:** "Bekleyen Emirler" listesi — yön, varlık, adet/tutar, tahmini gerçekleşme (sonraki açılış),
  İPTAL butonu.
- **DataInfoModal:** kuyruk mekaniği + KAPANIŞ rozetinin anlamı, ~2 cümle, mevcut veri dürüstlüğü diliyle.

## Test

- **Domain unit:** taze-fiyat koşulu (damga < açılış → dolmaz), tutar→adet çevrimi, fail-at-fill iptalleri.
- **Store (Vitest):** kapalı/bayatken kuyruğa giriş; taze tick'te settle; kalıcılık roundtrip; iptal;
  bekleyen emirli sembolün aktif listeden düşmemesi.
- **E2E:** saat-bağımlı senaryo EKLENMEZ (gerçek saat akar → flake; clock seam bilinçli ayrı dilim).
  Yalnız "AL/SAT butonu piyasa-kapalı diye asla disable olmaz" smoke'u.

## Bilinçli kapsam dışı

- Limit emir; 4 isimli seans UI'ı; GTC; bakiye rezervasyonu; kısmi dolum.
- `includePrePost=true` canlı pre/post ABD verisi — **ayrı küçük dilim.** Kuyruk "ilk taze fiyat"
  tanımıyla çalıştığı için sonradan eklendiğinde rework çıkmaz; yalnız ABD'nin canlı penceresi genişler
  (+ PriceList'te fiyat Türk akşamı boyunca akar).
- Clock seam / deterministik E2E saati.

## SP2 (lig) notu

Kuyruk lig-güvenli: gerçekleşme her zaman taze fiyattan, bayat fiyat arbitrajı yapısal olarak imkânsız.
Lig geldiğinde sunucu-damgalı fiyat mimarisi kuyruk gerçekleşmelerini de kapsamalı (client-authoritative
dolum, lig sezonunda sunucu doğrulamasına taşınır).

**CLAUDE.md kanon esnetmesi:** yok.
