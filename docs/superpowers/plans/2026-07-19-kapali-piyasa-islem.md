# Kapalı Piyasada İşlem — Bekleyen Emir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** US+BIST'te piyasa kapalıyken/veri bayatken emir kabul edilip açılışı izleyen İLK taze fiyatta otomatik gerçekleşsin (spec: `docs/superpowers/specs/2026-07-19-kapali-piyasa-islem-design.md`).

**Architecture:** Yahoo `meta.regularMarketTime` damgası veri yoluna eklenir (Task 1); saf karar mantığı yeni `src/lib/domain/orders/` modülünde + `calendar.ts` genişlemesi (Task 2); kuyruk verisi ve settle döngüsü `liveGameStore`'da, kalıcılık save envelope'unda (Task 3); UI TradeForm/WalletSummary (Task 4). Yeni timer yok — settle, fiyatın zaten işlendiği yerlerde çağrılır.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript strict, Vitest, Playwright.

## Global Constraints (CLAUDE.md + spec)

- Para asla `number` değil: `Money` + `usd()`/`tryM()` (`src/lib/domain/money.ts`).
- Domain modülü yalnız `money.ts` + kendi type'larına bağımlı; UI'sız; TDD zorunlu.
- Identifier'lar İngilizce, UI metinleri Türkçe; renkler `term.*` token'ları.
- **Token ekonomisi (kurucu talebi):** reviewer subagent YALNIZ Task 2 ve Task 3'te; Task 1/4/5 implementer self-check + test yeşiliyle geçer.
- Spec'in "Bilinçli kapsam dışı" listesi bağlayıcı: limit emir, GTC, rezervasyon, kısmi dolum, `includePrePost`, clock seam YOK. Bunlardan birine "ihtiyaç" görünüyorsa plan sapması demektir — durup sor.
- Her task kendi commit'iyle biter; `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (uygulama Sonnet'te).

---

### Task 1: Fiyat damgası plumbing (`priceAt`)

**Files:**
- Modify: `src/lib/api/yahooSource.ts` (fetchYahooQuote + fetchFxValue)
- Modify: `src/lib/api/types.ts` (FxValue)
- Create: `src/lib/api/yahooSource.test.ts`

**Interfaces:**
- Consumes: mevcut `fetchYahooQuote(symbol, fetchFn)`.
- Produces: `FxValue.priceAt?: Record<string, number>` (sembol → epoch **ms**; yalnız bist+us sembolleri, damga upstream'de yoksa sembol haritada olmaz). `fetchYahooQuote` dönüşüne `marketTimeMs?: number` eklenir. `/api/yahoo` route ve `fx.ts` DEĞİŞMEZ (envelope'u aynen geçirirler).

- [ ] **Step 1: Failing test** — `yahooSource.test.ts`: sahte `fetchFn` Yahoo chart JSON'u döner (`meta: { regularMarketPrice: 288, previousClose: 280, regularMarketTime: 1784200000 }`). Beklenti: `fetchYahooQuote` → `marketTimeMs === 1784200000_000`; `regularMarketTime` alanı olmayan meta → `marketTimeMs === undefined`. `fetchFxValue(['THYAO'], ['NVDA'], fetchFn)` → `priceAt.THYAO` ve `priceAt.NVDA` tanımlı; metaller/EUR/usdTry `priceAt`'te YOK.
- [ ] **Step 2: `npx vitest run src/lib/api/yahooSource.test.ts` → FAIL** (alan yok).
- [ ] **Step 3: Implement** — `fetchYahooQuote` meta tipine `regularMarketTime?: unknown` ekle; dönüş:

```ts
const marketTimeMs = typeof meta?.regularMarketTime === 'number' ? meta.regularMarketTime * 1000 : undefined;
return { price, changePct, marketTimeMs };
```

