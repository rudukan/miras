# Grafik İyileştirme + BAĞLAM Kaldırma — Tasarım (Spec)

**Tarih:** 2026-07-14
**Durum:** Onaylandı (brainstorming), plan yazımı bekliyor
**Tetikleyici:** Kullanıcı Canlı Seans ekranındaki statik BAĞLAM satırını kaldırmak ve pop-up fiyat grafiğini "daha iyi" hale getirmek istiyor. Netleştirme sonucu: görsel kalite + daha fazla bilgi + tooltip etkileşimi + tam boy "büyüt" overlay'i (mum grafik İSTENMEDİ).

---

## 1. Amaç & Kapsam

**Amaç:** İki bağımsız iş tek dilimde:

1. **BAĞLAM satırı tamamen silinir** — `src/lib/components/ContextCard.svelte`, `src/lib/data/contextCard.ts`, `src/lib/data/contextCard.test.ts` ve `src/routes/+page.svelte`'deki import+kullanım (satır ~34 ve ~706). Git geçmişinde durur; geri istenirse tek revert. Not: çok-kullanıcılı-yayın spec'i §4.3'ün tanımladığı yüzeydi — bu spec onu süpersede eder, eski spec'e dokunulmaz.
2. **Fiyat grafiği üç eksende iyileşir** (tek grafik yüzeyi `AssetPopover` içindeki `PriceChart`):
   - **Görsel kalite:** devicePixelRatio ölçekleme (bulanıklığın kök nedeni), çizgi altı degrade dolgu, açılış fiyatında kesikli referans çizgisi, son noktada dot.
   - **Bilgi:** min/max fiyat etiketleri (köşe bindirme), zaman ekseni etiketleri, seçili periyodun değişim yüzdesi (renkli).
   - **Etkileşim:** fare/parmak crosshair + o noktanın fiyat ve zamanını gösteren tooltip.
   - **Büyüt:** pop-up'a ⤢ BÜYÜT düğmesi → tam boy modal overlay (büyük grafik + periyot düğmeleri + Bende/maliyet + **TradeForm dahil** — overlay'den işlem yapılabilir).

**Kapsam dışı (bu iş değil):**
- Mum grafik / OHLC görünümü (kullanıcı istemedi).
- Grafiğe canlı tick beslemesi (seri 30sn TTL ile yeterli; canlı fiyat zaten başlıkta akıyor; geçmiş seriye canlı nokta karıştırmak birim/mühür karmaşası getirir).
- `/api/series` veya upstream değişikliği (veri granülaritesi yeterli).
- VASİYET/senaryo modları, emlak, lig — dokunulmaz.

## 2. Başarı Kriterleri (doğrulanabilir)

1. BAĞLAM satırı UI'da yok; üç dosya silinmiş; `npm run test` + `npm run check` + `npm run build` yeşil.
2. Grafik çizgisi %125-150 Windows ölçeğinde keskin (DPR ölçekleme kodda; gözle doğrulama ekran görüntüsüyle).
3. Pop-up grafiğinde: dolgu + referans çizgisi + son-nokta dot + min/max etiketleri + zaman etiketleri + seçili periyot %'si görünür.
4. Grafik üzerinde gezinince crosshair + tooltip çıkıyor; tooltip fiyatı **serinin ham para birimiyle** gösteriyor (crypto → $, yahoo → ₺), zamanı periyoda uygun formatta gösteriyor.
5. ⤢ BÜYÜT → overlay açılıyor: büyük grafik (tüm özellikler), periyot düğmeleri, Bende/maliyet, çalışır TradeForm; Escape/backdrop/✕ ile kapanıyor; mobilde tam ekran.
6. Yeni domain fonksiyonları (`timeTicks`, `nearestIndex`, `seriesCurrency`) TDD ile yazılmış, testleri deterministik (sabit epoch + `Europe/Istanbul`).
7. E2E: mevcut 10 senaryo yeşil kalır; +1 smoke senaryo (popover → BÜYÜT → overlay görünür → kapat) eklenir ve CI'da geçer.

## 3. Bileşen Mimarisi

Katmanlama mevcut deseni izler: saf domain → saf çizim modülü → ince Svelte.

