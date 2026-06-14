# Günlük Mühürlü Kur — Tasarım (2026-06-14)

## Amaç
USD net servetin gün-içi kur gürültüsüyle "sıfırlanma" hissini gider. Mevduatla portföye
büyük TL pozisyonu girince (₺4.6M), USD/TRY'nin 1 kuruşluk canlı tiki net serveti ±$21
zıplatıyor → saniyelik faiz (~$0.0015/sn) ezilip görünmez oluyor. Çözüm: oyunun USD/TRY'sini
**günlük mühürlü "referans kur"** yap (oyunun mevcut "İstanbul gece yarısı mühür" felsefesiyle
birebir uyumlu).

## Kilitli Kararlar
| Konu | Karar |
|------|-------|
| Kapsam | **Her şey**: işlem (al-sat, mevduat aç/boz) + değerleme (net servet, K/Z) aynı mühürlü kuru kullanır → sahte K/Z yok, net servet = pozisyonlar toplamı (tutarlı). |
| Canlı kur | Sadece **bilgi/gösterim** ("piyasa: ₺Y") + mühür tohumu. |
| Mühür anı | **Gün başı** — İstanbul gün-anahtarı değişince yakalanan canlı kur = "günün açılış kuru". |
| Reseal | Geceyarısı (İstanbul) gün-anahtarı değişince otomatik. |
| Persistence | `SaveEnvelopeV1`'e opsiyonel `sealedFx?: {dateKey, rate}` (eski kayıt uyumlu). |
| İlk açılış | Mühür yoksa ilk canlı kurla anında mühürle. |
| "Canlı" hissi | Kripto/BIST/altın yerel biriminde canlı tiklemeye devam eder; net servet gün-içi yalnız kripto + faizle oynar. |

## Mimari (tek seam)
- `liveUsdTry` (Binance WS / Yahoo) → artık **yalnız tohum + gösterim**.
- Yeni `sealedUsdTry(): number` = operatif kur. Mühür state'i `sealedFx: { dateKey: string; rate: number }`.
- `pollFx`'te: `const key = istanbulParts(new Date(now())).key;` eğer `sealedFx === null || sealedFx.dateKey !== key` → `sealedFx = { dateKey: key, rate: <canlı kur> }` + persist.
  - `<canlı kur>` = mevcut `effectiveUsdTry()` mantığı (feedStatus live ? liveUsdTry : fxCache.usdTry).
- **Operatif tüketiciler** `effectiveUsdTry()` yerine `sealedUsdTry()` çağırır:
  - `oracle.assetUsd(id)` (BIST/emtia/döviz: `t / sealedUsdTry()`)
  - `source.assetTry(id)` kripto kolu (`u * sealedUsdTry()`)
  - `openDepositAction` / `breakDepositAction` (reducer'a geçen usdTry)
  - mevduat `depositUsd` derived (`currentValueTry / sealedUsdTry()`)
- `store.usdTry` getter → `sealedUsdTry()` (operatif; cüzdan parite bunu gösterir).
- Yeni `store.liveUsdTry` getter (küçük "piyasa" ipucu için) — opsiyonel.

> **Not:** Motor (`gameState` reducer'ları, `UsdPriceOracle` arayüzü) DEĞİŞMEZ — yalnız store
> hangi kuru beslediğini değiştirir. `effectiveUsdTry()` private kalır (mühür tohumu için).

## UI
- `WalletSummary.svelte`: parite satırı "USD/TRY (günün kuru) ₺X" (operatif=sealed) + küçük
  ikincil satır "piyasa: ₺Y" (canlı ipucu). `usdTry` prop = sealed; yeni `liveUsdTry` prop opsiyonel.

## Kapsam Dışı (YAGNI)
Kuru manuel kilitleme · geçmiş kur grafiği · gün-içi reseal · varlık native fiyatlarını mühürleme
(onlar canlı kalır).

## Test Stratejisi (TDD)
- store: mühür ilk poll'da kurulur; gün değişmeden ikinci poll mührü DEĞİŞTİRMEZ; gün-anahtarı
  değişince reseal eder; operatif kur (oracle/assetTry/deposit) sealed kuru kullanır (canlı tik
  net serveti oynatmaz); `sealedFx` persist edilir.
- savegame: `sealedFx` revive (round/tip) + eski kayıt (`sealedFx` yok → null).
- WalletSummary görsel smoke.

## Riskler / Notlar
- Mühür anı "gün başı" → günün ilk poll'una kadarki çok kısa pencerede mühür henüz yoksa ilk
  canlı kurla kurulur (anlık).
- Canlı kurla işlem yapılamaz (yalnız bilgi) → live-vs-sealed arbitrajı yok (herkes aynı günün
  kurunda).
- Bu spec, mevduat dilimi (origin/main=`fabd84a`) sonrası ortaya çıkan playtest bulgusudur.

## Açık (ilgili, bu spec dışı)
- Dev terminalinde transient "socket connection closed unexpectedly" (Yahoo/Binance üst-kaynak
  bağlantı düşmesi) — route zaten yakalıyor (stale dönüyor), zararsız. İstenirse log `error`→`warn`.