`fetchFxValue` içinde `const priceAt: Record<string, number> = {};` — bist döngüsünde `if (q.marketTimeMs !== undefined) priceAt[sym] = q.marketTimeMs;` (US döngüsünde aynı), dönüşe `priceAt` ekle. `types.ts`: `priceAt?: Record<string, number>;` (yorumuyla: "yalnız bist/us; settle'ın taze-fiyat kanıtı").
- [ ] **Step 4: Test PASS + `npm run check`.**
- [ ] **Step 5: Commit** — `feat(api): yahoo fiyat damgasını (regularMarketTime) FxValue.priceAt olarak yüzeyle`

### Task 2: Domain — `orders/` modülü + calendar genişlemesi

**Files:**
- Create: `src/lib/domain/orders/orders.ts`, `src/lib/domain/orders/orders.test.ts`
- Modify: `src/lib/domain/calendar/calendar.ts` (+ yanındaki mevcut calendar test dosyası; yoksa `calendar.sessionOpen.test.ts` oluştur)

**Interfaces:**
- Consumes: `Money`/`usd()`; `istanbulParts`/`newYorkParts`/`isMarketOpen`/`NYSE_HOLIDAYS_2026` (calendar içi).
- Produces (Task 3-4 bunlara birebir güvenir):

```ts
// orders.ts
export type PendingOrder =
  | { id: string; assetId: string; side: 'buy' | 'sell'; kind: 'units'; units: number; placedAt: number }
  | { id: string; assetId: string; side: 'buy'; kind: 'amountUsd'; amountUsd: Money; placedAt: number };
export function resolveUnits(order: PendingOrder, priceUsd: number): number; // amountUsd: floor(amount/price * 1e4)/1e4 (TradeForm çevirim kuralıyla aynı)
// calendar.ts
export function sessionOpenMs(category: 'bist' | 'us', at: Date): number; // ÖN KOŞUL: isMarketOpen(category, at) === true
// nextMarketOpen(category, at) artık 'us' için de gerçek sonuç döner (bist davranışı DEĞİŞMEZ)
```

- [ ] **Step 1: Failing testler** — `resolveUnits`: units-kind aynen; amountUsd-kind `usd(500)` @ 327.5 → `1.5267`; fiyat 0/negatif → throw. `sessionOpenMs`: `('bist', 2026-07-20T11:37:00+03:00)` → `Date.parse('2026-07-20T10:00:00+03:00')`; `('us', 2026-07-20T16:45:00Z)` (NY 12:45 EDT) → `Date.parse('2026-07-20T09:30:00-04:00')`; kış/EST örneği `('us', 2026-01-13T15:00:00-05:00)` → aynı gün `09:30:00-05:00`. `nextMarketOpen('us', Pazar)` → Pazartesi 09:30 EDT; NYSE tatili atlanır; zaten açıkken `at` aynen döner.
- [ ] **Step 2: `npx vitest run src/lib/domain` → yeni testler FAIL.**
- [ ] **Step 3: Implement.** `sessionOpenMs` — tz literal'siz, dakika hassasiyetli geri sayım:

```ts
export function sessionOpenMs(category: 'bist' | 'us', at: Date): number {
  const p = category === 'us' ? newYorkParts(at) : istanbulParts(at);
  const openMin = category === 'us' ? 9 * 60 + 30 : 10 * 60;
  const sinceOpenMin = p.hour * 60 + p.minute - openMin; // ön koşul gereği >= 0
  return Math.floor(at.getTime() / 60000) * 60000 - sinceOpenMin * 60000;
}
```

`nextMarketOpen`'da `category === 'us'` dalı: 14 güne kadar her gün için `newYorkParts(probe).key` al, `[`${key}T09:30:00-04:00`, `${key}T09:30:00-05:00`]` adaylarından `newYorkParts(cand).hour === 9 && minute === 30` okuyanı seç (DST iki yönde de doğru), geçmişse/`isMarketOpen('us', cand)` false ise atla. `resolveUnits`: amountUsd-kind → `Math.floor((order.amountUsd.amount / priceUsd) * 1e4) / 1e4`.
- [ ] **Step 4: Testler PASS; mevcut calendar testleri de yeşil.**
- [ ] **Step 5: Commit** — `feat(domain): PendingOrder + resolveUnits + sessionOpenMs + nextMarketOpen('us')`

