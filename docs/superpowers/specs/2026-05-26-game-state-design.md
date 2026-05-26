# Game State Tasarımı — Cüzdan / Portföy / Skor Beyni

**Tarih:** 2026-05-26
**Kapsam:** VASİYET (ve aynı motoru paylaşan tüm modlar) için saf, test edilebilir oyun-durumu çekirdeği: nakit, döviz çevrimi, genel varlık (borsa/kripto/emtia/döviz) al-sat, mevduat, akıllı zaman ilerletme, net servet + kâr oranı skoru. Sprint 1 Task 5.
**Dışarıda kalan:** Emlak (Task 5b, ayrı spec), reaktif Svelte store (Task 7), persistence adapter (Task 6), skor tabelası (Supabase sprint'i), trader/danışman ajanı (MVP sonrası), 2001/2018 arşivi, canlı API (CANLI sprint'i).

> **Bağlam:** Bu spec, FX motoru (Task 3) tamamlandıktan sonra yazıldı. Motor fiyat *üretiyor* ama henüz oyuncunun parası/portföyü/hamlesi yok. Bu tasarım o boşluğu dolduran "cüzdan beynini" kurar — oyun ilk kez (mantıksal olarak) uçtan uca oynanabilir hale gelir.

---

## 1. Tasarım İlkeleri

1. **Saf & test edilebilir.** State geçişleri Svelte reaktivitesinden bağımsız saf fonksiyonlar `(state, ...) → yeni state`. Reaktif sarmalama Task 7'nin işi.
2. **Gizli gelecek, koda gömülü.** Fiyat **her zaman `state.clock.day`'de** okunur; gelecek günü sormak yapısal olarak imkânsız. Bu, "şans değil beceri" ilkesini ve ileride trader/danışman ajanının future-leak güvenliğini garanti eder.
3. **Moddan bağımsız.** State + reducer'lar fiyatın kaynağını (`seeded` 2025 / `live` 2026) bilmez; `FxEngine` soyutlar. VASİYET ve CANLI aynı çekirdeği kullanır.
4. **Buluta hazır.** State düz JSON (Money = `{amount,currency}`, fonksiyon/Date/circular ref yok) → localStorage bugün, Firestore/Supabase yarın; sadece persistence adapter değişir.
5. **Geleceğe açık.** Emlak (Task 5b) state'e, zaman ilerletmeye ve net servete **yeniden yazmadan** eklenebilecek şekilde şekillendirilir.

---

## 2. Yerleşim & Mimari

CLAUDE.md kuralları: *"her `domain/<sistem>/` klasörü yalnızca `money.ts` + kendi type'larına bağlı"* ve *"sistemler arası iletişim **sadece** `stores/` üzerinden."* Game State doğası gereği fx + deposit + clock + scenario'yu **birleştirir** → tanımı gereği sistemler-arası iletişim → `domain/`'e konamaz.

| Dosya | Sorumluluk | Task |
|-------|-----------|------|
| `src/lib/stores/gameState.ts` | Saf `GameState` tipi + geçiş fonksiyonları (bu spec) | **5** |
| `src/lib/stores/gameState.test.ts` | TDD testleri | **5** |
| `src/lib/stores/persistence.ts` | localStorage serialize/deserialize | 6 |
| `src/lib/stores/game.svelte.ts` | Svelte 5 runes reaktif sarmalayıcı + clock tick | 7 |

`gameState.ts` saf olduğu için fx/deposit/clock/scenario'yu import etmesi **serbesttir** (store katmanı). Reaktivite yok → vitest ile doğrudan test edilir.

---

## 3. Hazırlık Refactor'ü — Genel Varlık Modeli

Oyuncu evreninde borsa (BIST), kripto (BTC), emtia (gram altın), döviz (EUR) olacak. Hepsi **tek mekanik**: TRY fiyatlı, adet tutulan, bugünkü fiyattan değerlenen "varlık". Bu yüzden commit'li FX/scenario katmanı genelleştirilir (additive + yeniden adlandırma, **mevcut fx testleri yeşil kalır**):

