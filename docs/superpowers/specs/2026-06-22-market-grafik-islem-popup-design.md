# Market Grafik + İşlem Pop-up'ı — Tasarım (2026-06-22)

## Amaç
Markette bir varlığın üstüne gelince (masaüstü hover / mobil dokunma) **yanında bir pop-up**
açılsın: fiyat grafiği + periyot seçimi + "bende ne kadar var" + **gerçek AL/SAT formu**.
Oyuncu listeden ayrılmadan, aşağı inmeden, varlığı görüp oradan işlem yapabilsin.

Bu, hafızada "MVP değil" diye park edilmiş `future-trade-ui-ideas` fikrinin (grafik pop-up'ı +
Midas ilhamı) hayata geçişi. Deney öncesi bilinçli açılıyor (kurucu çağrısı).

## Kilitli Kararlar
| Konu | Karar |
|------|-------|
| Tetik (masaüstü) | Satır üstünde **1 sn** bekleyince açılır (yanlışlıkla geçişte tetiklenmez). |
| Tetik (mobil) | Satıra **dokununca** alt-sayfa (sheet) olarak açılır. |
| İşlem | **Gerçek AL/SAT pop-up içinde** olur (bilgi ekranı değil). |
| Form tekrarı | İşlem formu `TradeForm.svelte`'e **çıkarılır**; hem pop-up hem alttaki İŞLEM PANELİ aynı formu kullanır. Tek doğrulama, tekrar yok. |
| Kapanma (masaüstü) | Hover ile açılır → içine tıkla/odaklan = **sabitlenir (pin)** → dışına tıkla / ✕ / Esc kapatır. İşlem yaparken kaçmaz. |
| Kapanma (mobil) | Dışına dokun / ✕ kapatır. |
| Alttaki İŞLEM PANELİ | **Kalır** (paylaşımlı formla bedava durur). |
| Periyotlar | **15D / 1G / 1H / 1A / 1Y** (15 dakika / gün / hafta / ay / yıl). |
| Veri yükü | Yalnız açılan **tek** sembolün serisi, **talep üzerine** çekilir + cache. 15D & 1G tek `1d` çekiminden türetilir → ekstra istek yok. |
| Grafik | Bağımlılıksız **canvas** çizgi grafik; `term.*` renkleri (yükseliş yeşil / düşüş kırmızı). |

## Mimari

Mevcut sistem sınırlarına uyar: sistemler arası iletişim store üzerinden (pop-up `store`'u
prop alır), API çağrıları yalnız `src/lib/api/` + proxy route altında, domain saf ve test edilebilir.

### 1. Veri katmanı

**`src/lib/domain/series/series.ts`** (saf, TDD — DOM/fetch yok)
```ts
export interface PricePoint { t: number; price: number; } // t = epoch ms
export type PeriodId = '15D' | '1G' | '1H' | '1A' | '1Y';
export interface Period { id: PeriodId; label: string; }
export const PERIODS: ReadonlyArray<Period>;

// Ham upstream dizilerini PricePoint[]'e normalize eden saf yardımcılar.
export function normalizeSeries(raw: ...): PricePoint[];
// 15D = 1G (1d/1m) serisinin son ~15 noktası — ayrı çekim yok.
export function sliceLast(points: PricePoint[], windowMs: number): PricePoint[];

// Çizim geometrisi (genişlik/yükseklik verilince): poly noktaları + min/max/ilk/son/%.
export interface ChartGeometry {
  points: ReadonlyArray<{ x: number; y: number }>;
  min: number; max: number; first: number; last: number; changePct: number;
  rising: boolean; // last >= first
}
export function computeChartGeometry(points: PricePoint[], w: number, h: number): ChartGeometry | null;
```

**Periyot → upstream eşlemesi** (`seriesSource.ts` içinde):
| Periyot | Yahoo (BIST/döviz/altın) | Binance (kripto) |
|---------|--------------------------|------------------|
| 15D | `range=1d&interval=1m` → son 15 nokta | `klines 1m limit=15` |
| 1G | `range=1d&interval=5m` | `klines 5m limit=288` |
| 1H | `range=5d&interval=30m` | `klines 1h limit=168` |
| 1A | `range=1mo&interval=1d` | `klines 1d limit=30` |
| 1Y | `range=1y&interval=1wk` | `klines 1w limit=52` |
(15D, mümkünse 1G ile aynı `1d` çekiminden dilimlenir.)

**`src/lib/api/seriesSource.ts`** — varlık sınıfına göre upstream'i seçer, parse eder, `PricePoint[]` döner.

