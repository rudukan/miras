# USD-Taban Para Modeli + Oto-Takas — Tasarım

**Tarih:** 2026-06-05
**Durum:** Onaylı (brainstorm bitti, kullanıcı test aşamasında gözden geçirecek)
**Önceki bağlam:** ③ BIST100 on-demand+arama (`origin/main=ccecef2`). Bu refaktör, "canlı dilim motora DOKUNMADAN" ilkesini bilinçli olarak değiştirir — motor artık değişiyor (kullanıcı onayladı).

---

## 1. Sorun & Amaç

Oyuncu başta **$1,000,000 USD** ile başlıyor. Mevcut akışta BIST/altın gibi TRY'li bir varlık almak için **iki adım** gerekiyor: önce manuel `USD→TRY` çevir, sonra al. Bu yapay — gerçek hayatta da, "dolarım var, BIST hissesi alıyorum" derken aracı kurum kuru anında çevirir; lira cepte beklemez.

**Amaç:** Tek nakit = USD. Alımda motor canlı pariteden **oto-takas** yapar. Manuel döviz çevirme paneli kalkar. Kâr/zarar USD cinsinden ("dürüst ayna" — lira şişmesi oyuncuyu kandırmaz). Kazanma = doları büyütmek (>$1M).

---

## 2. Kilitlenen Kararlar

1. **Tek nakit = USD.** `tryBalance` silinir. Her alımda motor canlı pariteden oto-takas yapar:
   - BIST / gram altın / gram gümüş alırken: USD→TRY anlık (TRY cepte beklemez).
   - Kripto / ABD / EUR: zaten USD dünyası.
2. **TRY-gerçek varlıklar:** sadece **BIST + gram altın + gümüş** gerçekten TRY fiyatlı. Kripto / ABD / EUR / nakit = USD dünyası.
3. **K/Z USD.** Maliyet bazı = ödenen dolar. Lira şişmesi kâr gibi görünmez. "Dürüst ayna" tezi.
4. **Kazanma çizgisi = doları büyüt (>$1M).** `INFLATION_TARGET_USD` kalkar; `beatInflation` → `grewDollars`. `vsUsdHold` zaten ölçüyor.
5. **Mevduat RAFA.** VASİYET-dönemi TRY ürünü, canlı UI'da yok. `tryBalance` + `deposits` + `convert*` fonksiyonları + `*Deposit*` fonksiyonları **silinir** (git'te durur, geri getirilebilir).
6. **Yaklaşım A:** Motor SAF-USD olur, parite fx/store'da kalır.
   - Reducer'lar `UsdPriceOracle { assetUsd(id): Money }` tüketir.
   - `assetUsd = assetTry / usdTry` (kripto kayıpsız geçer — zaten USD).
   - `buyAsset` / `sellAsset` USD-takas yapar; `avgCost` → USD; `netWorthUsd` = `usdBalance + Σ(units × assetUsd)` paritesiz.
7. **ABD borsası SONRAYA.** Önce para-modeli. ABD = BIST arama akışını yeniden kullanır ama USD-native (Yahoo soneki yok, ×kur yok, NYSE saatleri farklı) → ayrı sprint.

---

## 3. Mimari (Bölüm 1 & 2 — Motor + fx/store)

### 3.1 `UsdPriceOracle` (yeni seam)
```
interface UsdPriceOracle {
  assetUsd(id: string): Money;   // varlığın USD fiyatı
}
```
- Kripto/EUR: doğrudan USD fiyatı.
- BIST/altın/gümüş: `assetTry / usdTry` (canlı pariteden).
- Implementasyon fx/store katmanında; motor sadece arayüzü tüketir → parite motora sızmaz.

### 3.2 `gameState.ts` (motor — saf USD)
- **Silinen alanlar:** `tryBalance`, `deposits`.
- **Silinen fonksiyonlar:** `convertUsdToTry`, `convertTryToUsd`, `openDeposit`, `closeDeposit`, `advanceTime`-içindeki mevduat-kapanış mantığı.
- **`buyAsset(state, id, units, oracle)`:** maliyet = `units × oracle.assetUsd(id)`; `usdBalance` düşer; `avgCost` USD cinsinden güncellenir (kesirli units korunur).
- **`sellAsset(state, id, units, oracle)`:** gelir = `units × oracle.assetUsd(id)`; `usdBalance` artar.
- **`netWorthUsd(state, oracle)`:** `usdBalance + Σ(units × oracle.assetUsd(id))` — paritesiz.
- **`grewDollars(state, oracle)`:** `netWorthUsd > 1_000_000` (eski `beatInflation` yerine). `INFLATION_TARGET_USD` kalkar.

### 3.3 `liveGameStore.svelte.ts` (store)
- **Silinen aksiyonlar:** `usdToTry`, `tryToUsd`.
- **`usdTry` getter KALIR** — ama parite göstergesi (cüzdan bakiyesi değil).
- `buy`/`sell` çağrıları motora `UsdPriceOracle`'ı besler.
- `positions` türevi USD değer + USD K/Z taşır (`valueUsd`, `pnlUsd`).
- `netWorthUsd` $derived guard (fiyat yok→null) korunur.