| Önce | Sonra |
|------|-------|
| `StockSeed` | `AssetSeed` (+ `category: 'bist' \| 'crypto' \| 'commodity' \| 'fx'`) |
| `ScenarioData.stocks` | `ScenarioData.assets` |
| `FxEngine.stockPriceForDay(ticker, day)` | `FxEngine.assetPriceForDay(assetId, day)` |

`assetPriceForDay` davranışı aynen `stockPriceForDay` gibi (drift + per-asset birikmeyen noise, `Money` TRY döner). `category` şu an yalnızca metadata (UI gruplama + ileride kategori-bazlı kural için); fiyat mantığını değiştirmez.

**`ScenarioData`'ya `depositAnnualRate: number` eklenir** (VASIYET = 0.42). Sihirli sabit yerine senaryo verisi → 2001'in %7500 faizi ileride sadece veridir.

---

## 4. State Şekli

```ts
interface AssetHolding {
  assetId: string;      // 'THYAO' | 'BTC' | 'XAUGRAM' | 'EUR' ...
  units: number;        // adet (pozitif)
  avgCost: Money;       // TRY, birim başı ortalama alış (postmortem K/Z için)
}

interface GameState {
  playerId: string;
  scenarioId: GameMode;     // 'vasiyet' — scenario verisi BURADA tutulmaz, id'den bulunur
  seed: number;             // FX motorunu yeniden kurmak için
  clock: GameClock;         // clock.ts'ten (day, totalDays, speed, paused)
  usdBalance: Money;        // miras + skor para birimi
  tryBalance: Money;        // işlem nakdi
  deposits: Deposit[];      // deposit.ts'ten
  holdings: AssetHolding[];
  depositSeq: number;       // deterministik mevduat id üretimi için sayaç
  createdAt: number;        // Unix ts — Firestore/Supabase uyumlu
  updatedAt: number;
}
```

- Scenario nesnesi (data ile) ve FxEngine **state'te tutulmaz** → state küçük & serileştirilebilir kalır. `scenarioId` + `seed`'den yeniden kurulur.
- Her geçiş fonksiyonu `updatedAt`'i tazeler; `state` her zaman yeni nesne döner (immutable).

---

## 5. Geçiş Fonksiyonları (saf reducer'lar)

Fiyat gerektiren reducer'lar `fx: FxEngine` alır ve fiyatı **daima `state.clock.day`**'de okur.

```ts
createGameState(scenarioId: GameMode, seed: number, playerId: string, now: number): GameState
// usdBalance=$1,000,000, tryBalance=₺0, clock=createClock(scenarioId) (gün 1), boş deposits/holdings

convertUsdToTry(state, fx, usdAmount: Money): GameState   // rate=fx.usdTryForDay(day); USD↓ TRY↑
convertTryToUsd(state, fx, tryAmount: Money): GameState   // tersi

openDeposit(state, tryAmount: Money, termDays: 30|90|180, annualRate: number): GameState
// tryBalance↓; deposit.openDeposit ile yeni Deposit; id = `dep-${depositSeq}`, depositSeq++
// annualRate'i çağıran (store/Task 7) scenario.data.depositAnnualRate'ten geçirir; testlerde 0.42
closeDeposit(state, depositId: string): GameState
// manuel kapanış; deposit.closeDeposit(bugün) → tryBalance↑ (erken=principal, vadeli=+net faiz); listeden çıkar

buyAsset(state, fx, assetId: string, units: number): GameState
// fiyat=fx.assetPriceForDay(assetId, day); maliyet=fiyat×units (TRY); tryBalance↓
// holding birleşir, avgCost yeniden hesaplanır
sellAsset(state, fx, assetId: string, units: number): GameState
// gelir=fiyat×units; tryBalance↑; units azalır (0 olursa holding silinir)
```

