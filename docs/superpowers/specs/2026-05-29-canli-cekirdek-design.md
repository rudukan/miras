# Canlı Çekirdek Tasarımı — Gerçek-Zaman "1M USD Olsa Ne Yapardın" (Dilim 2)

**Tarih:** 2026-05-29
**Kapsam:** Gerçek "şu an" piyasasında, 1M USD sanal sermayeyle, açık/aramalı bir varlık evreninde **canlı, sürtünmesiz** anlık al-sat / döviz / mevduat oynanışı; periyot sonunda "ayna" sonucu. Pivot sonrası ilk inşa edilecek dilim.
**Dışarıda kalan:** Makas/spread, emir sistemi (bekleyen + limit + SL/TP), kaldıraç/margin, emlak, AI Yönetim Kurulu, tefeci/borç, login/çoklu-cihaz, haber şeridi, vergi matrah politikası, onboarding/mizah tonu, ses (§10). Çoğu → **v1.1** veya sonraki dilim.

> **Bağlam:** Saf motor (FX Engine — Task 3, Game State — Task 5) tamam ve `origin/main`'de (e427358, test 129/129). Motor *seeded* (deterministik 2025) fiyat üretiyor. Bu dilim, **aynı motoru canlı fiyatla besleyen** ikinci bir FX kaynağı + gerçek-zaman store + UI kabuğu ekler. **v1'de `gameState.ts` ve 129 testin hiçbiri değişmez** (§3). Pivot/karar geçmişi: hafıza `project-state` + `canli-cekirdek-tasarim`.

---

## 0. v1 ⟶ v1.1 Yol Ayrımı (kararlaştırıldı 2026-05-29)

Kullanıcı önceliği: **oyuncu keyfi + canlılık + sürtünmesiz işlem.** "Değişen motor kurmuyoruz." İki karar v1'i mümkün olan en sade çekirdeğe indirdi:

| v1 (bu spec — sade, canlı çekirdek) | v1.1 (model hazır, sonra) |
|-------------------------------------|---------------------------|
| Canlı fiyattan (mid) **anlık** al/sat — **motor sıfır değişir** | **Makas/spread** (banka makası %1.5–2, Bayram senaryosu) |
| Piyasa açıkken işlem; BIST kapalıyken "seans kapalı" | **Emir sistemi**: bekleyen (açılışta dolan) + limit + **SL/TP** |
| USD↔TRY çevrim (mid), mevduat, **canlı** ayna | |

Mantık: hem makas (işlem reducer imzasını değiştirir) hem emir sistemi (yeni state + reducer) ertelenince, v1 = mevcut motora **dokunmadan** canlı fiyat + UI + ayna. Enerji canlılığa gider. v1.1 katmanları için veri modeli/seam baştan hazır; mantık v1'de YOK (YAGNI).

---

## 1. Tasarım İlkeleri

1. **Gerçek = motorun ta kendisi.** Canlı fiyatı doğrudan kullan; haberi/olayı *ayrıca simüle etme*. Fiyat neden oynadıysa o gerçektir.
2. **Canlılık birinci sınıf hedef.** Fiyat akmalı: kripto WS push → `$derived` → grafik kıpırdar, sayılar canlı döner, "şu an" hissi. İşlem **bir tık**: ara → seç → AL, sürtünmesiz. (CLAUDE.md: `setInterval` + DOM manip YASAK; reaktivite `$derived`/rAF.) Keyif motorda değil, bu deneyim katmanında.
3. **Kazanma hayalini sat, kaybetmek bedelsiz.** Sert kazanma kapısı yok; ödül, kendi para-yönetimini benchmark'la kıyaslamalı görmek (ayna felsefesi — Game State §7).
4. **Tek seam: `FxEngine`.** Motor fiyatın `seeded` mi `live` mi olduğunu bilmez. Canlı mod = aynı arayüzü canlı fiyatla dolduran ikinci implementasyon (§2).
5. **Çalışan motoru koru.** v1'de `gameState.ts` (reducer'lar + state şekli) ve 129 test **bir satır değişmez**; tek fark store'un `fx`'i live kurması (§3).
6. **Buluta hazır, tek cihazda.** State düz JSON → localStorage (anon). Login / çoklu-cihaz = Dilim 4.
7. **Aşamalı, model hazır.** v1.1 katmanları (makas, emir sistemi) için seam/model baştan uyumlu; mantık v1'de yok.

