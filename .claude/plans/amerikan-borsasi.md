# Plan: Amerikan Borsası (ABD Hisseleri) — CANLI SEANS yeni varlık sınıfı

> **Durum: ONAYLANDI, UYGULAMA BAŞLAMADI.** Kullanıcı 2026-07-03'te "tokenler bitiyor, planı kaydedip sonra devam edelim" dedi — bu dosya bir sonraki oturumun keşif yapmadan doğrudan uygulamaya geçmesi için yazıldı. Aşağıdaki tüm mimari kararlar kod okunarak doğrulandı, varsayım YOK.

## Context

`memory.md` Bölüm 4 "Aktif Plan"daki 5 adımlık sıra (emlak→lig→tapu/rüşvet→paylaşım→araya serpme) kullanıcı tarafından **kesildi**: emlak dilimi bitince kullanıcı "emlak tarafını şimdi gizleyelim, canlıda görmek istemiyorum, en iyisi Amerikan borsası ekleyelim" dedi. Yani:
- **Emlak: gizlendi** (silinmedi). `src/routes/+page.svelte`'den `PropertyCard` import+mount kaldırıldı, commit `02df9fc`, prod'a deploy edildi. Domain/store/testler (`property.ts`, `gameState.ts` buyProperty/sellProperty/collectPropertyRent, `liveGameStore.svelte.ts` propertiesUsd) DOKUNULMADI — geri açmak için 2 satır (`import PropertyCard...` + `<PropertyCard {store} nowMs={nowMs} />`) yeterli.
- **Sıradaki aktif iş artık bu plan** (Amerikan Borsası), "haftalık lig" gibi diğer adımlar rafa kalktı — kullanıcı açıkça istemeden onlara dönülmeyecek.

## Mimari keşif özeti (neden bu kadar kolay)