**Komisyon yok** (karar). Oynanış spec'i §4: "gün-içi al-sat sadece gürültü yer" — noise churn'ü zaten cezalandırır.

### Hata / validasyon (deposit.ts stiliyle, `throw`)
- Yetersiz bakiye (USD/TRY) → `throw`
- Pozitif olmayan miktar/units → `throw`
- Sahip olunmayan / yetersiz units satışı → `throw`
- Bilinmeyen `assetId` → `fx.assetPriceForDay` zaten `throw` eder
- Var olmayan `depositId` kapatma → `throw`

---

## 6. Zaman İlerletme + Sonraki Olay

```ts
advanceTime(state, step: number): GameState
// clock'u gün gün ilerletir (step gün); HER yeni günde:
//   vadesi DOLAN her mevduat otomatik kapanır → tryBalance += closeDeposit(o gün), listeden çıkar
// clock.totalDays'i aşmaz (oynanış spec §5: "mevduat işler")

nextEventDay(state): number | null
// bugünden sonraki en yakın "olay" günü: en erken mevduat vadesi VEYA son gün (totalDays).
// 'sonraki olaya kadar' ilerletme bunu besler. (Vergi günü / tapu / kira kancaları sonra eklenir.)
```

`advanceTime` fiyat gerektirmez (mevduat vadesi fiyattan bağımsız) → `fx` parametresi almaz. Akıllı ilerletme (karar): oyuncu 1g / 1hafta / "sonraki olaya kadar" seçer; vade kaçmaz.

---

## 7. Skor — Net Servet + Kâr Oranı

```ts
netWorthUsd(state, fx): Money
// = usdBalance
//   + (tryBalance → USD, fx.usdTryForDay(day))
//   + Σ mevduat closeDeposit(bugün) değeri → USD
//   + Σ holding (units × fx.assetPriceForDay(assetId, day)) → USD
// hepsi state.clock.day'de değerlenir, USD döner

profitRate(state, fx): number   // netWorthUsd.amount ÷ 1_000_000  (1.25 = +%25) — tabelaya girecek puan
hasWon(state, fx): boolean      // netWorthUsd ≥ WIN_TARGET_USD ($1,037,172)
```

- Mevduatın bugünkü değeri = `closeDeposit(bugün)` → vadesi dolmadıysa principal (erken çıkış faizi sıfır), dolduysa principal + net faiz = bugün nakde çevrilebilir gerçek değer.
- `profitRate` = skor primitifi. Tabela (global, **opt-in**) ve tek-kişilik benchmark'lar (USD-tut / all-in / optimal) **aynı sayıyı** yer; ikisi de ayrı görev.
- `WIN_TARGET_USD = 1_037_172` modül sabiti (USD enflasyon hedefi, yıldan bağımsız).

---

## 8. Varlık Evreni (veri — quant görevi)

Model roster boyutundan bağımsız çalışır; bu bir **veri** kararıdır.

| Kategori | İçerik | Not |
|----------|--------|-----|
| `bist` | Hedef **BIST100** (mevcut 9 dahil) | gerçek 2025 baş+son fiyatı → drift otomatik çıkar |
| `crypto` | BTC, ETH | yüksek volatilite |
| `commodity` | gram altın (XAUGRAM), gram gümüş (XAGGRAM) | orta-yüksek drift |
| `fx` | EUR | düşük volatilite (USD zaten base) |

