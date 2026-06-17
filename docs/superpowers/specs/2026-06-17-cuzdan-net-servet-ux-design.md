# Cüzdan / Net Servet UX — Tasarım (2026-06-17)

## Amaç
Oyuncu, net servetinin ne kadarının **kenarda nakit** ne kadarının **yatırımda** olduğunu tek
bakışta görsün; ve cüzdanındaki bir varlığa tıklayarak doğrudan işleme geçebilsin. İki bağımsız
ama yakın UX parçası, tek spec.

Playtest bağlamı: kurucu ekranı işaretleyerek istedi (NET SERVET kutusu) — "ana paradan kalan +
yatırımda kullanılan" + "cüzdandaki araçlardan al-sat".

## Kilitli Kararlar
| Konu | Karar |
|------|-------|
| "Yatırımda" anlamı | **Güncel değer** (maliyet değil). `Yatırımda = netWorth − nakit` → nakit + yatırım = net servet (tam toplanır, tutarlı). |
| Dağılım yeri | NET SERVET paneli (**`NetWorthMirror`, masaüstü**). Mevcut "Getiri / USD Tutsaydın" satırının ALTINA ikinci 2 sütunlu satır. |
| Mobil | `NetWorthMini` **sade kalır** — dağılım eklenmez (mini bant kalabalıklaşmasın). |
| Tıkla-işlem davranışı | Cüzdan pozisyonuna tıkla → o varlık İŞLEM PANELİ'nde **seçilir** (soldaki PriceList'le birebir aynı akış). Yerinde AL/SAT YOK. |
| Tıkla-işlem mekanizması | `WalletSummary`'ye `onSelect?: (assetId) => void`; `+page` mevcut `handleSelectAsset`'i geçirir (selectedAssetId set + mobilde panele kaydır). |

## Parça 1 — NET SERVET dağılımı

### Yerleşim
```
        TOPLAM DEĞER (USD)
          $1,008,634
   GETİRİ        USD TUTSAYDIN
   +0.86%          +$8,634
─────────────────────────────────   ← yeni üst-çizgi
   KALAN NAKİT    YATIRIMDA
   $732,995       $275,639
```

### Mimari
- `NetWorthMirror.svelte` yeni prop: `cashUsd: Money` (= `store.game.usdBalance`).
- Türev: `investedUsd = netWorthUsd === null ? null : usd(netWorthUsd.amount - cashUsd.amount)`.
- Mevcut grid kalıbı tekrarlanır: 2 sütun, `term.*` token'ları, üstte `border-t border-term-border`.
- Etiketler: "KALAN NAKİT" / "YATIRIMDA" (10px, opacity-50, uppercase tracking — mevcut etiket stili).
- Değer formatı: `displayUsd()` (mevcut helper) — nakit her zaman değer; yatırımda `netWorth === null` ise `—`.
- Renk: nakit nötr/yeşilimsi (`text-term-green` opsiyonel), yatırımda nötr (`text-term-text`); abartısız (bunlar K/Z değil, dağılım).
- `+page.svelte` → `NetWorthMirror`'a `cashUsd={store.game.usdBalance}` geçirir.

### Kenar durumlar
- `netWorthUsd === null` (fiyat eksik) → YATIRIMDA `—`, KALAN NAKİT yine gösterilir.
- Hiç pozisyon/mevduat yok → YATIRIMDA ≈ `$0`, KALAN NAKİT ≈ net servet (doğru).

## Parça 2 — Cüzdanda tıkla-işlem

### Mimari
- `WalletSummary.svelte` yeni prop: `onSelect?: (assetId: string) => void`.
- Her pozisyon satırı `<div>` → `<button type="button" onclick={() => onSelect?.(p.assetId)}>` (a11y: gerçek buton).
- Görsel ipucu: satıra hover (`cursor-pointer`, `hover:border-term-borderGlow` benzeri) — PriceList satırlarıyla tutarlı; tıklanabilirlik belli olsun.
- `+page.svelte` → `WalletSummary`'ye `onSelect={handleSelectAsset}` geçirir.
  - `handleSelectAsset` zaten: `selectedAssetId = id` + (mobil) `#trade-panel` scrollIntoView.
- Tersi kolay: panelde tutulan varlık için `TÜMÜ` (sat-hepsi) + `MAX` (al) butonları zaten mevcut (full-user-control korunur).

### Kenar durumlar
- `onSelect` verilmezse satır yine render olur ama tık no-op (opsiyonel prop, geriye dönük güvenli).
- Pozisyon yokken ("Pozisyon yok") tıklanacak satır yok — değişiklik yok.

## Test Stratejisi (TDD)
- `NetWorthMirror`: dağılım hesabı saf → `invested = netWorth − cash`; `netWorth === null` → invested `—`. (Mevcut component test altyapısı pure-logic; gerekirse format/helper seviyesinde doğrulanır.)
- `WalletSummary`: `onSelect` pozisyon tıkında doğru `assetId` ile çağrılır (callback testi; hafif).
- Manuel/E2E: cüzdandan THYAO'ya tıkla → İŞLEM PANELİ THYAO seçili gelir; mobilde panele kayar.
- Regresyon: `npm run check` + `npm run test` + `npm run build` (compile) temiz.

## Kapsam Dışı (YAGNI)
- Cüzdanda yerinde AL/SAT düğmeleri (ikinci işlem yolu — reddedildi).
- Maliyet-bazlı dağılım / "yatırıma soktuğun" (güncel değer seçildi).
- YATIRIMDA alt-kırılımı (pozisyon vs mevduat) — CÜZDAN + MEVDUAT panelleri zaten detay veriyor.
- Mobil mini banta dağılım eklemek.
- Alım sırasında grafik pop-up'ı (ayrı ileri-fikir: [[future-trade-ui-ideas]]).

## Notlar
- Bu spec, günlük mühürlü kur dilimi (lokal main, henüz push edilmedi) üstüne gelen playtest UX
  isteğidir. Bağımsız; o işten etkilenmez.
