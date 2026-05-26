# VASİYET Oynanış Tasarımı — Deterministik Çekirdek Döngü

**Tarih:** 2026-05-26
**Kapsam:** VASİYET modunun oynanış modeli — deterministik dünya, hamle döngüsü, belirsizlik, karşılaştırmalı postmortem; ve bunlardan türeyen FX Engine (Sprint 1 Task 3).
**Dışarıda kalan:** CANLI SEANS canlı API entegrasyonu, 2001/2018 arşiv verisi ve olay kartı içerikleri (mimari hazır, veri/uygulama sonraki sprint), UI/route akışı (Sprint 1B).

> **Bu spec neyi değiştiriyor (supersedes):**
> `2026-05-25-sprint1-domain-design.md` içindeki iki kararın yerini alır:
> 1. VASİYET'in FX kaynağı **"Canlı" değil → seeded deterministik 2025 eğrisi**.
> 2. Senaryo yılı **2024 → 2025** (kanon değişikliği, bkz. §10).
> Diğer kararlar (düz modüller + tek game store, persistence adapter, state şekli) aynen geçerli.

---

## 1. Tasarım İlkeleri

Oyunun amacı: **"Eline 1M USD geçse gerçekte nasıl kullanırdın?"** sorusunu bir ayna gibi göstermek. Bundan üç ilke doğar:

1. **Şans değil beceri.** Sonucu oyuncunun kararları belirler, rastgelelik değil. Dünya deterministiktir; seeded "noise" yalnızca grafiğe doku katar, kazanmayı/kaybetmeyi etkilemez.
2. **Tam belirsizlik.** Oyuncu geleceği göremez. Yalnızca bugüne kadarki fiyatları, geçmiş grafiği ve belirsiz sinyalleri (olay kartları/haberler) görür. "Hindsight bulmacası" engellenir.
3. **Adil & tekrarlanabilir.** Aynı senaryo + aynı seed → aynı dünya. Bu hem testleri hem balance simülasyonunu deterministik kılar.

---

## 2. Mod Rolleri

| Mod | Veri kaynağı | Zaman | Süre | Karakter |
|-----|--------------|-------|------|----------|
| **VASİYET SEFERİ** | **2025** (bitmiş, gerçek, seeded eğri) | Hamle bazlı | 365g | Adil ana mod — beceri, deterministik, "güncel" his |
| **CANLI SEANS** | 2026 **canlı API** | Gerçek zaman | 90g | Güncel tansiyon (canlı entegrasyon sonraki sprint) |
| 2001 KRİZİ | Şubat 2001 arşiv | Hamle/gerçek zaman | 30g | Çok zor — sonraki sprint (veri fişe takılır) |
| 2018 KUR ŞOKU | Ağustos 2018 arşiv | Hamle/gerçek zaman | 45g | Zor — sonraki sprint (veri fişe takılır) |

**"Güncel mi, deterministik mi?" çelişkisinin çözümü mod ayrımıdır:** VASİYET deterministik ve güncel-hisli (geçen yıl, 2025); CANLI gerçek-zamanlı ve canlı (2026). İkisi aynı motoru kullanır, yalnızca veri kaynağı ve zaman modu değişir.

---

## 3. Senaryo-Güdümlü Mimari

Tüm modlar **tek bir deterministik motoru** paylaşır; mod = veri + parametre. Yeni tarihsel mod eklemek **sadece bir veri dosyası** eklemektir, kod değil.

```ts
// src/lib/domain/scenario/types.ts
interface Scenario {
  id: GameMode               // 'vasiyet' | 'canli' | 'kriz2001' | 'kur2018'
  year: number               // 2025 | 2026 | 2001 | 2018
  totalDays: number          // 365 | 90 | 30 | 45
  timeMode: 'turn' | 'realtime'
  fxSource: 'seeded' | 'live' // VASİYET/krizler: seeded; CANLI: live
  difficulty: 'orta' | 'zor' | 'cokZor'
  data: ScenarioData         // anchor eğriler + BIST + enflasyon (seeded modlar)
}
```

- **MVP'de doldurulan:** `vasiyet` (2025 verisiyle).
- **İskeleti hazır, ertelenen:** `canli` (live), `kriz2001`, `kur2018`.
- Motor senaryoyu parametre olarak alır; mod-özel `if/else` dağılmaz.

---

## 4. Dünya Modeli — Deterministik & Gizli-Gelecek

Seeded modlarda dünya, senaryonun anchor eğrilerinden + seed'li küçük noise'dan türetilen **saf fonksiyonlardır**:

- `usdTryForDay(day): Money`
- `stockPriceForDay(ticker, day): Money`