> **Veri sourcing = quant-analyst görevi (Task 5'i bloklamaz, paralel).** Şu anki `macro2025` değerleri knowledge-cutoff tahmini; gerçek 2025 verisi (BIST100 bileşenleri baş+son fiyat, BTC/altın/EUR eğrileri) çekilip kalibre edilecek. Motor herhangi bir değerle çalışır; Task 5 testleri *bütünlük* doğrular, kesin sayı değil. Drift, baş+son fiyattan türetilir (uydurma yok); volatilite kategori-default + balance sim ile kalibre.

---

## 9. Birim Sınırları (isolation)

| Birim | Ne yapar | Bağımlılık |
|-------|----------|-----------|
| `gameState.ts` | State + saf geçişler + skor | money, fx, deposit, clock, scenario types |
| `assetPriceForDay` (fx) | Senaryo+seed+gün → varlık fiyatı | money, scenario types, noise |
| (Task 6) `persistence.ts` | GameState ↔ localStorage | gameState |
| (Task 7) `game.svelte.ts` | Reaktif state + clock tick + fx kurulumu | gameState, fx, scenario |

---

## 10. Geleceğe Açık Şekillendirme (Emlak — Task 5b)

Emlak yeniden yazmadan eklenir:
- `GameState`'e `properties[]` eklenir (şimdi YOK — YAGNI).
- `advanceTime` zaten "her yeni günde olayları işle" deseninde → **tapu tamamlanma (5-18g) + TRY/gün kira geliri** buraya doğal girer.
- `nextEventDay` "en yakın olay" hesaplıyor → tapu/kira günleri katılır.
- `netWorthUsd` "her varlık türünü topla" deseninde → emlak değeri katılır.

---

## 11. Kapsam Dışı / Ertelenen (bilinçli)

| Konu | Nereye |
|------|--------|
| Reaktif Svelte store + clock tick | Task 7 |
| Persistence adapter | Task 6 |
| Emlak (ev al → tapu bekle → tadilat→getiri → TRY/gün kira) | Task 5b (ayrı spec) |
| Skor tabelası (global, **opt-in**) | Supabase sprint'i |
| Trader / danışman ajanı (kural=free, LLM=premium) | MVP sonrası — **future-leak güvenliği §1.2'den gelir** |
| Benchmark hesabı (USD-tut / all-in / optimal) | Skorlama görevi (sim koşturucu ister) |
| Canlı 2026 API (Yahoo/TCMB/Binance proxy+cache) | CANLI sprint'i |
| 2001 / 2018 arşiv verisi | Veri sprint'i |
| Komisyon, kısmi mevduat çekimi, vergi günü | Sonraki sprint (balance sim'den sonra) |

---

## 12. Test Planı (TDD)

`gameState.test.ts` — her fonksiyon önce kırmızı, sonra yeşil:

- **createGameState:** $1.000.000 USD, ₺0, gün 1, boş portföy.
- **convert:** USD→TRY→USD round-trip; yetersiz bakiye → throw.
- **buyAsset:** TRY düşer, holding eklenir, avgCost doğru; yetersiz TRY → throw; bilinmeyen asset → throw.
- **sellAsset:** gelir eklenir, units azalır, sıfırda holding silinir; oversell → throw.
- **openDeposit/closeDeposit:** TRY düşer; erken kapanış = principal; vadeli = principal + net faiz; geçersiz id → throw.
- **advanceTime:** gün ilerler; vadesi dolan mevduat otomatik nakde döner; totalDays aşılmaz.
- **nextEventDay:** en yakın mevduat vadesi veya son gün.
- **netWorthUsd:** gün 1 pozisyonsuz = tam $1.000.000; karışık portföy bilinen seed/günde doğru toplam.
- **profitRate / hasWon:** eşik davranışı ($1,037,172).
- **Determinizm:** aynı seed + aynı aksiyon dizisi → aynı net servet.

`npm run test` + `npm run check` + `npm run build` geçmeden "tamam" denmez (verification-before-completion).

---

## 13. Açık Veri Kalemleri (quant — Task 5'i bloklamaz)

- [ ] BIST100 roster + gerçek 2025 baş+son fiyatları (→ drift)
- [ ] BTC / ETH / gram altın / gram gümüş / EUR 2025 eğrileri
- [ ] Volatilite kategori-default'ları + enflasyon parametresinin balance kalibrasyonu (kazanılabilirlik %30-70)
