# Mevduat Dilimi — Tasarım (2026-06-14)

## Amaç
Oyuncuya **TL vadeli mevduat** yatırım aracı ekle. Para canlı kurla TL'ye çevrilir, sabit
oranla işler, ekranda **saniyelik akan** bir bakiye olarak görünür. Asıl ürün hedefi:
"dürüst ayna" dersi — mevduat TL'de büyür görünür ama dolara dönerken lira erimişse kâr
buharlaşır; ayrıca "param çalışıyor" hissi (idle-game psikolojisi) ile geri-gelme kancası
(32 günlük gerçek-zaman vade).

Yol haritasındaki "MEVDUAT dilimi" budur (bkz. proje hafızası). Danışmanın "damlayan getiri /
streaming yield" fikri burada hayata geçer (CEO bunu mevduat dilimine havale etmişti).

## Kilitli Kararlar
| Konu | Karar |
|------|-------|
| Para birimi | **TL mevduat**. Açarken USD→TL oto-takas (canlı kur), bozarken TL→USD (o anki canlı kur). |
| Gösterim | **Hibrit**: vitrin (kart) saniyelik akar; günlük döküm / kapanış kartı / snapshot resmi günlük değeri kullanır. |
| Vade | **Tek sabit 32 gün**, tek oran (`DEPOSIT_ANNUAL_RATE ≈ %50/yıl nominal TL` — quant kalibre eder). |
| Erken bozma | **Faiz sıfır** (sadece anapara TL→USD geri). Gerçek sürtünme, kurul kanonu. |
| Adet | **Tek aktif mevduat** (`game.deposit: ActiveDeposit \| null`). |
| Yer | **Cüzdan altında ayrı MEVDUAT kartı** (`DepositCard.svelte`). |
| Net servet etkisi | **(Y) Mark-to-market**: net servet biriken (net) faizle yukarı tikler. Erken bozma biriken faizi yok eder → net servet o an bir basamak düşer (gerçek sonuç, yapay ceza değil). |

## Veri Modeli

### `domain/deposit/deposit.ts` (rework — zaman-damgası tabanlı)
Mevcut modül gün-tamsayısı (`openedDay`/`currentDay`) kullanıyor; oyun artık gerçek İstanbul
takvimiyle çalıştığından **zaman damgasına** geçilir.

```ts
export interface ActiveDeposit {
  readonly principalTry: Money;   // TL anapara (açılışta USD→TL)
  readonly usdAtOpen: Money;      // açılışta ödenen USD (dürüst-ayna kıyası: "yatırdığın $X")
  readonly usdTryAtOpen: number;  // açılış kuru
  readonly openedAtMs: number;    // gerçek zaman damgası
  readonly annualRate: number;
}

export const TERM_DAYS = 32;
export const DEPOSIT_ANNUAL_RATE = 0.50; // quant kalibre edecek
export const WITHHOLDING_TAX = 0.075;    // mevcut

// gün cinsinden geçen süre (kesirli), TERM_DAYS'te tavanlanır
elapsedDays(d, nowMs): number
isMatured(d, nowMs): boolean
// lineer birikim: vade değerine doğru pro-rata, NET (stopaj sonrası)
accruedNetInterest(d, nowMs): Money            // TL
// anapara + accruedNetInterest (vitrin + mark-to-market tabanı)
currentValueTry(d, nowMs): Money               // TL
// vade dolunca alınacak net değer (anapara + tam dönem net faiz)
maturityNetValueTry(d): Money                   // TL
```

`accruedNetInterest = principalTry × rate × (min(elapsedDays, TERM)/365) × (1 − WITHHOLDING_TAX)`.
`elapsedDays = TERM` olunca tam vade net faizine eşitlenir (kesintisiz geçiş).

### `gameState.ts` (deposit alanı + reducer'lar — "geri bağlama")
`GameState`'e `readonly deposit: ActiveDeposit | null` eklenir (createGameState'te `null`).

```ts
// usdTry: açılış anındaki canlı kur; cash↔deposit atomik
openDeposit(game, usdTry, usdAmount, nowMs): GameState
//  - guard: deposit === null, usdAmount > 0, usdAmount ≤ usdBalance.amount
//  - principalTry = usdAmount × usdTry
//  - usdBalance -= usdAmount; deposit = {...}
breakDeposit(game, usdTry, nowMs): GameState
//  - guard: deposit !== null
//  - payoutTry = isMatured ? maturityNetValueTry : principalTry  (erken = faiz 0)
//  - usdBalance += payoutTry / usdTry; deposit = null
```

Reducer'lar faiz hesabını `domain/deposit`'ten çağırır. `netWorthUsdFn` **değişmez** (varlık-only);
mevduat değeri store'da eklenir (aşağı). Böylece motor saf kalır, mevduat parite/zaman katmanı
store'dadır.

### `savegame.ts`
`SaveEnvelopeV1` şekli aynı kalır (deposit `game` içinde taşınır). `reviveEnvelope`, JSON'dan gelen
`game.deposit`'in Money alanlarını yeniden sarar:
```ts
deposit: raw.game.deposit
  ? { ...raw.game.deposit,
      principalTry: tryM(raw.game.deposit.principalTry.amount),
      usdAtOpen: usd(raw.game.deposit.usdAtOpen.amount) }
  : null
```
Eski kayıtlar (`deposit` alanı yok) → `null`, uyumlu.

## Store Entegrasyonu — `liveGameStore.svelte.ts`