Kurallar:
- **Determinizm:** `(scenario, seed, day)` → her zaman aynı fiyat. Akümülatif rastgele yürüyüş **yok** — noise, anchor eğrisinin etrafında `hash(seed, day)` ile üretilen küçük, birikmeyen sapmadır. Bu, trendi her zaman baskın kılar → uzun vade tutan kazanır, gün-içi al-sat sadece gürültü yer.
- **Gizli gelecek:** Fonksiyonlar `day > buGün` için çağrılmaz. Motor `buGün`'ü bilmez (saf kalır); **çağrı disiplini store/UI katmanındadır** — sadece `gün ≤ state.clock.day` okunur. Bu, "tam belirsizlik" ilkesini korur.
- **Noise genliği:** Günlük sapma küçük (hedef ±%0.3 bandı), yıllık trende (~%18-20) kıyasla cılız. Kesin değer balance simülasyonuyla kalibre edilir (§11).

---

## 5. Hamle Döngüsü (VASİYET, turn modu)

```
1. GÖR      — portföy, nakit, güncel fiyatlar, geçmiş grafik, aktif olaylar
2. KARAR    — al / sat / mevduat aç / emlak al / bekle
3. İLERİ    — oyuncu zaman adımını seçer
4. AÇILIM   — zaman atlar; fiyatlar eğride ilerler, mevduat işler, kira
              gelir, vergi günü (50.) keser, tapu (5-18g) tamamlanır
5. SONUÇ    — olaylar tetiklenir, yeni durum gösterilir → 1'e dön
```

**Zaman ilerleme granularity = B (onaylı):** Oyuncu adımı seçer —
**1 gün / 1 hafta (varsayılan) / "sonraki olaya kadar"**.
"Sonraki olaya kadar" seçeneği, kritik anlara (tapu tamamlanması, mevduat vadesi, vergi günü, olay kartı) **otomatik durur** — 365 günü tek tek tıklatma yorgunluğunu önler, kritik kararı kaçırtmaz.

**CANLI modunda** aynı state ve aynı motor kullanılır; tek fark saatin manuel "İleri" yerine otomatik akmasıdır (clock modülü her ikisini de destekliyor — Task 1'de yapıldı).

---

## 6. Belirsizlik & Sinyaller

Oyuncunun karar bilgisi yalnızca şunlardır:
- Güncel ve geçmiş fiyatlar (grafik)
- **Olay kartları / haberler** — kanon: desktop ticker banner, mobil 2-seçenekli kart

Sinyaller **belirsizdir**: garanti vermez, bazen yanıltıcı olabilir (gerçek hayattaki gibi). Olay kartı *içerikleri* sonraki sprintin işi; bu spec yalnızca "sinyaller belirsizdir, gelecek sızdırılmaz" sözleşmesini sabitler.

---

## 7. Skorlama & Karşılaştırmalı Postmortem

Oyunun payoff'u — oyuncunun davranışını ayna gibi göstermek.

Yıl sonunda net servet (USD bazlı) hesaplanır ve **benchmark'larla karşılaştırılır**:

| Benchmark | Anlamı |
|-----------|--------|
| **Hiçbir şey yapma / USD tut** | Mirası bozdurmadan beklesen |
| **Tek varlığa all-in** (her biri için) | Her hisseye/USD'ye/mevduata tamamını bassan |
| **Optimal** | Deterministik dünyada hesaplanabilen mümkün en iyi sonuç |

- **Kazanma koşulu:** Yıl sonu serveti, USD enflasyon hedefini (**$1,037,172**) geçmek = "mirası korudun".
- **Derece:** Benchmark'lara göre konumlanır (postmortem ekranında gösterilir).
- **Balance hedefi:** Kazanılabilirlik **%30-70** (kanon). Noise genliği ve enflasyon parametreleri buna göre kalibre edilir.
- Postmortem *ekranı* ve viral paylaşım görseli Sprint 1B/CMO işi; bu spec hesaplama sözleşmesini sabitler.

---

## 8. FX Engine — Sprint 1 Task 3 (bu tasarımdan türeyen dar parça)

### Modüller ve sınırlar

```
src/lib/data/macro2025.ts        — saf statik 2025 veri (mantık yok)
src/lib/domain/scenario/types.ts — Scenario, ScenarioData tipleri
src/lib/domain/fx/fx.ts          — saf deterministik fiyat fonksiyonları
src/lib/domain/fx/fx.test.ts     — TDD testleri (dosyanın yanında)
```

Bağımlılık kuralı (CLAUDE.md): `fx/` yalnızca `money.ts` + kendi/scenario type'larına bağlıdır. UI yok, store yok, API yok.

### `macro2025.ts` — veri şekli

```ts
interface ScenarioData {
  usdTryAnchors: { day: number; rate: number }[]  // ~12 aylık çapa, 2025 gerçeği
  stocks: {
    ticker: string         // THYAO, EREGL, ASELS, GUBRF, KCHOL, TUPRS, SASA, YKBNK, BIMAS
    startPrice: number
    annualDrift: number    // yıllık yön
    volatility: number     // per-ticker noise genliği
  }[]
  dailyInflation: number   // USD tarafı %0.01/gün hedefiyle uyumlu
}
```

> 2025 sayısal değerleri **doldurulacak** (quant-analyst doğrulayacak). USD/TRY kabaca 2025 başı ~₺35.3 → yıl sonu ~₺42-43 bandı; kesin aylık ortalamalar veri toplamayla netleşir. Spec yalnızca *şekli* sabitler.

### `fx.ts` — API (factory pattern)

```ts
function createFxEngine(scenario: Scenario, seed: number): {
  usdTryForDay(day: number): Money
  stockPriceForDay(ticker: string, day: number): Money
}
```

- Anchor noktaları arası **lineer interpolasyon** + `hash(seed, day)` ile birikmeyen küçük noise.
- Saf ve deterministik: aynı `(scenario, seed, day)` → aynı `Money`.
- `Money` tipi kullanılır; ham `number` döndürülmez.

---

## 9. Birim Sınırları (isolation kontrolü)

| Birim | Ne yapar | Bağımlılık |
|-------|----------|-----------|
| `macro2025.ts` | 2025 gerçeğini sabit veri olarak tutar | — |
| `scenario/types.ts` | Senaryo sözleşmesini tanımlar | `money.ts` |
| `fx/fx.ts` | Senaryo + seed + gün → fiyat | `money.ts`, scenario types |
| (sonra) `game store` | buGün'ü tutar, sadece geçmişi okur | fx, scenario, clock, deposit |

Her birim tek sorumlu, arayüzü net, içi değişse tüketicisi kırılmaz.

---

## 10. Kanon Değişikliği — 2024 → 2025

Bu tasarım projenin premise'ini günceller. Aşağıdakiler **ayrı bir görev olarak** güncellenecek (bu spec'in implementation planına dahil):

