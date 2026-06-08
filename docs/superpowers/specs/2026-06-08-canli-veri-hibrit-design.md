# Canlı Veri — Hibrit USD/TRY (Binance WS + Yahoo) — Tasarım

**Tarih:** 2026-06-08
**Durum:** Onaylı (brainstorm bitti; kullanıcı spec review gate'inde)
**Önceki bağlam:** USD-taban para modeli refaktörü (`origin/main=fe5f4d9`). Motor saf-USD; `usdTry` paritesi TRY varlıklarını (BIST/altın/gümüş/EUR) USD'ye çeviren tek çarpan.

---

## 1. Sorun & Amaç

Veri tazeliği kalem bazında ölçüldü; bulgu:

| Kalem | Kaynak | Gerçek tazelik |
|---|---|---|
| BTC/ETH/SOL | Binance WS | ~canlı |
| BIST (THYAO…) | Yahoo chart | ~15 dk gecikme (ücretsiz borsa verisi sert tabanı) |
| Gram altın/gümüş | COMEX `GC=F`/`SI=F` × usdTry | ~10 dk + kur kısmı donuk |
| **USD/TRY + EUR** | **open.er-api (ücretsiz)** | **Günde 1 güncelleme → gün içi TAMAMEN DONUK** |

Kanıt: er-api `last_update` ile `next_update` arası ~24 saat; USD/TRY tek sayıda sabit kalıyor.

**Sorun:** Hedef kitle = kriz insanı; duygusal merkezi **dolar/altın**. Ama en çok blurt verecek kalem (dolar) en az canlı, en canlı kalem (kripto) en az duygusal. Bu, "canlı dünyadaki gibi hisset" vaadiyle çelişir.

**Amaç:** USD/TRY ve EUR'u canlandır. `usdTry` paritesi canlı olunca altın/gümüş de otomatik canlanır; BIST'in USD-değeri canlı kurla nefes alır. BIST'in kendi fiyat gecikmesi (15 dk) ücretsiz-veri sert tabanı — bu spec onu hedeflemez.

---

## 2. Kilitlenen Kararlar

1. **Hibrit (Yaklaşım C):** USD/TRY iki kaynaktan beslenir.
   - **Binance `usdttry@trade` (WS)** → canlı tick, **birincil**. (USDT≈USD; bazı ~0.1%, ihmal edilebilir. Likidite: ~94K işlem/24s.)
   - **Yahoo `USDTRY=X` (20s poll)** → taban + ilk yükleme + WS düşünce **fallback**.
2. **EUR canlı = Yahoo `EURTRY=X`** (Binance'te EUR/TRY likiditesi yok). Bonus: er-api değişim vermezdi; `EURTRY=X` değişim% getirir → EUR satırı artık günlük % rozeti gösterir.
3. **er-api tamamen sökülür** (`fetchUsdRates` silinir). Günlük-donuk veri yanıltıcı; Yahoo + son-gerçek zaten üç katman fallback verir.
4. **Birleştirme kuralı:** `effectiveUsdTry = (feedStatus === 'live' && liveUsdTry !== undefined) ? liveUsdTry : fxCache.usdTry`. WS canlıyken tick otoritesi WS'te; WS stale olunca Yahoo'ya düşer; ikisi de yoksa son-gerçek korunur (mevcut stale-snapshot fix).
5. **24/7 yan etki (olumlu):** Binance USDTTRY kripto pazarı → hafta sonu/gece dahil **7/24 canlı**. Yahoo forex hafta sonu kapalı → fallback Cuma kapanışında donar, ama WS canlı tutar. Dolar = oyunun 7/24 yaşayan tek "ağır" sayısı.
6. **Altın/gümüş USD-değeri kurdan bağımsız** (COMEX/ons ÷ gram); canlı kur yalnız onların **TRY gösterim fiyatını** oynatır — matematiksel olarak doğru.
7. **Kapsam = yalnız tazelik.** BIST hızlandırma, poll hızlandırma, `?bist=` cache, deploy, hesaplar bu spec'e GİRMEZ (§7).

---

## 3. Mimari (dosya bazında)

### 3.1 `src/lib/api/yahooSource.ts`
- **Silinir:** `fetchUsdRates` (er-api).
- **`fetchFxValue(bist, fetchFn)`:**
  - `usdTry` = `fetchYahooQuote('USDTRY=X')` → **atomik çekirdek** (THE parite; patlarsa snapshot patlar → cache fallback).
  - `EUR` = `fetchYahooQuote('EURTRY=X')` → **dayanıklı** (try/catch; tek gösterim varlığı, patlarsa atlanır). Değişim% varsa `change.EUR`'a yazılır.
  - BIST (sembol-bazında dayanıklı), `GC=F`/`SI=F` × usdTry (atomik) **aynen kalır**.
- `YAHOO_FALLBACK` korunur (usdTry + makul TRY fiyatları).

### 3.2 `src/lib/api/binance.ts`
- `BinanceFeedOptions`'a eklenir:
  - `fxPairs?: string[]` — ham çift sembolleri (örn. `['USDTTRY']`); stream `${s.toLowerCase()}@trade`.
  - `onFxRate?: (pair: string, rate: number) => void` — fx çifti trade push'ında.
- `connect()`: stream listesi = kripto (`${s}usdt@trade`) + fxPairs (`${s}@trade`), birleşik stream'e eklenir (yeni socket YOK).
- `onmessage`: gelen `d.s` fxPairs setindeyse → `onFxRate(d.s, Number(d.p))`; değilse mevcut davranış (`USDT$` soyup `onPrice`).

### 3.3 `src/lib/stores/liveGameStore.svelte.ts`
- **Yeni state:** `let liveUsdTry = $state<number | undefined>(undefined)`.
- **`effectiveUsdTry` yardımcısı** (fonksiyon, rune okur): kural §2.4. Kullanım yerleri:
  - `source.usdTry()` → `effectiveUsdTry()`
  - `source.assetTry` kripto dalı → `u * effectiveUsdTry()`
  - `oracle.assetUsd` BIST/emtia/döviz dalı → `t / effectiveUsdTry()`
  - `usdTry` getter → `effectiveUsdTry()`
- **Feed kurulumu** (`start()`): `makeFeed({ symbols: [...CRYPTO_SYMBOLS], fxPairs: ['USDTTRY'], onPrice, onStatus, onFxRate })`.
- **`onFxRate(pair, rate)`:** `USDTTRY` ise `liveUsdTry`'ı günceller. Render tavanı için kripto ile **aynı trailing throttle** mekanizmasına bağlanır (pending'e yazılır, 500ms flush'ta uygulanır) — yüksek frekanslı tick `$derived`'i dövmez.

---

## 4. Veri akışı & fallback zinciri

```
USD/TRY:
  Binance usdttry@trade (WS, ~canlı, 7/24)  ──┐
                                              ├─► effectiveUsdTry ─► oracle/source/getter
  Yahoo USDTRY=X (20s poll, hafta içi)  ──────┘   (WS live ? WS : Yahoo ? son-gerçek)

EUR:   Yahoo EURTRY=X (20s poll)  ─► fxCache.prices.EUR  ─► oracle (÷ effectiveUsdTry)
Altın: GC=F × effectiveUsdTry (TRY gösterim) ; USD-değeri = GC=F/gram (kurdan bağımsız)
BIST:  ?bist= (20s poll, ~15dk upstream) ; USD-değeri = bist_try / effectiveUsdTry (canlı nefes)
Kripto: Binance ...usdt@trade (WS) — değişmez
```

**Üç katman fallback:** WS down → Yahoo usdTry; Yahoo down → son-gerçek (`dataStale`/`feedStatus` rozetle yüzeyler); hiç veri yok → `FALLBACK_FX.usdTry` (40).

---

## 5. Hata yönetimi & robustluk

- WS kopması: mevcut `onStatus('stale')` + otomatik reconnect (binance.ts) korunur; `feedStatus==='stale'` → `effectiveUsdTry` Yahoo'ya düşer.
- `USDTRY=X` upstream hatası → `fetchFxValue` throw → `/api/yahoo` cache son-gerçeği `stale:true` ile döner (mevcut fix-A: stale snapshot fxCache'i ezmez).
- Bozuk WS frame: mevcut try/catch yutar (tek frame kaybı kritik değil).
- `liveUsdTry` hiç gelmezse (WS hiç açılmadı): `effectiveUsdTry` Yahoo'yu kullanır → davranış bugünküyle aynı (regresyon yok).

---

## 6. Test (TDD)

- **`yahooSource.test.ts`:** `fetchFxValue` artık `USDTRY=X`/`EURTRY=X` çağırır (mock fetch); usdTry doğru; EUR değişim% yüzeyleniyor; `USDTRY=X` hatası snapshot'ı patlatır (atomik); `EURTRY=X` hatası EUR'u atlar ama snapshot ayakta (dayanıklı). er-api'ye bağlı eski testler silinir/güncellenir.
- **`binance.test.ts`:** `fxPairs:['USDTTRY']` → `usdttry@trade` stream'ine abone; `usdttry` frame'i `onFxRate('USDTTRY', rate)` tetikler, `onPrice`'ı DEĞİL; kripto frame'i hâlâ `onPrice`.
- **`liveGameStore.test.ts`:** WS `onFxRate` tick'i `effectiveUsdTry`'ı (oracle/usdTry getter) günceller, Yahoo `fxCache.usdTry`'ı **ezer**; `feedStatus='stale'` olunca Yahoo'ya **düşer**; `liveUsdTry===undefined` iken Yahoo kullanılır (regresyon yok). Throttle ile flush doğrulaması.
- Mevcut 247 testten er-api varsayan olanlar güncellenir. Hedef: yeşil + net artış.

---

## 7. Kapsam DIŞI (bilinçli)

- **BIST fiyat gecikmesi (15 dk):** ücretsiz Yahoo verisi sert tabanı; tick-canlı BIST = ücretli feed, ayrı dünya.
- **Poll'u 20s'den hızlandırma:** rate-limit kök sebebi (hafıza dersi fix-B); dokunulmaz.
- **`?bist=` cache bypass fix:** çok-kullanıcı sertleştirmesi → Supabase fazı (§8).
- **Deploy (adapter), kullanıcı hesapları, leaderboard/persistence:** ayrı ve büyük; Supabase fazı.
- **Başka coin/varlık, ABD borsası:** ayrı sprint.

---

## 8. Çok-kullanıcı notu

Bu değişiklik **ölçeğe-dost**, ek sunucu yükü getirmez:
- **Binance WS = istemci tarafı.** Her tarayıcı doğrudan Binance'e bağlanır (sunucumuzdan geçmez) → N kullanıcı = sunucuya 0 WS yükü.
- **Yahoo `USDTRY=X`/`EURTRY=X` = varsayılan snapshot'ta → 5s server cache + inflight-dedup arkasında** → N kullanıcı için Yahoo'ya 5s'de 1 çağrı.

**Mevcut tek ölçek-boşluğu (bu spec'e değil):** `?bist=` özel istek cache'i bypass eder → kalabalıkta Yahoo rate-limit riski. **5 kullanıcılık deneme aşamasında sorun değil**; Supabase fazında (hesaplar + leaderboard ile birlikte) kapatılacak.