| Birim | Yer | Sorumluluk |
|-------|-----|------------|
| `timeTicks(points, period, maxTicks)` | `src/lib/domain/series/series.ts` (mevcut modül — grafik-serisi matematiği zaten bunun tek sorumluluğu) | Eşit aralıklı ~3-6 nokta indeksi + periyoda göre Türkçe etiket. X konumu **indeks-tabanlı** (çizgiyle aynı ölçek — BIST seans boşlukları çizgide kompres, etiket gerçek saati söyler, dürüst). `Intl.DateTimeFormat` `tr-TR` + **`timeZone: 'Europe/Istanbul'` sabit** (CI=UTC vs lokal=+03 driftini keser). |
| `nearestIndex(n, xRatio)` | aynı yer | Crosshair için en yakın nokta indeksi (x eşit aralıklı olduğundan saf aritmetik). |
| `seriesCurrency(source)` | aynı yer | `'crypto' → 'USD'`, `'yahoo' → 'TRY'`. Binance serileri USDT(≈USD), Yahoo serileri TRY — etiket/tooltip birimi buradan. |
| `drawChart(ctx, geometry, opts)` | `src/lib/components/chart/drawChart.ts` | Canvas'a yalnız statik resim: DPR ölçek, degrade dolgu (çizgi renginin ~%18→0 alfası), ilk fiyatta kesikli referans çizgisi, çizgi (1.5px), son noktada dot. Renkler mevcut `cssVar` yöntemiyle `term.*` token'larından — hard-coded hex yok. |
| `PriceChart.svelte` | mevcut dosya | İnce kalır: props `{points, width, height, source, period}`. Tooltip/crosshair iki yüzeyde de (popover + overlay) açıktır — bayrak yok. Canvas + HTML bindirmeleri (min/max, zaman etiketleri, "veri yok"). ~200 satıra yaklaşırsa hover katmanı `ChartHover.svelte`'e ayrılır (plan kararı). |
| Crosshair/tooltip | HTML bindirme (canvas DEĞİL) | Dikey çizgi + nokta + tooltip mutlak konumlu div'ler. Hover'da canvas yeniden çizilmez (saniyelik fiyat akışı olan uygulamada bedava performans; metin de canvas'tan keskin). `pointermove`/`pointerleave`; dokunmatikte `touch-action: none` grafik alanında. |
| `PeriodTabs.svelte` | `src/lib/components/chart/` | Periyot düğmeleri — popover ve overlay ortak kullanır (şu an popover'da inline). Yanında seçili periyodun `changePct`'i renkli rozet. |
| Seri yükleme yardımcısı | `src/lib/components/chart/useSeries.svelte.ts` | `AssetPopover`'daki fetch `$effect`'i (id+source+period → points/loading, iptal korumalı) paylaşılan Svelte-5 yardımcısına çıkar; popover + overlay ikisi de kullanır. |
| `ChartOverlay.svelte` | `src/lib/components/` | Tam boy modal: backdrop (karartma), `role="dialog"` + `aria-modal`, Escape/backdrop/✕ kapatır, açılışta odak ✕'e. Masaüstü: ortalanmış geniş panel (~max-w-3xl), grafik yüksekliği ~340px, genişlik `bind:clientWidth` ile konteynerden. Mobil: tam ekran kayan kolon. İçerik: başlık (ad, canlı `priceTry`, günlük %), büyük grafik, `PeriodTabs` + periyot %'si, Bende/maliyet satırı (popover'la aynı hesap), `TradeForm`. |
| `AssetPopover.svelte` | mevcut dosya | Başlığa ⤢ BÜYÜT düğmesi (`onExpand` prop'u); grafik alanı aynı kompakt boyutta kalır ama yeni PriceChart özellikleriyle. |
| `+page.svelte` | mevcut dosya | Popover state'inin yanına `overlayAssetId` state'i; BÜYÜT → popover kapanır, overlay açılır. Satır `store.prices`'tan `$derived` — canlı akmaya devam eder; varlık listeden kalkarsa overlay kendini kapatır. |

## 4. Veri Akışı

Değişmez: tarayıcı → `fetchPriceSeries` → `/api/series` (TTL cache, sembol başına) → Binance klines / Yahoo chart. Overlay aynı zinciri `useSeries` üzerinden kullanır. Periyot başına granülarite mevcut haliyle yeterli (15D:1m, 1G:5m-1m, 1H:30m-1h, 1A:1d, 1Y:1wk).

## 5. UX Detayları

- **Birim dürüstlüğü:** Tooltip/min-max/referans etiketi serinin **ham birimini** gösterir: BTC serisi $ (Binance), THYAO/altın ₺ (Yahoo). Tarihsel seriyi bugünkü kurla TRY'ye çevirmek yanlış tarih üretir — yapılmaz. Pop-up başlığındaki canlı ₺ fiyatla fark, birim simgesiyle netleşir.
- **Zaman etiket formatları** (`tr-TR`, `Europe/Istanbul`) — eksen / tooltip: 15D/1G → `14:32` / `14:32` · 1H → `Sa 14:00` / `Sa 14:32` · 1A → `12 Tem` / `12 Tem` · 1Y → `Tem 25` / `12 Tem 25`.
- **Min/max etiketleri:** grafik içinde köşe bindirme (max sol-üst, min sol-alt), yarı saydam panel arka planıyla okunur; ek dikey alan yemez.
- **Periyot değişim %'si:** `computeChartGeometry.changePct` zaten hesaplı — `PeriodTabs` satırında sağda renkli (`term.green/red`) gösterilir. Başlıktaki günlük % olduğu gibi kalır.
- **Loading/boş:** mevcut davranış korunur — `yükleniyor…` bindirmesi, `<2 nokta → "veri yok"`.

## 6. Hata Durumları

- Seri fetch hatası → boş dizi → "veri yok" (mevcut sözleşme, değişmez).
- Overlay açıkken varlık listeden kalkarsa (`store.prices`'ta yok) → overlay kendini kapatır.
- SSR: canvas/DPR erişimi yalnız `$effect` içinde (mevcut desen) — sunucuda çalışmaz, guard korunur.

## 7. Test Planı

- **Domain (Vitest, TDD, RED→GREEN):** `timeTicks` (5 periyot formatı, sabit epoch'larla; maxTicks sınırları; <2 nokta → boş), `nearestIndex` (uçlar, orta, tek nokta), `seriesCurrency` (iki kaynak). Mevcut `computeChartGeometry` testleri değişmez.
- **Bileşen yardımcıları:** yeni formatlayıcı gerekirse `components/format.ts` desenine uyar (node'da test).
- **E2E (+1 senaryo):** popover aç → ⤢ BÜYÜT → overlay `role="dialog"` görünür + grafik canvas'ı var + TradeForm görünür → Escape ile kapanır. `/api/series` E2E piyasa mock'una RegExp route olarak eklenir (mevcut mock kalıbı; sabit küçük seri döner). `workers: 1` düzeni korunur.
- **Kapanış doğrulaması:** `npm run test` + `npm run check` + `npm run build` + lokal `npm run e2e` yeşil (verification-before-completion).

## 8. Riskler & Notlar

- **Timezone determinizmi:** tüm zaman formatlaması `Europe/Istanbul` sabitli — testler CI'da (UTC) ve lokalde aynı sonucu verir. Node'un ICU'suna güveniyoruz (`Intl` full-icu, Node 18+ varsayılan — CI Node'u da böyle).
- **Bileşen boyutu:** PriceChart + hover + etiketler 200 satırı zorlarsa hover `ChartHover.svelte`'e ayrılır; plan bunu task olarak içerir.
- **Popover genişliği:** kompakt grafik 274px kalır; min/max köşe bindirmeleri dar alanda taşmamalı (etiket font 9-10px).
- **BÜYÜT keşfedilebilirliği:** düğme popover başlığında metinli (`⤢ BÜYÜT`) — salt ikon değil.
- **Erişilebilirlik:** overlay dialog semantiği + odak yönetimi bu dilimde temel seviyede; tam erişilebilirlik geçişi SP3b'de (mevcut backlog kaydıyla tutarlı).