---

## 2. Yerleşim & Mimari

### Seam: aynı arayüz, canlı implementasyon

Mevcut arayüz (`src/lib/domain/fx/fx.ts:26`):

```ts
export interface FxEngine {
  usdTryForDay(day: number): Money;
  assetPriceForDay(assetId: string, day: number): Money;
}
```

`createFxEngine(scenario, seed)` seeded (`fx.ts:31`). **Yeni** `createLiveFxEngine(priceSource)`: aynı arayüzü canlı fiyatla doldurur — `day` argümanı **yok sayılır**, her zaman son canlı fiyat döner (kripto USD→TRY çevrimi dahil). Mid fiyat (makas yok) olduğundan, mevcut **al/sat + çevrim + değerleme** reducer'larının hepsi bu fiyatla **değişmeden** çalışır.

`Scenario` zaten `fxSource: 'seeded' | 'live'` + `timeMode: 'turn' | 'realtime'` içeriyor (`scenario/types.ts:26,33`). `holdings: {assetId, units, avgCost}` açık evreni zaten destekler (`assetId` = herhangi string, ön-kayıt yok).

### Yeni dosyalar

| Dosya | Sorumluluk | Sürüm | Saf? |
|-------|-----------|-------|------|
| `src/lib/domain/fx/liveFx.ts` | `createLiveFxEngine(priceSource)` — `FxEngine`'i canlı fiyatla doldurur | v1 | saf (priceSource enjekte) |
| `src/lib/domain/calendar/calendar.ts` | TR tatil + piyasa-saati: `isMarketOpen`, `nextMarketOpen` (v1'de seans göstergesi/buton pasifliği için) | v1 | saf |
| `src/lib/domain/calendar/holidays2026.ts` | 2026 TR resmî tatil takvimi (veri — quant) | v1 | saf veri |
| `src/lib/domain/trade/spread.ts` | Banka/piyasa makası | **v1.1** | saf |
| `src/lib/api/binance.ts` | Kripto canlı fiyat (WS push) client | v1 | dış |
| `src/lib/api/fx.ts` | Döviz/altın/BIST poll client | v1 | dış |
| `src/routes/api/crypto/+server.ts` | Binance proxy (5s cache) | v1 | dış |
| `src/routes/api/yahoo/+server.ts` | Yahoo proxy (5s cache) | v1 | dış |
| `src/lib/stores/liveGameStore.svelte.ts` | Runes: gerçek-zaman saat + canlı fiyat cache + `$derived` skor | v1 | reaktif |
| `src/lib/components/...` | UI bileşenleri (§8) | v1 | reaktif |
| `gameState.ts` | **v1'de DOKUNULMAZ** (mevcut reducer'lar + state) | — | (saf, mevcut) |

CLAUDE.md sınırları korunur: iletişim `stores/`, API `api/`, her `domain/<sistem>/` yalnızca `money.ts` + kendi type'larına bağlı.

---

## 3. Motor Neden v1'de Değişmez (kritik)

Kullanıcının "baştan-yazma motor mu?" endişesinin cevabı: **hayır — v1'de `gameState.ts`'e tek satır eklenmez bile.**

Mevcut reducer'lar fiyatı `FxEngine`'den çekiyor (`gameState.ts`):

```ts
buyAsset(state, fx, assetId, units)   // fiyat = fx.assetPriceForDay(assetId, state.clock.day)
convertUsdToTry(state, fx, usdAmount) // rate  = fx.usdTryForDay(state.clock.day)
netWorthUsd(state, fx)                // değerleme de fx üzerinden
```

Canlı modda `fx = createLiveFxEngine(...)`; `assetPriceForDay`/`usdTryForDay` `day`'i yok sayıp **son canlı fiyatı** döndürür. Makas yok → işlem fiyatı = değerleme fiyatı = mid. Sonuç: **al/sat, çevrim, değerleme reducer'larının hiçbiri değişmez; imzalar aynı; 129 test aynen geçer; gameState'e YENİ test bile eklenmez.** Tek yaptığımız `fx` örneğini seeded yerine live vermek.