- **CLAUDE.md** — "2024 makro koşulları" → 2025; USD/TRY eğrisi (₺29.90→₺35.30 yerine 2025 bandı ~₺35.3→~₺42-43); BIST başlangıç fiyatları; enflasyon notu.
- **memory** (`project-state.md`, varsa canon memory) — 2025'e güncelle.
- USD enflasyon hedefi (**$1,037,172**) USD tarafı olduğu için yıldan bağımsız; korunur (doğrulanacak).

> Not: 2001/2018 krizleri tarihsel kalır — onlarda "eski olmak" kasıtlı özelliktir, değişmez.

---

## 11. Test Disiplini

TDD zorunlu (CLAUDE.md). Task 3 için testler önce yazılır:

- **Determinizm (en kritik):** aynı `(scenario, seed, day)` → aynı fiyat.
- **Anchor sadakati:** gün 0 ≈ başlangıç kuru, gün 365 ≈ yıl sonu kuru.
- **Trend baskınlığı:** uzun aralıkta yön korunur; noise trendi bastırmaz.
- **Noise sınırı:** günlük değişim hedef bandı (±%0.3) aşmaz.
- **BIST:** her ticker başlangıç fiyatından başlar, drift uygulanır.
- **Balance simülasyonu** (`tests/balance/`): 1000x oyun → kazanılabilirlik %30-70. Noise/enflasyon kalibrasyonu buradan doğrulanır.

`npm run test` + `npm run build` geçmeden "tamam" denmez (verification-before-completion).

---

## 12. MVP Kapsamı (YAGNI)

**Bu sprintte (Task 3):** `macro2025.ts` (şekil + 2025 verisi), `scenario/types.ts`, `fx/fx.ts` + testleri, kanon güncellemesi.

**Mimari hazır ama ertelenen:**
- CANLI SEANS canlı API (Yahoo/TCMB) — `fxSource: 'live'` iskeleti var, bağlantı sonraki sprint.
- 2001/2018 arşiv verisi + olay kartları.
- Hamle döngüsü UI, postmortem ekranı, viral paylaşım (Sprint 1B / CMO).
- Optimal-benchmark hesabının kesin algoritması (Task 5/skorlama ile birlikte).

---

## 13. Açık Veri Kalemleri (implementation öncesi)

- [ ] 2025 USD/TRY aylık ortalama anchor'ları (quant doğrular)
- [ ] 9 BIST hissesinin 2025 başlangıç fiyatı + yıllık drift
- [ ] Noise genliği ve enflasyon parametrelerinin balance kalibrasyonu