### Task 3: Store — kuyruk, settle, kalıcılık (EN RİSKLİ TASK — reviewer şart)

**Files:**
- Modify: `src/lib/stores/savegame.ts` (envelope + revive)
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Modify: `src/lib/stores/liveGameStore.test.ts` (+ savegame testleri hangi dosyadaysa oraya roundtrip testi)

**Interfaces:**
- Consumes: Task 1 `fxCache.priceAt`, Task 2 `PendingOrder`/`resolveUnits`/`sessionOpenMs`.
- Produces (`LiveGameStore` interface değişiklikleri — TradeForm/WalletSummary bunları okur):

```ts
readonly pendingOrders: PendingOrder[];
readonly orderNotice: string | null;        // son settle iptal/dolum bildirimi
tradeMode(assetId: string): 'instant' | 'queued'; // tradeBlockReason(assetId) SİLİNİR (tek çağıran TradeForm:38)
buyAmountUsd(assetId: string, amountUsd: Money): void;
cancelOrder(orderId: string): void;
clearOrderNotice(): void;
```

- [ ] **Step 1: Failing testler** (mevcut `t.setYahoo` harness'ı; `priceAt` alanını fixture'lara ekle):
  1. BIST kapalı anda `buy('THYAO', 5)` → holdings değişmez, `pendingOrders.length === 1`, `lastError === null`, `onFirstTrade` ÇAĞRILMAZ.
  2. `fxStale` iken kripto `buy` bile kuyruğa girer (tek kural).
  3. Taze tick (piyasa açık + `priceAt.THYAO >= sessionOpenMs('bist', now)`) → settle: holding oluşur, order silinir, `onFirstTrade` TAM 1 kez.
  4. **15dk tuzağı:** piyasa açık ama `priceAt.THYAO` < bugünkü `sessionOpenMs` (dünkü damga) → settle DOLDURMAZ.
  5. `buyAmountUsd('THYAO', usd(500))` kuyruğa amountUsd-kind yazar; dolumda adet açılış fiyatından hesaplanır.
  6. Dolum anında bakiye yetersiz → order silinir + `orderNotice` iptal mesajı içerir + holdings değişmez.
  7. `cancelOrder(id)` siler + persist eder; `clearOrderNotice()` null'lar.
  8. Envelope roundtrip: `pendingOrders` kaydedilir; revive'da `amountUsd` `usd()` ile yeniden sarılır (`instanceof`/round garantisi).
  9. Bekleyen US emri olan sembol restore'da `activeUs`'a (BIST emri `activeBist`'e) girer.
- [ ] **Step 2: FAIL doğrula.**
- [ ] **Step 3: Implement:**
  - `savegame.ts`: `SaveEnvelopeV1`'e `pendingOrders?: PendingOrder[];` (opsiyonel — eski kayıt `undefined` → `[]`); `reviveEnvelope`'ta `pendingOrders: raw.pendingOrders?.map(o => o.kind === 'amountUsd' ? { ...o, amountUsd: usd(o.amountUsd.amount) } : o)`.
  - Store: `let pendingOrders = $state<PendingOrder[]>(initial?.pendingOrders ?? []);` `let orderNotice = $state<string | null>(null);` `persist()` envelope'una alan ekle. Emir id'si: `` `${now()}-${orderSeq++}` `` (modül-yerel sayaç; `crypto.randomUUID` YOK — test determinizmi).
  - `isAssetFresh(assetId)`: kategori çözümü `tradeBlockReason`'daki mevcut örüntünün AYNISI (`CATALOG[id]?.category ?? (activeUs.includes(id) ? 'us' : 'bist')`). crypto → `feedStatus === 'live'`; bist/us → `isMarketOpen(cat, new Date(nowMsTick)) && !fxStale && fxCache.priceAt?.[id] !== undefined && fxCache.priceAt[id] >= sessionOpenMs(cat, new Date(nowMsTick))`; diğerleri (altın/gümüş/EUR) → `!fxStale`.
  - `tradeMode(id)` = `isAssetFresh(id) ? 'instant' : 'queued'`. `tradeBlockReason`'ı ve `apply` içindeki `blocked` throw'larını SİL (davranış artık yönlendirme, red değil).
  - `buy`/`sell`: `tradeMode === 'queued'` → `enqueueOrder(...)` (validate `units > 0`; push; `lastError = null`; `persist()`; `onFirstTrade` YOK); değilse mevcut `apply(() => buyAsset/sellAsset ...)` yolu aynen. `buyAmountUsd`: instant'ta `units = resolveUnits(order, assetUsdPrice(id))` ile normal buy'a düşer, queued'da amountUsd-kind enqueue.
  - `settlePendingOrders()`: `apply()` KULLANMAZ (guard döngüsü + tek-emir izolasyonu için). Her order: `isAssetFresh` değilse atla; taze ise `price = assetUsdPrice(id)` (undefined → atla, sonraki tick); `units = resolveUnits(order, price)`; `try { side==='buy' ? buyAsset(game, oracle, id, units) : sellAsset(game, oracle, id, units); orderNotice = doldu-mesajı; opts.onFirstTrade?.() kendi try/catch'inde } catch (e) { orderNotice = iptal-mesajı (e.message ile) }`; her iki dalda order listeden çıkar. Döngü sonunda değişiklik olduysa TEK `persist()`.
  - Çağrı noktaları (2): poll `refresh()` içinde `ensureSeal()` sonrası; WS throttle tick handler'ında kripto fiyatı state'e yazıldıktan sonra.
  - `computeInitialActiveBist`/`computeInitialActiveUs`: birleşime `initial?.pendingOrders` sembollerini kat (US/BIST ayrımı mevcut `savedUs` örüntüsüyle).
- [ ] **Step 4: Tüm store testleri + `npm run test` yeşil.**
- [ ] **Step 5: Commit** — `feat(store): bekleyen emir kuyruğu — tradeMode, settle, kalıcılık`

### Task 4: UI — TradeForm, WalletSummary, format, DataInfoModal

**Files:**
- Modify: `src/lib/components/TradeForm.svelte`, `src/lib/components/WalletSummary.svelte`, `src/lib/components/format.ts`, `src/lib/components/format.test.ts`, `src/lib/components/DataInfoModal.svelte`

**Interfaces:**
- Consumes: Task 3 store yüzeyi (`tradeMode`, `pendingOrders`, `buyAmountUsd`, `cancelOrder`, `orderNotice`, `clearOrderNotice`) + Task 2 `nextMarketOpen`.
- Produces: `format.ts`'e saf fonksiyonlar: `queueToastMessage(side, assetId, units, dollars): string`; `formatOpenEta(openMs, nowMs): string` (`'20.07 10:00'` biçimi; `openMs <= nowMs` → `'az sonra'`); `marketBadge` metni `'KAPALI'` → `'KAPANIŞ'`.

- [ ] **Step 1: Failing format testleri** — `format.test.ts`: `marketBadge(false).text === 'KAPANIŞ'` (mevcut KAPALI testini güncelle); `queueToastMessage('buy','THYAO',5,1440)` → `'⏳ EMİR KUYRUKTA — AÇILIŞTA GERÇEKLEŞİR: 5 THYAO'` kalıbı (mevcut `tradeToastMessage` üslubuyla); `formatOpenEta` iki dal.
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: TradeForm** — `blockReason` yerine `const mode = $derived(assetId ? store.tradeMode(assetId) : 'instant');` AL/SAT `disabled` KALDIRILIR (yalnız `assetId === null` boş durumu kalır). `let lastEdited = $state<'units' | 'dollars'>('units');` (`handleUnitsInput`/`handleDollarInput` set eder). `handleBuy`: `mode === 'queued' && lastEdited === 'dollars' && dollarAmount > 0` → `store.buyAmountUsd(id, usd(dollarAmount))`, aksi halde `store.buy(id, u)`; toast `mode === 'queued' ? queueToastMessage(...) : tradeToastMessage(...)`. `handleSell` hep units. UYARI kutusu yerine `mode === 'queued'` iken amber bilgi satırı: `"PİYASA KAPALI / VERİ BEKLENİYOR — emir kuyruğa alınır, açılışı izleyen ilk taze fiyatta gerçekleşir; bakiye yetmezse iptal olur."`
- [ ] **Step 4: WalletSummary** — `store.pendingOrders.length > 0` iken "BEKLEYEN EMİRLER" bölümü: satır = `AL/SAT · sembol · (units-kind: '5 adet' | amountUsd-kind: '$500.00') · formatOpenEta(nextMarketOpen(kategori, new Date(nowMs)))` + `İPTAL` butonu (`store.cancelOrder(o.id)`); kategori çözümü Task 3'teki örüntüyle aynı (kripto/diğer → ETA `'veri gelince'`). `store.orderNotice !== null` iken tek satır amber bildirim + `×` (`clearOrderNotice`). Stil: mevcut WalletSummary satır sınıfları, `term.*` token'ları.
- [ ] **Step 5: DataInfoModal** — veri bölümüne 2 cümle: `"Seans kapalıyken gösterilen fiyat son KAPANIŞ fiyatıdır. Kapalıyken verilen emirler, açılışı izleyen ilk taze fiyatta otomatik gerçekleşir; açılışta bakiye yetmezse emir iptal edilir."`
- [ ] **Step 6: `npm run test` + `npm run check` yeşil → Commit** — `feat(ui): bekleyen emir arayüzü — kuyruk bildirimi, KAPANIŞ rozeti, iptal`

### Task 5: Doğrulama + E2E smoke

**Files:**
- Create: `tests/e2e/pending-order.spec.ts`
- (Gerekirse) Modify: mevcut e2e fixture'ları — beklenti: değişiklik GEREKMEZ (hiçbir e2e disabled/KAPALI varsaymıyor; 2026-07-19'da grep'le doğrulandı).

- [ ] **Step 1: E2E smoke** — mevcut mock + misafir giriş kalıbıyla: BIST satırı seç → AL ve SAT butonlarının `toBeEnabled()` olduğunu assert et (saat/piyasa durumundan bağımsız — davranış farkını ASSERT ETME, flake üretir). Dolum akışı E2E'ye KONMAZ (store testleri kapsıyor; clock seam ayrı dilim).
- [ ] **Step 2: Tam doğrulama** — `npm run test` → tümü yeşil; `npm run check` → 0 hata; `npm run build` → başarılı; Docker + `npx supabase start` + `npm run e2e` → 13 mevcut + yeni smoke yeşil.
- [ ] **Step 3: Manuel kontrol** (lokal Supabase'li dev server, hafta sonu/akşam kolay): kapalı BIST varlığına emir ver → toast + Bekleyen Emirler satırı; reload → emir duruyor; İPTAL → siliniyor; DataInfoModal metni görünüyor.
- [ ] **Step 4: Commit + son** — `test(e2e): bekleyen emir smoke — AL/SAT asla disabled değil`. CHANGELOG/memory.md güncellemesi oturum kapanış ("s") ritüelinde.

---

## Self-review notu (plan yazarı, 2026-07-19)

Spec kapsama: tek kural→T3; taze-fiyat/15dk tuzağı→T1+T2+T3 (test 4 kritik); domain modülü→T2; kalıcılık/offline/prune→T3 (offline dolum = boot sonrası ilk `refresh()` settle'ı, ayrı kod gerekmez); UI 4 madde→T4; E2E sınırı→T5. Tip tutarlılığı: `PendingOrder`/`tradeMode`/`buyAmountUsd`/`cancelOrder`/`orderNotice`/`priceAt`/`sessionOpenMs`/`resolveUnits` adları task'lar arası birebir. Bilinçli sadelik: `orderNotice` tek string (çoklu eşzamanlı iptal → son mesaj kazanır; v1 kabulü, spec'in kapsam-dışı ruhuyla uyumlu).