> **v1.1 notu:** Makas → işlem reducer'ları `executionPrice` parametresine evrilir. Emir sistemi → `pendingOrders[]` state + place/cancel/fill reducer'ları eklenir. İkisi de *o zaman*; veri modeli/seam bunları kaldıracak şekilde tasarlandı (§6).

---

## 4. Açık / Aramalı Evren

Sabit liste DEĞİL — arama kutusundan istediğin sembolü bul-al (canlılık + kolaylık):

| Kategori | İçerik | Kaynak |
|----------|--------|--------|
| `crypto` | BTC, ETH, SOL, … | Binance (canlı, WS) |
| `bist` | **Tüm BIST hisseleri** | Yahoo (~15 dk gecikmeli, poll) |
| `commodity` | gram altın (XAUGRAM), gram gümüş (XAGGRAM) | poll |
| `fx` | EUR, … | poll |

Hepsi TRY fiyatlı (kripto USD→TRY çevrilir). `assetId` ön-kayıt gerektirmez; aranıp seçilen sembol `holdings`'e doğrudan girer. UI'da arama + öneri + hızlı-ticker pills (legacy'de kurulu, §8).

---

## 5. Takvim (v1) & Makas (v1.1)

**Takvim — v1'de hafif gerekli** (işlem butonu seans dışında pasif + "seans kapalı" göstergesi). `calendar.ts` saf fonksiyonları kategori + gerçek tarih-saatten seans durumunu verir:

| Katman | Seans | v1 davranışı |
|--------|-------|--------------|
| **Kripto** | 7/24 açık | her zaman işlem |
| **BIST** | hafta içi 10:00–18:00; TR tatilinde kapalı | kapalıyken **"seans kapalı, açılışta gel"** (buton pasif); emir kuyruğu v1.1 |
| **Döviz / altın** | her zaman işlem açık | her zaman işlem (mid) |

**Makas — v1.1.** Banka makası %1.5–2 (Bayram senaryosu), kategori-bazlı bps. v1'de tüm işlemler **mid** fiyattan; `spread.ts` + `applySpread(...)` v1.1'de. Makas bps tunable → quant (§12).

---

## 6. Emir Sistemi (v1.1 — model burada, mantık sonra)

v1'de emir = **piyasa açıkken anlık market** (ara → seç → AL/SAT, hemen dolar). BIST kapalıyken işlem yok (§5).

**v1.1** tek tutarlı emir sistemi getirir (bekleyen + limit + SL/TP, aynı aile):

```ts
interface PendingOrder {           // v1.1 — şimdi YOK, tasarım referansı
  id: string;                      // `ord-${orderSeq}`
  assetId: string;
  side: 'buy' | 'sell';
  units: number;
  reservedTry?: Money;             // alışta kilitlenen nakit (iptalde geri)
  type: 'market' | 'limit' | 'stop' | 'takeProfit';
  triggerPrice?: Money;
  placedDay: number;
}
// GameState'e (v1.1, additive): pendingOrders[]; orderSeq;
// Reducer'lar (v1.1): placePendingOrder / cancelPendingOrder / fillPendingOrders
```

- **Bekleyen (açılışta dolan):** BIST kapalıyken emir → bir sonraki açılışta o günkü fiyattan dolar (açılış gap'i dramatize eder).
- **Limit + SL/TP:** canlı fiyat eşiği geçince, **sen açıkken** tetiklenir.
- **Dilim 4:** sen yokken / 7-24 otomatik tetik (backend).

Bu bölüm spec'te kalır ki v1'i kurarken state şekli ve store bunları **kıracak değil, kaldıracak** biçimde tasarlansın (geleceğe açık).

---

## 7. Gerçek-Zaman Model

- `clock.day` = başlangıçtan beri geçen **gerçek gün** (mevduat vadesi + gösterim için; fiyat artık `day`'e bağlı değil, canlı). 30 günlük mevduat = 30 gerçek gün.
- **Fiyat akışı:** kripto Binance **WS push**; döviz/altın/BIST Yahoo **poll + 5s cache**. UI `$derived` (CLAUDE.md: `setInterval` + DOM manip YASAK). Bu akış = §1.2 canlılığın motoru.
- **Süre = periyot = zorluk:** 2 ay / 6 ay / 1 yıl (gün sayıları §13). Bitince final ayna (§8), sonra serbest sandbox. (`clock.totalDays` + `isFinished` zaten var.)
- **Kapat-aç (reconcile):** açılışta localStorage'tan state → canlı fiyat çek → net servet yeniden hesapla (yokken gerçekte ne olduysa o). Yokken vadesi dolan mevduat açılışta deterministik reconcile (`advanceTime` deseni; canlı veri gerekmez).

---

## 8. UI / Panel Yerleşimi

**Kural:** Legacy v3.x (`legacy/index.html`, build dışı) = **görsel/düzen kuzey yıldızı.** Yalnızca GÖRSELİ al (HTML iskelet + Tailwind class + CRT scanline CSS + `term.*` token + JetBrains Mono) → **Svelte 5 runes bileşenlerine port et.** `app.js` MANTIĞINI ALMA (vanilla JS + `setInterval` + DOM manip, CLAUDE.md yasak).

**Onaylı yerleşim = A (legacy 3-kolon iskeleti korunur):**

```
HUD (header): NetVarlık · USD$ · TRY₺ · Kur · Gün/Süre · [toggle'lar]
┌ SOL (3) ─────┬ ORTA (6) ────────────────┬ SAĞ (3) ────────┐
│ Portföy       │ Piyasa (arama+ticker+     │ Döviz Ofisi      │
│ (holdings +   │  canlı canvas chart)      │ (USD↔TRY)        │
│  dağılım bar) │ İşlem (spot: adet+AL/SAT) │ Vadeli Mevduat   │
│ Sistem log    │ · seçili sembol detay     │ Bilanço/Ayna-ön  │
│ (opsiyonel)   │ · (v1.1: emir paneli)     │                  │
└───────────────┴───────────────────────────┴──────────────────┘
```

Orta kolonda İşlem'in altı v1'de chart/sembol detayına nefes alanı; v1.1 emir paneli oraya gelir.

| Bileşen | Karşılığı (legacy) | Sürüm | Not |
|---------|--------------------|-------|-----|
| `HudBar` | `header` | v1 | net servet, USD/TRY nakit, **canlı** kur, gün/süre, toggle'lar |
| `WalletPanel` | sol "Bilanço/Aktifler" | v1 | **holdings listesi** (açık evren) + dağılım bar |
| `MarketPanel` | orta BIST modülü | v1 | arama + öneri + hızlı-ticker + seçili sembol + **canlı canvas chart** |
| `TradePanel` | orta işlem konsolu | v1 | **spot anlık** (adet + MAX/HEPSİ + AL/SAT); kaldıraç ÇIKARILDI; tek-tık |
| `FxDeskPanel` | "Döviz Ofisi" | v1 | USD↔TRY (mid; makas göstergesi v1.1) |
| `DepositPanel` | "Vadeli Mevduat" | v1 | aç/kapa (tefeci ÇIKARILDI) |
| `BalanceMirror` | sağ özet + leaderboard-modal | v1 | bilanço + final ayna (net servet vs USD-tut kıyası) |
| `OrdersPanel` | — | **v1.1** | bekleyen/limit/SL/TP kuyruğu |

Çıkarılan legacy modülleri: emlak + Sahibinden, AI Yönetim Kurulu, kaldıraç select + teminat/likidasyon, tefeci Cafer, vergi matrah (TÜİK/ENAG), Bloomberg haber (§10).

---

## 9. Birim Sınırları (isolation)

| Birim | Ne yapar | Sürüm | Bağımlılık |
|-------|----------|-------|-----------|
| `liveFx.ts` | canlı fiyat → `FxEngine` arayüzü | v1 | money, scenario types, priceSource |
| `calendar.ts` | seans açık mı / sonraki açılış | v1 | (saf, takvim verisi) |
| `gameState.ts` | mevcut reducer + state (**v1'de değişmez**) | — | (mevcut) |
| `liveGameStore.svelte.ts` | gerçek-zaman + canlı fiyat + skor | v1 | gameState, liveFx, calendar, api/* |
| `api/binance.ts`, `api/fx.ts` | dış fiyat çekimi | v1 | (proxy route) |
| `spread.ts` / emir reducer'ları | makas / emir sistemi | **v1.1** | money, gameState |

---

## 10. Kapsam Dışı / Ertelenen (bilinçli)

| Konu | Karar / Nereye |
|------|----------------|
| 💱 Makas / spread (banka makası %1.5–2, Bayram senaryosu) | **v1.1** — model hazır (§5) |
| 🎯 Emir sistemi: bekleyen (açılışta dolan) + limit + SL/TP | **v1.1** — model hazır (§6); ertelendi ki v1'de motor sıfır değişsin |
| Kaldıraç / margin / likidasyon | Spot-only kararı (2026-05-29) |
| Emlak + Sahibinden | Ayrı sistem (illikit) |
| AI Yönetim Kurulu / tefeci-borç | Monetization / kaldıraç ailesi, MVP sonrası |
| Login / çoklu-cihaz / **sen yokken otomatik tetik** | Dilim 4 (backend) |
| 📰 Haber / anlatı şeridi | v1.1 cilası |
| 🧾 Vergi matrah politikası + ceza | Ayrı sistem (**mevduat stopajı %7.5 DAHİL** — motorda); spot al/sat'ta komisyon/vergi yok |
| ⚖️ Onboarding mahkeme + Miras mizahı/ton | Dilim 3 (kimlik açık sorusu); v1 = minimal giriş (mod + periyot) |
| 🔊 Ses (Web Audio) | Sonraki sprint (sound-designer) |

---

## 11. Test Stratejisi

1. **Saf domain — deterministik unit (Vitest):**
   - `calendar.ts`: tatil/hafta-sonu/seans-saati sınırları (`isMarketOpen`, `nextMarketOpen`).
   - `liveFx.ts`: verilen `priceSource` ile `FxEngine` arayüzünü doğru doldurma (`day` yok sayılır; eksik sembol davranışı).
   - **`gameState.ts`: dokunulmuyor → mevcut 129 test aynen yeşil, yeni test EKLENMEZ** (motor korundu, §3).
2. **API client (mock'lu unit):** `/api/yahoo` + `/api/crypto` proxy → 5s cache davranışı + hata fallback (fetch mock).
3. **Store entegrasyon:** `liveGameStore.svelte.ts` — gerçek-zaman saat sürücüsü + canlı fiyat → `$derived` skor + seeded `createFxEngine` yerine `createLiveFxEngine` enjeksiyonu. Fake timers + sahte fiyat feed (en kırılgan katman, smoke).
4. **E2E (Playwright critical path):** ara → seç → al → portföyde gör → süre dolunca ayna. **Canlı API route-intercept ile mock'lanır** (deterministik).
5. **Denge:** CLAUDE.md "kazanılabilirlik %30–70" *seeded VASİYET'e* aittir — canlı + ayna felsefesi için geçersiz. Yerine: ayna metriklerinin (`netWorthUsd`/`profitRate`/`beatInflation`) doğruluğu unit'te.

`npm run test` + `npm run check` + `npm run build` geçmeden "tamam" denmez (verification-before-completion).

---

## 12. Kalibrasyon TODO (quant — implementasyonu bloklamaz)

- [ ] **2026 TR resmî tatil takvimi** (Bayram tarihleri kritik) — resmî kaynaktan, tahmine bırakma. (v1, seans göstergesi)
- [ ] Güncel BIST seans saatleri (açılış/kapanış). (v1)
- [ ] Canlı fiyat kaynakları: Binance sembol listesi + Yahoo BIST sembol formatı + 15 dk gecikme davranışı. (v1)
- [ ] Makas bps (kripto / BIST seans / döviz banka makası %1.5–2). (v1.1)

---

## 13. Açık Sorular

- **Periyot gün sayıları:** 2ay/6ay/1yıl → 60/180/365? — implementasyon planında sabitlenecek.
- **Kimlik/ton (Dilim 3):** Miras satiri/mizahı kalsın mı, temiz-ciddi sim mi? Ertelendi; v1 minimal giriş ile nötr, bu kararı engellemez.