- Yahoo proxy (`fetchYahooQuote`) zaten herhangi bir Yahoo sembolünü çekebiliyor; BIST sembollerine özel olan tek şey `.IS` soneki. ABD tikeri (örn. `AAPL`) sonek istemeden direkt çalışır.
- Altın/gümüş ZATEN "USD fiyatı çek → `usdTry` ile TRY'ye çevir → aynı `prices` (TRY) torbasına koy" kalıbını kullanıyor (`yahooSource.ts:83-89`). ABD hisseleri için AYNI kalıp uygulanacak — store'da (`liveGameStore.svelte.ts`) `oracle.assetUsd`/`source.assetTry` içinde YENİ BİR DAL AÇILMIYOR, çünkü onlar zaten "CRYPTO_SET'te değilse `fxCache.prices[id]`'den TRY oku, `sealedUsdTry()`'a böl" diye generic çalışıyor.
- `buyAsset`/`sellAsset` (`gameState.ts`) tamamen assetId-agnostik — BIST on-demand (`addBist`) ile zaten kanıtlı. Alım/satım tarafında HİÇBİR DEĞİŞİKLİK gerekmiyor.
- BIST'in "sabit varsayılan set (`DEFAULT_BIST`/`BIST_SYMBOLS`) + arama ile ekle (`BIST100`/`searchBist100`)" ikili kalıbından, ABD için kullanıcı SADECE "arama ile ekle" kısmını istedi (AskUserQuestion'da "Aranabilir katalog" seçildi, sabit varsayılan liste seçilmedi) → **`activeUs` başlangıçta boş dizi**, sabit varsayılan YOK.
- Seans saatleri: kullanıcı "tam hassas (NYSE tatil takvimi dahil)" seçti. NYSE gerçek saatleri 9:30–16:00 **New York yerel saati** (Türkiye'nin aksine ABD DST uyguluyor — `Intl.DateTimeFormat({timeZone:'America/New_York'})` bunu otomatik hesaplar, manuel UTC-offset hesaplamaya GEREK YOK, `istanbulParts` ile birebir aynı teknik parametrize edilir).
- `nextMarketOpen()` (`calendar.ts:64`) hiçbir UI/store tarafından tüketilmiyor (sadece kendi test dosyasında) → **'us' için GENİŞLETİLMİYOR** (DST-aware "bir sonraki açılış anı" hesaplamak, sabit-offset Istanbul kalıbıyla yapılamaz, gerçek tüketicisi yokken gereksiz iş).
- `marketOpen` alanı PURE COSMETIC (`PriceRow.svelte:60` — sadece "KAPALI" rozeti), alım/satımı ENGELLEMİYOR. ABD için de aynı: kapalıyken bile trade edilebilir, sadece rozet gösterir.

## Karar kayıtları (kullanıcı onayı ile netleşti)

1. **Hisse seti:** Aranabilir katalog (BIST100 arama kalıbının birebir kopyası), sabit varsayılan YOK.
2. **Seans saatleri:** Tam hassas — gerçek NYSE saatleri + 2026 NYSE resmi tatil takvimi. Yarım-gün erken kapanışlar (Şükran ertesi, Noel arifesi vb.) KAPSAM DIŞI — sade tutuluyor, istenirse sonra eklenir.

## Uygulama — dosya dosya

### 1. `src/lib/catalog/usStocks.ts` + `usStocks.test.ts` (YENİ)
`bist100.ts`/`bist100.test.ts` ile BİREBİR AYNI kalıp:
```ts
export interface UsStockEntry { readonly symbol: string; readonly name: string; }
export const US_STOCKS: ReadonlyArray<UsStockEntry> = [ ... ];
export function usStockName(symbol: string): string { ... } // bilinmeyende sembolün kendisi
export function searchUsStocks(query: string): UsStockEntry[] { ... } // SEARCH_LIMIT=12, sembol|ad case-insensitive
```
Öneri liste (~48 tanınmış, YALNIZ düz alfanümerik ticker — nokta/tire İÇEREN sembol YOK, örn. BRK.B EKLENMEDİ, URL query-string'te virgülle ayrılan listeye karışabilir):
`AAPL Apple, MSFT Microsoft, GOOGL Alphabet, AMZN Amazon, NVDA Nvidia, META Meta Platforms, TSLA Tesla, JPM JPMorgan Chase, V Visa, MA Mastercard, UNH UnitedHealth, HD Home Depot, PG Procter & Gamble, JNJ Johnson & Johnson, KO Coca-Cola, PEP PepsiCo, DIS Walt Disney, NFLX Netflix, ADBE Adobe, CRM Salesforce, ORCL Oracle, INTC Intel, AMD Advanced Micro Devices, QCOM Qualcomm, CSCO Cisco, IBM IBM, WMT Walmart, MCD McDonald's, NKE Nike, SBUX Starbucks, BA Boeing, GE General Electric, CAT Caterpillar, XOM Exxon Mobil, CVX Chevron, PFE Pfizer, MRK Merck, ABBV AbbVie, T AT&T, VZ Verizon, BAC Bank of America, WFC Wells Fargo, GS Goldman Sachs, MS Morgan Stanley, C Citigroup, PYPL PayPal, UBER Uber, ABNB Airbnb, SPOT Spotify, SHOP Shopify`
Test: `bist100.test.ts` testlerinin birebir kopyası (yapı, tekillik, `usStockName`, `searchUsStocks`).

### 2. `src/lib/domain/calendar/nyseHolidays2026.ts` (YENİ)
`holidays2026.ts` kalıbı, 10 tarih (hesaplandı, Jan1,2026=Perşembe temel alınarak doğrulandı — sadece TAM GÜN kapanışlar, yarım günler yok):
```ts
export const NYSE_HOLIDAYS_2026: ReadonlySet<string> = new Set<string>([
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Washington's Birthday
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (gözlemlenen — 4 Temmuz Cumartesi'ye denk geliyor)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving Day
  '2026-12-25', // Christmas Day
]);
```

### 3. `src/lib/domain/scenario/types.ts` (DEĞİŞECEK)
`AssetCategory = 'bist' | 'crypto' | 'commodity' | 'fx' | 'us'`

### 4. `src/lib/domain/calendar/calendar.ts` + `calendar.test.ts` (DEĞİŞECEK)
- Yeni `newYorkParts(at: Date): IstanbulParts`-benzeri fonksiyon — `istanbulParts` ile AYNI teknik, sadece `timeZone: 'America/New_York'` (DST otomatik, Intl hallediyor).
- `isMarketOpen`'a 'us' dalı (bist dalından ÖNCE kontrol edilmeli):
  ```ts
  if (category === 'us') {
    const p = newYorkParts(at);
    if (p.weekday >= 6) return false;
    if (NYSE_HOLIDAYS_2026.has(p.key)) return false;
    const afterOpen = p.hour > 9 || (p.hour === 9 && p.minute >= 30);
    return afterOpen && p.hour < 16;
  }
  ```
- `nextMarketOpen`: DOKUNULMUYOR (yukarıda gerekçe — tüketicisi yok).
- Yeni testler: Salı 10:00 NY → açık; 9:29 NY → kapalı; 16:00 NY → kapalı; hafta sonu → kapalı; 2026-11-26 (Thanksgiving) → kapalı; 2026-04-23 (TR tatili ama NYSE tatili DEĞİL) → açık (takvimlerin bağımsızlığını kanıtlar); **DST kanıtı**: Ocak'ta (EST, UTC-5) ve Temmuz'da (EDT, UTC-4) aynı NY-yerel 10:00'ın FARKLI UTC anlarında açık çıkması (Intl'in DST'yi otomatik yönettiğinin kanıtı).

### 5. `src/lib/api/yahooSource.ts` + test (DEĞİŞECEK)
`fetchFxValue(bist: readonly string[], us: readonly string[], fetchFn)` — YENİ 2. parametre. BIST döngüsünden sonra:
```ts
await Promise.all(us.map(async (sym) => {
  try {
    const q = await fetchYahooQuote(sym, fetchFn); // SONEKSİZ — ABD tikeri direkt
    prices[sym] = round2(q.price * usdTry); // USD → TRY (altın/gümüşle birebir kalıp)
    if (q.changePct !== undefined) change[sym] = q.changePct;
  } catch (err) {
    console.warn(`[yahooSource] US ${sym} atlandı:`, err instanceof Error ? err.message : err);
  }
}));
```
Testler: `fetchFxValue` test grubuna mirror (`routedFetch`'e `AAPL` route'u eklenip US listesiyle çağrılır, TRY çevrimi + per-sembol hata izolasyonu doğrulanır — BIST'in "ZZZZ atlanır" testiyle birebir).
**Dikkat:** Bu değişiklik `fetchFxValue`'nun TÜM çağrı sitelerini etkiler (imza değişti) — `+server.ts`'deki hem `cache` fetcher'ı hem `?bist=` bypass dalı GÜNCELLENMELİ (aşağıya bak), yoksa typecheck kırılır.

### 6. `src/routes/api/yahoo/+server.ts` + test (DEĞİŞECEK)
- `cache` fetcher: `fetchFxValue(DEFAULT_BIST, [], fetch)` (US parametresi boş — varsayılan cache'lenen set US içermiyor, tutarlı).
- `GET`: `usParam = url.searchParams.get('us')`; `bistParam` VEYA `usParam` varsa cache bypass edilip `fetchFxValue(bist, us, fetch)` çağrılır (şu an sadece `bistParam` kontrol ediliyor — `usParam` de eklenmeli).
- Test: mevcut `GET /api/yahoo` testlerine `?us=AAPL` senaryosu eklenir.

### 7. `src/lib/api/fx.ts` + test (DEĞİŞECEK)
`FxSnapshotOptions` → `us?: string[]` eklenir. `fetchFxSnapshot`:
```ts
const params = new URLSearchParams();
if (opts.bist?.length) params.set('bist', opts.bist.join(','));
if (opts.us?.length) params.set('us', opts.us.join(','));
const qs = params.toString() ? `?${params}` : '';
```
Test: mevcut `bist verilince query string ekler` testinin yanına `us` + `bist+us birlikte` senaryosu.

### 8. `src/lib/stores/liveGameStore.svelte.ts` + `liveGameStore.test.ts` (DEĞİŞECEK)
- `import { computeInitialActiveUs } from ...` (yeni yardımcı, `computeInitialActiveBist`'in yanına) — **basit versiyon**: `initial?.activeUs ?? []` (BIST'teki gibi holdings'ten güvenlik ağı KURULMUYOR çünkü yeni özellik, eski/bozuk kayıt riski yok — bir US holding'i hep kendi `activeUs`'uyla birlikte kaydedilmiş olacak).
- ÖNEMLİ küçük düzeltme: `computeInitialActiveBist`'in `fromHoldings` filtresi şu an "CATALOG'da yoksa BIST'tir" varsayıyor (`isBistLikeId`) — bu artık YANLIŞ olur (ABD holding'i de CATALOG'da yok). Düzeltme: `fromHoldings` hesaplanırken `initial?.activeUs` setinde olan id'leri HARİÇ TUT:
  ```ts
  const savedUs = new Set(initial?.activeUs ?? []);
  const fromHoldings = (initial?.game.holdings ?? [])
    .map((h) => h.assetId)
    .filter((id) => isBistLikeId(id) && !savedUs.has(id));
  ```
- `let activeUs = $state<string[]>(computeInitialActiveUs(initial));`
- `persist()`: `opts.onPersist?.({ v: 1, game, activeBist, activeUs, sealedFx: sealedFx ?? undefined })`
- `pollFx()`: `fetchFxSnapshot({ bist: [...activeBist], us: [...activeUs], fetchFn })`
- `prices` $derived: `activeBist` döngüsünden sonra AYNI KALIPTA `activeUs` döngüsü (`category: 'us'`, `label: usStockName(sym)`, gerisi birebir aynı).
- `addUs = (symbol) => { ... }` — `addBist` ile BİREBİR AYNI gövde, `activeBist`→`activeUs` değişir.
- `LiveGameStore` interface: `addUs(symbol: string): void` eklenir, dönen objeye `addUs` eklenir.
- Testler: mevcut `addBist` testlerinin (12, 15, 19 numaralı — `on-demand buy`, `idempotent`, `persistence`) BİREBİR mirror'ı `addUs`/`AAPL` ile.

### 9. `src/lib/stores/savegame.ts` (SADECE TİP DEĞİŞİKLİĞİ)
`SaveEnvelopeV1.activeUs?: string[]` eklenir (Money alanı içermediği için `reviveEnvelope` DOKUNULMUYOR — `sealedFx` ile aynı durum, store zaten `?? []` ile varsayılan veriyor).

### 10. `src/lib/components/format.ts` (DEĞİŞECEK)
- `CATEGORY_LABELS`: `us: 'ABD BORSASI'` eklenir.
- `CATEGORY_ORDER`: `['crypto', 'bist', 'us', 'commodity', 'fx']` (ABD, BIST'in hemen yanına).

### 11. `src/lib/components/PriceList.svelte` (DEĞİŞECEK)
- `import { searchUsStocks } from '$lib/catalog/usStocks';`
- `onAddUs: (symbol: string) => void` prop eklenir.
- `TABS`'a `{ id: 'us', label: CATEGORY_LABELS.us }` eklenir.
- `addable` mantığı BIST'e ek olarak US için de çalışmalı — muhtemelen iki ayrı `addableBist`/`addableUs` listesi + iki ayrı "— Ekle" bölüm başlığı (BIST100 bölümünün ikizi, "ABD Borsası — Ekle" başlığıyla).
- `handleAdd` fonksiyonu hangi kataloğa ait olduğunu bilmeli (parametre veya iki ayrı handler).

### 12. `src/routes/+page.svelte` (DEĞİŞECEK)
`onAddBist` prop'unun yanına `onAddUs={(symbol) => { store.addUs(symbol); handleSelectAsset(symbol); }}` eklenir.

## Doğrulama sırası
1. TDD: yukarıdaki sıra korunarak her dosya için önce test (RED) sonra kod (GREEN) — `property.ts` dilimindeki disiplinle birebir.
2. `npm run test` tam yeşil + `npm run check` 0/0 + `npm run build`.
3. Tarayıcıda: ABD sekmesine geç → "AAPL" ara → EKLE → fiyat gelir (TRY + ≈USD) → al → sat → sayfa yenile → `activeUs` restore olur.
4. DST kanıtı testinin gerçekten iki farklı UTC saatinde "açık" çıktığını doğrula (yanlışsa NYSE saatleri tamamen anlamsızlaşır — bu testin YEŞİL olması kritik, sadece "geçti" demekle yetinme, hangi UTC saatlerinin karşılaştırıldığını logla/kontrol et).
5. Commit (Türkçe ASCII commit mesajı kalıbı, `Co-Authored-By` satırı) → push → Vercel prod deploy doğrulaması (`list_deployments` + `get_runtime_errors`).

## Riskler / bilinmesi gerekenler
- **Ticker doğruluğu:** Yukarıdaki 48 sembol yaygın/tanınmış büyük şirketler — yine de kodlamadan hemen önce birkaç tanesini (özellikle daha az bilinenleri) gerçek Yahoo sembolüyle çapraz kontrol etmekte fayda var (LLM hafızası sembol/isim eşleşmesinde nadiren yanılabilir).
- **NYSE tatil tarihleri:** Elle hesaplandı (Jan 1, 2026 = Perşembe temelinden gün-sayarak), Good Friday (3 Nisan) Paskalya 2026'nın 5 Nisan olduğu bilgisine dayanıyor — uygulamadan önce bir kaynakla (örn. NYSE'nin resmi tatil sayfası) hızlıca teyit edilmesi ideal, `HOLIDAYS_2026`'daki dini bayram tarihleri gibi "QUANT DOĞRULAYACAK" notu düşülebilir gerekirse.
- **`fetchFxValue` imza değişikliği** tüm çağrı sitelerini kırar (typecheck bunu yakalar) — 2. adım olarak hemen `+server.ts`'i güncellemeyi unutma.