---

## 4. UI (Bölüm 3)

### 4.1 `TradePanel.svelte`
- **(A) "Döviz Çevirimi" bloğu tamamen silinir** (`usdAmt`/`tryAmt` state, `handleUsdToTry`/`handleTryToUsd`, USD↔TRY kutuları).
- Panel = **sadece Al/Sat**.
- **MAX:** `maxUnitsAffordable(usdBalance, selectedAssetUsd)` (eski `tryBalance`/`selectedPrice` yerine).
- **Maliyet yankısı USD:** `≈ {displayUsd(units × assetUsd)}`.

### 4.2 `WalletSummary.svelte`
- **"TRY nakit" satırı silinir** (`game.tryBalance` artık yok).
- **"USD nakit"** tek nakit kalır.
- **"USD/TRY" satırı KORUNUR** — anlamı "canlı parite göstergesi" (oto-takasın hangi kurdan yapıldığını oyuncu görür).
- **Pozisyonlar USD:** `valueTry`→`valueUsd`, `pnlTry`→`pnlUsd`, `displayUsd`/`signedUsd`. Yüzde rozeti birimsiz → değişmez.

### 4.3 `format.ts`
- `signedTry` → `signedUsd`.
- `positionPnl` USD parametreleri alır.
- `maxUnitsAffordable` imzası aynı (birimsel: cash/price); çağrı yeri USD besler.

### 4.4 `PriceList.svelte` — **DEĞİŞMEZ**
- Fiyatlar **TRY gösterilmeye devam eder** (BIST/altın/gümüş gerçekten TRY'li; kripto/ABD/EUR kendi biriminde). Tanıdık görünüm.
- Oracle USD'yi arka planda K/Z için kullanır; ekranda gösterilen fiyat birimi ayrı.
- **"Dürüst ayna":** cüzdan + K/Z = USD, fiyat = piyasa birimi.

### 4.5 Dokunulmayanlar
`NetWorthMirror`, `StatusBadge`, `ContextCard`.

---

## 5. Test & Kapsam-Dışı (Bölüm 4)

### 5.1 Test stratejisi
- **`gameState` testleri USD'ye yeniden yazılır (~36 test):**
  - `convert*` testleri **silinir**.
  - `buyAsset`/`sellAsset` artık `UsdPriceOracle` alır → USD maliyet bazı + `netWorthUsd` paritesiz doğrulanır.
  - `beatInflation` testi → `grewDollars`.
- **Mevduat testleri `describe.skip`** (`openDeposit`/`closeDeposit`/`advanceTime`-mevduat) — silmek yerine rafa, geri getirilebilir.
- **Yeni saf-helper testleri:** `UsdPriceOracle.assetUsd` (kripto kayıpsız), `signedUsd`, USD-tabanlı `positionPnl`.
- **Store testleri:** `usdToTry`/`tryToUsd` testleri silinir; `buy`/`sell` oto-takas senaryosu eklenir (BIST al → `usdBalance` düşer, TRY cepte beklemez).

### 5.2 Kapsam DIŞI
- **ABD borsası** — ayrı sprint.
- **Mevduat UI'ı geri getirme** — VASİYET moduna bırakıldı.
- **Manuel döviz büfesi** (oyuncunun euro-bozdurma içgüdüsü) — oto-takas zaten karşılıyor; ayrı panel yok.

---

## 6. Net Dosya Etki Listesi

| Dosya | Değişim |
|-------|---------|
| `src/lib/stores/gameState.ts` | `tryBalance`+`deposits` alanları + `convert*`/`*Deposit*` fonk. silinir; `buyAsset/sellAsset` USD-takas (oracle); `netWorthUsd` paritesiz; `beatInflation`→`grewDollars`; `INFLATION_TARGET_USD` kalkar |
| `src/lib/domain/fx/liveFx.ts` (veya yeni oracle dosyası) | `UsdPriceOracle { assetUsd(id) }` eklenir |
| `src/lib/stores/liveGameStore.svelte.ts` | `usdToTry`/`tryToUsd` aksiyonları silinir; `usdTry` getter parite göstergesi kalır; pozisyon USD |
| `src/lib/components/TradePanel.svelte` | (A) bloğu silinir; MAX+yankı USD |
| `src/lib/components/WalletSummary.svelte` | TRY nakit silinir; pozisyon USD |
| `src/lib/components/format.ts` | `signedTry`→`signedUsd`; `positionPnl` USD |
| `src/lib/components/PriceList.svelte` | **değişmez** (fiyat TRY) |

---

## 7. Riskler & Notlar

- **Bilinçli ilke değişimi:** "Motora dokunma" ilkesi bu sprint için kaldırılır. Kullanıcı onayladı.
- **Kripto kayıpsızlık:** `assetUsd` kripto için doğrudan USD döndürmeli (`assetTry/usdTry` yuvarlama hatası yaratmasın) — oracle implementasyonu kategori-bazlı ayrım yapar (③'teki `source.assetTry` CATALOG-bağımsız mantığına paralel).
- **Mevduat geri-getirilebilirlik:** kod silinmez, `describe.skip` + git geçmişi → VASİYET modu sprintinde geri açılır.