**`src/routes/api/series/+server.ts`** — cache'li proxy. `?symbol=&period=`. Intraday (15D/1G) ~30s,
günlük/haftalık barlar (1A/1Y) 5–10 dk cache. CLAUDE.md'nin "Yahoo proxy 5s cache" kuralına uyar (alt sınır).

### 2. Grafik
**`src/lib/components/chart/PriceChart.svelte`** (boş `chart/` dizinini doldurur)
- `geometry: ChartGeometry`, `width`, `height` prop'ları.
- Canvas'a çizgi çizer; `rising` → `term.green`, değilse `term.red`. Bağımlılık yok.
- Yeniden çizim `$effect` içinde (geometry değişince); `setInterval`+DOM manipülasyonu yok.

### 3. Pop-up
**`src/lib/components/AssetPopover.svelte`**
- Prop'lar: `store`, `row: PriceRow`, `anchor` (masaüstü konum) / `variant: 'desktop' | 'mobile'`, `onClose`.
- İçerik: başlık (ad + canlı fiyat + %), `PriceChart`, periyot düğmeleri, "Bende: N adet · $X", `TradeForm`.
- Seri durumu: açılınca + periyot değişince talep üzerine fetch; yüklenirken iskelet/"—".
- Masaüstü: satırın yanında konumlanır (ekran kenarına taşarsa sola/üste döner). Mobil: alt sheet + arka plan örtüsü.

**`src/lib/components/TradeForm.svelte`** (TradePanel'den çıkarılır)
- Prop'lar: `store`, `assetId` (pop-up kendi varlığını verir; alttaki panel `selectedAssetId` verir).
- İçerik: adet input + MAX, tutar$ input, TÜMÜ, AL/SAT, başarı toast'ı, hata bandı.
- Gerçek işlem: `store.buy/sell` çağırır (mevcut mantık birebir taşınır).

**`src/lib/components/TradePanel.svelte`** → ince sarmalayıcı: başlık + uyarı metni + boş-durum +
`<TradeForm {store} assetId={selectedAssetId} />`.

### 4. Bağlama (`PriceRow` / `PriceList` / `+page.svelte`)
- `PriceRow`: masaüstü `onmouseenter` → 1 sn timer → `onOpenPopover(row, anchorRect)`; `onmouseleave` → timer iptal.
  Mobil: `onclick` → `onOpenPopover` (sheet). (Mevcut `onSelect`/`onHover` korunur; hover-highlight çalışmaya devam eder.)
- `+page.svelte`: `popoverRow`/`popoverAnchor` state; tek aktif pop-up; pin/outside-click/Esc yönetimi.

## Veri Akışı
```
hover (1sn) / tap
   → AssetPopover açılır (row + period=1G varsayılan)
   → /api/series?symbol=&period= (cache)  → PricePoint[]
   → computeChartGeometry → PriceChart (canvas)
periyot düğmesi → yeni fetch (cache) → yeniden çizim
AL/SAT (TradeForm) → store.buy/sell → toast + cüzdan güncellenir (mevcut akış)
```

## Hata / Sınır Durumları
- Seri çekilemezse: grafik alanında "veri yok" + periyot düğmeleri kalır; işlem formu yine çalışır.
- Fiyatı olmayan (henüz yüklenmemiş) varlık: pop-up açılır ama grafik "—"; AL/SAT fiyat gelene dek mevcut guard'larla korunur.
- BIST ~15 dk gecikmeli: grafik de gecikmeli seriyi gösterir (tutarlı; başlıkta mevcut gecikme notu yeterli).
- Hafta sonu / piyasa kapalı: Yahoo son işlem gününün serisini döner; "KAPALI" rozeti zaten satırda.

## Test / Doğrulama
- **Domain `series/`**: `normalizeSeries`, `sliceLast`, `computeChartGeometry` birim testleri (TDD; min/max, tek nokta, boş dizi, yükseliş/düşüş, taşma kenarları).
- **`seriesSource`**: Yahoo/Binance parse testleri (sahte response).
- **Proxy route**: cache + sınıf-dağıtım testi.
- **Tarayıcı doğrulama**: masaüstü hover (1 sn → açılır, pin, dışa tıkla → kapanır, periyot değişimi, gerçek AL/SAT),
  mobil dokunma (sheet açılır/kapanır, işlem). Görsel ekran görüntüsüyle.

## Kapsam Dışı (YAGNI)
- Mum (candlestick) grafiği — sadece çizgi.
- Çoklu varlık karşılaştırma / overlay.
- Grafik üzerinde teknik gösterge, zoom/pan.
- Pop-up içinde mevduat veya başka aksiyon (yalnız AL/SAT).