**Net servet (mark-to-market):**
```ts
const depositUsd = $derived(
  game.deposit === null ? 0
    : currentValueTry(game.deposit, now()).amount / effectiveUsdTry()
);
const netWorth = $derived.by(() => {
  try { return usd(netWorthUsdFn(game, oracle).amount + depositUsd); }
  catch { return game.deposit ? usd(depositUsd) : null; } // varlık yoksa bile mevduat sayılır
});
```
> `now()` reaktif değil → mevduat değeri poll'da (~20s) tazelenir; **saniyelik şimşek karttadır**
> (hibrit karar). Bu kabul edilebilir.

**Aksiyonlar** (mevcut `apply()` deseni — guard→reducer→persist→hata yüzeyle):
```ts
const openDepositAction = (usdAmount) =>
  apply(() => openDeposit(game, effectiveUsdTry(), usdAmount, now()));
const breakDepositAction = () =>
  apply(() => breakDeposit(game, effectiveUsdTry(), now()));
```
`get deposit()` getter'ı eklenir (kart için ham `ActiveDeposit | null`).

**Snapshot/allocation:** `recordSnapshot` zaten store `netWorth` derived'ini kullanır → mevduat
otomatik dahil. `computeAllocation`'a mevduat payı eklenir (aşağı).

## Snapshot & Dağılım — `dailySnapshot.ts`
- `AllocationKey`'e `'deposit'` eklenir.
- `computeAllocation`'a `depositUsd: number` parametresi (varsayılan 0) → `add('deposit', depositUsd)`.
- `STRATEGY_BADGES`: `deposit → 'Mevduatçı'`. Mevcut `usd → 'Mevduatçı'` yanlış adlandırması
  `usd → 'Nakitçi'` olarak düzeltilir. `BADGE_PRIORITY`'ye `'deposit'` eklenir.
- `recordSnapshot` çağrısı `depositUsd` geçer.

## UI

### `DepositCard.svelte` (yeni)
Cüzdan altında. `nowMs` prop'u alır (StatusBadge gibi, 1sn tik) → saniyelik akış. Saf
`domain/deposit` fonksiyonlarıyla yerel hesaplar; store'dan `deposit`, `usdTry`, aksiyonlar.

**Kapalıyken (deposit === null):**
```
MEVDUAT
  Tutar: $______   [+100K][+1M][HEPSİ]   ≈ ₺_______ yatırılacak
  32 gün · faiz %50/yıl
  [ MEVDUAT AÇ ]
```
`HEPSİ` = `usdBalance`. MAX deseni mevcut TradePanel'den.

**Açıkken:**
```
MEVDUAT  (kilitli)
  ₺1,240,338 ↑ canlı           ← currentValueTry, saniyelik
  ≈ $26,840   (yatırdığın: $26,800)   ← mark-to-market vs usdAtOpen
  Vade: 28 gün kaldı
  [ BOZ ]   faiz %50/yıl
```
Vade dolunca: "VADE DOLDU — faiz işledi" + `[ TOPLA ]` (= breakDeposit, tam faizli).

**BOZ davranışı:** vade dolmadıysa tek onay ("Erken bozarsan faizden vazgeçersin, sadece anaparayı
alırsın. Bozulsun mu?"). Vade dolduysa onaysız topla. (`full-user-control`: tersine çevirmeyi
zorlaştırma; tek onay yalnız geri-alınamaz faiz kaybı için.)

### `format.ts`
`countdownLabel(msRemaining): string` → "28 gün kaldı" / "5 sa kaldı" / "12 dk kaldı". TDD.

### `+page.svelte`
`DepositCard`'ı `WalletSummary` altına yerleştir; `nowMs` (mevcut 1sn tik) + `store` geç. Masaüstü
3-kolon + mobil tek-akış mevcut yerleşimi koru.

## Kapsam Dışı (YAGNI)
USD mevduat · birden çok vade/oran · birden çok eşzamanlı mevduat · oto-yenileme (rollover) ·
diğer varlıklarda streaming yield · net servetin saniyelik (poll-arası) tiklemesi.

## Test Stratejisi (TDD)
- **deposit.ts**: elapsedDays/isMatured/accruedNetInterest (0 anı, yarı yol, vade, vade-sonrası tavan),
  currentValueTry, maturityNetValueTry, stopaj.
- **gameState.ts**: openDeposit (guard'lar, cash düşer, principalTry=usd×kur), breakDeposit
  (erken=anapara, vade=anapara+net faiz, cash artar, deposit null).
- **savegame.ts**: deposit revive (Money sarma), eski kayıt (deposit yok→null).
- **liveGameStore**: net servet mevduatı içerir (MTM), erken bozma net serveti düşürür (Y davranışı),
  aksiyonlar persist eder.
- **dailySnapshot.ts**: computeAllocation deposit payı, strategyBadge 'Mevduatçı'/'Nakitçi'.
- **format.ts**: countdownLabel sınırları.
- DepositCard görsel smoke (Playwright) — insan playtest yerine geçmez.

## Riskler / Notlar
- Oran (`DEPOSIT_ANNUAL_RATE`) knowledge-cutoff tahmini → quant TODO.
- (Y) kararı gereği erken bozmada net servet aşağı basamak yapar; kart bunu net mesajlar (BOZ onayı).
- 32 gün vade, 3 günlük kapanış-kartı deneyinde olgunlaşmaz; streaming yield + geri-gelme kancası
  deney sonrası retention için. Deney başlamadan merge edilirse build'e dahil olur (deney başlayınca
  merge yok kuralı yürürlüğe girer).
