# Faz 0 — Güven ve Doğruluk Düzeltmeleri (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dış AI audit'in (docs/external-ai-audit-2026-07-14.md) HEAD'de doğrulanmış 4 yüksek riskli bulgusunu + 3 küçük finansal doğruluk işini kapatmak: cloud save sessiz veri kaybı, reaktif olmayan zaman bazlı değerleme, cache bypass, kapalı/stale piyasada işlem, toUSD komisyon bug'ı, mevduat oranı seam'i.

**Architecture:** Mevcut katman sınırları korunur — domain saf kalır, store'lar tek iletişim kanalı, endpoint'ler ince proxy. Yeni kavramlar: DI'lı `createSavesPusher` (test edilebilir bulut push), store içi 1s reaktif saat (`nowMsTick`), `createKeyedTtlCache` (sembol-set-başına TTL + inflight dedup), `tradeBlockReason` (guard + UI tek sözleşme).

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript strict, Vitest, Playwright (lokal Supabase).

## Global Constraints

- Para asla `number` değil: `src/lib/domain/money.ts` → `Money` + `usd()`/`tryM()`.
- Identifier'lar İngilizce, UI metinleri Türkçe; renkler `term.*` token (hard-coded #hex yasak).
- Svelte 5 runes (`$state`, `$derived`, `$effect`); `setInterval` yalnız state cache besleyebilir, DOM manipülasyonu yasak.
- Domain modülleri UI'sız; sistemler arası iletişim yalnız `src/lib/stores/`; API çağrıları yalnız `src/lib/api/`.
- TDD: her task önce başarısız test. Sık commit.
- **Review süreci (audit §8.3, risk-bazlı):** Task 1-4 veri-kaybı/auth sınıfı → her task ayrı kod review'lu. Task 5-13 → yalnız TDD + tek final whole-branch review. Riskten bağımsız "her task'a reviewer" YOK.
- Uygulama Sonnet oturumunda, izole worktree'de (superpowers:using-git-worktrees). Task 10, Task 5'e bağımlı — sıra korunur.
- **Rollback/failure davranışı:** her task bağımsız commit → tek `git revert` ile geri alınır. Worktree, Task 13 final doğrulaması yeşil olmadan main'e merge edilmez. Task 1-3 zinciri yarım bırakılmaz (yalnız Task 1-2 merge edilirse davranış değişmez — kablolama Task 3'te; bu kasıtlı güvenli sıralamadır).
- Plan dosya gövdesi kopyalamaz: implementer değiştireceği dosyayı önce okur; snippet'ler sözleşmedir, birebir yapıştırma hedefi değildir.

---

### Task 1: `createSavesPusher` — hata yüzeyleyen bulut push (DI'lı, test edilebilir)

**Risk/etki:** P0. Bugün `upsert()` sonucu okunmuyor ([+page.svelte:60-62]); Supabase HTTP hataları (`{error}` dönüşü — RLS/grant/5xx) sessizce "başarı" sayılıyor → çıkışta `clearSave` son ilerlemeyi siliyor. Prod'da yaşanmış grant hatası (migration 0002) bu yolun gerçekliğinin kanıtı.

**Files:**
- Modify: `src/lib/stores/cloudSave.ts` (dosya sonuna ekle)
- Test: `src/lib/stores/cloudSave.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SavesPusherDeps {
    /** Oturum kullanıcısı; auth hatasında THROW eder, oturum yoksa null döner. */
    getUser: () => Promise<{ id: string } | null>;
    /** saves upsert; Supabase yanıt zarfını aynen döner (throw etmez).
     *  PromiseLike: Supabase query builder thenable'dır, Promise DEĞİL — Promise yazarsan Task 3 typecheck'te patlar. */
    upsertSave: (userId: string, env: SaveEnvelopeV1) => PromiseLike<{ error: { message: string } | null }>;
    getOwnerId: () => string | null;
  }
  export function createSavesPusher(deps: SavesPusherDeps): (env: SaveEnvelopeV1) => Promise<void>
  ```
- Semantik sözleşme:
  - `getUser` throw / `null` döner → **throw** (teslim edilemedi; oturumsuz lokal oyunda `fire()` bunu sessizce yutar, çıkış flush'ında ise hata olarak yüzeyler).
  - `getOwnerId() !== user.id` (yabancı oyun) → **sessiz başarı** (bilinçli no-op: yabancı oyun kullanıcının kasasına yazılmaz; upsert çağrılmaz).
  - `upsertSave` `{error: non-null}` döner → **throw** (`cloud-push: ${error.message}`).
  - Başarı → resolve.

- [ ] **Step 1: Başarısız testleri yaz** — dört senaryo, fake deps ile:

```ts
describe('createSavesPusher', () => {
  const env = { v: 1 } as unknown as SaveEnvelopeV1; // mevcut test dosyasındaki envelope fixture kalıbını kullan
  it('upsert {error} dönerse throw eder', async () => {
    const push = createSavesPusher({
      getUser: async () => ({ id: 'u1' }),
      upsertSave: async () => ({ error: { message: 'permission denied' } }),
      getOwnerId: () => 'u1',
    });
    await expect(push(env)).rejects.toThrow('permission denied');
  });
  it('oturum yoksa throw eder (teslim edilemedi)', async () => {
    const push = createSavesPusher({ getUser: async () => null, upsertSave: async () => ({ error: null }), getOwnerId: () => 'u1' });
    await expect(push(env)).rejects.toThrow();
  });
  it('yabancı ownerId: upsert ÇAĞRILMADAN sessiz başarı', async () => {
    const upsertSave = vi.fn(async () => ({ error: null }));
    const push = createSavesPusher({ getUser: async () => ({ id: 'u1' }), upsertSave, getOwnerId: () => 'BAŞKASI' });
    await expect(push(env)).resolves.toBeUndefined();
    expect(upsertSave).not.toHaveBeenCalled();
  });
  it('başarıda upsert doğru argümanlarla çağrılır', async () => {
    const upsertSave = vi.fn(async () => ({ error: null }));
    const push = createSavesPusher({ getUser: async () => ({ id: 'u1' }), upsertSave, getOwnerId: () => 'u1' });
    await push(env);
    expect(upsertSave).toHaveBeenCalledWith('u1', env);
  });
});
```

- [ ] **Step 2: Koş, FAIL doğrula** — `npm run test -- cloudSave` → "createSavesPusher is not a function" beklenir.
- [ ] **Step 3: Minimal implementasyon** — yukarıdaki semantik sözleşme birebir; ~15 satır.
- [ ] **Step 4: Koş, PASS doğrula** — `npm run test -- cloudSave`.
- [ ] **Step 5: Commit** — `fix(cloud-save): upsert hatası yüzeyleyen createSavesPusher (audit P0, TDD)`

---

### Task 2: `fire()` — başarısız push'ta envelope'u koru (requeue)

**Risk/etki:** P0'ın ikinci yarısı. Bugün `pending` push'tan önce null'lanıyor, hatada geri konmuyor ([cloudSave.ts:53-61]) → ilk başarısız flush'tan sonra ikinci flush boş kuyruğu "başarı" sayıyor, `handleSignOut` local'i siliyor. Mevcut test bu davranışı onaylıyor (cloudSave.test.ts "flush başarıda true, push hatasında false döner" — ikinci flush `true` bekliyor); sözleşme değişecek.

**Files:**
- Modify: `src/lib/stores/cloudSave.ts` (`fire()` gövdesi)
- Test: `src/lib/stores/cloudSave.test.ts`

**Interfaces:**
- Consumes/Produces: `createCloudPush` dış API'si değişmez (`schedule/enable/cancel/flush`). Yeni davranış: başarısız push'ta envelope kuyrukta kalır; uçuş sırasında `schedule()` ile gelen DAHA YENİ envelope eskisini ezer (yeni kazanır).

- [ ] **Step 1: Başarısız testleri yaz:**

```ts
it('başarısız flush envelope kaybetmez; ikinci flush AYNI envelope ile yeniden dener', async () => {
  const push = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
  const sync = createCloudPush(push, { debounceMs: 1 });
  sync.enable();
  sync.schedule(env);
  expect(await sync.flush()).toBe(false);
  expect(await sync.flush()).toBe(true);       // ESKİ: true (boş kuyruk); YENİ: true (gerçek retry)
  expect(push).toHaveBeenCalledTimes(2);
  expect(push).toHaveBeenNthCalledWith(2, env); // aynı envelope
});
it('push hâlâ patlıyorsa ikinci flush da false döner', async () => {
  const push = vi.fn().mockRejectedValue(new Error('boom'));
  // ... schedule + iki flush → ikisi de false, push 2 kez çağrıldı
});
it('uçuş sırasında schedule edilen YENİ envelope, başarısız eskiyi ezer', async () => {
  // push ilk çağrıda: içeride sync.schedule(newerEnv) yap, sonra reject et.
  // Sonraki flush → push newerEnv ile çağrılır (eski env geri konmaz).
});
```

- [ ] **Step 2: Koş, FAIL doğrula** (ilk test: `push` 1 kez çağrılır, 2 bekleniyor).
- [ ] **Step 3: Minimal implementasyon:**

```ts
async function fire(): Promise<boolean> {
  if (pending == null) return true;
  const env = pending;
  pending = null;
  try {
    await push(env);
    return true;
  } catch {
    if (pending == null) pending = env; // uçuşta yeni envelope geldiyse o kazanır
    return false;
  }
}
```

- [ ] **Step 4: Tüm cloudSave testlerini koş** — eski "ikinci flush true (boş kuyruk)" testinin sözleşmesini yeni davranışa güncelle; başka test kırılmamalı.
- [ ] **Step 5: Commit** — `fix(cloud-save): başarısız push envelope'u korur, flush gerçek retry yapar (audit P0, TDD)`

---

### Task 3: `+page.svelte` kablolaması — inline callback yerine pusher

**Risk/etki:** Task 1-2'nin prod'a bağlanması. Davranış değişikliği: Supabase `{error}` artık çıkışı durdurur ("Son ilerleme buluta gönderilemedi…" mesajı zaten var, [+page.svelte:418] — şimdi gerçekten tetiklenebilir olur).

**Files:**
- Modify: `src/routes/+page.svelte:54-63` (cloudPush kurulumu)

**Interfaces:**
- Consumes: `createSavesPusher` (Task 1).

- [ ] **Step 1: Kablola** (değişken gölgelenmesine dikkat — dıştaki `data` prop'u ile `getUser` dönüşünün `data`'sı çakışır, yeniden adlandır):

```ts
const cloudPush = createCloudPush(
  createSavesPusher({
    getUser: async () => {
      const { data: userData, error } = await data.supabase.auth.getUser();
      if (error) throw new Error(`auth: ${error.message}`);
      return userData.user;
    },
    upsertSave: (userId, envelope) =>
      data.supabase.from('saves').upsert({ user_id: userId, payload: envelope, schema_version: envelope.v }),
    getOwnerId: () => getOwnerId(localStorage),
  }),
);
```

- [ ] **Step 2: Doğrula** — `npm run test` + `npm run check` + `npm run build` yeşil.
- [ ] **Step 3: Preview smoke** — dev server: misafir girişi → BTC al → sekme gizle/göster (visibilitychange flush) → konsolda hata yok; oyun akışı bozulmadı.
- [ ] **Step 4: Commit** — `fix(cloud-save): +page push'u createSavesPusher'a bağlandı (audit P0)`

---

### Task 4: E2E — çıkışta bulut kalıcılığı kanıtı

**Risk/etki:** Audit'in talebi: "yalnız request çıkmasını değil başarılı persistence sonucunu doğrula". Bugün hiçbir E2E çıkış akışını test etmiyor.

**Files:**
- Create: `tests/e2e/signout-persistence.spec.ts`
- Consumes: `tests/e2e/helpers/` (mailpit, supabase-admin, enter, market-mocks) — `auth-email.spec.ts`'teki mevcut kayıt/giriş akış kalıbını yeniden kullan.

- [ ] **Step 1: Spec'i yaz** — akış:
  1. E-posta ile kayıt + giriş (auth-email.spec.ts kalıbı, Mailpit doğrulaması dahil).
  2. Oyuna gir, `BTC` 1 adet AL (core-journey.spec.ts kalıbı: `#trade-units-BTC` + AL butonu + `✓ BTC ALINDI` toast'ı).
  3. AccountPanel'den çıkış yap (auth-email.spec.ts'teki mevcut çıkış seçicisi; yoksa panele `data-testid` eklemek serbest).
  4. **DB kanıtı:** `supabase-admin` helper ile `saves` tablosunda kullanıcı satırı VAR ve `payload.game.holdings` BTC pozisyonunu içeriyor:
  ```ts
  const { data: row } = await admin.from('saves').select('payload').eq('user_id', userId).single();
  const holdings = (row!.payload as { game: { holdings: { assetId: string; units: number }[] } }).game.holdings;
  expect(holdings).toContainEqual(expect.objectContaining({ assetId: 'BTC', units: 1 }));
  ```
  5. Aynı e-posta ile tekrar giriş → oyun geri geldi (BTC pozisyonu UI'da görünür).
- [ ] **Step 2: Koş** — Docker + `npx supabase start` + `npm run e2e -- signout-persistence` → PASS.
- [ ] **Step 3: Tam E2E koş** — `npm run e2e` (13 senaryo) yeşil.
- [ ] **Step 4: Commit** — `test(e2e): çıkışta bulut kalıcılığı — saves satırı + geri giriş doğrulaması`

---

### Task 5: Reaktif saat — mevduat/kira/net servet zamanla aksın

**Risk/etki:** P1. `depositUsd`/`propertiesUsd` `$derived` içinde reaktif olmayan `now()` okuyor ([liveGameStore.svelte.ts:229,235]) → faiz/kira tahakkuku ekranda donuyor, ancak reseal/aksiyon ile sıçrıyor; sayfadaki saniyelik kartla çelişebiliyor.

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts` (tick state + start/stop + iki derived)
- Test: `src/lib/stores/liveGameStore.test.ts`

**Interfaces:**
- Produces: store içi `nowMsTick: number` ($state; 1s'de bir `now()` ile tazelenir — `setInterval` yalnız state cache besliyor, mevcut poll kalıbıyla aynı, DOM'a dokunmaz). **Task 10 bunu tüketir.** `opts.now` seam'i aksiyonlar için aynen kalır.

- [ ] **Step 1: Başarısız test** — mevcut harness kalıbı (fake timers + `opts.now` + `flushSync`):

```ts
it('mevduat değeri YALNIZ zaman ilerleyince artar (fiyat/kur sabit)', () => {
  // injected now: let t = T0; opts.now = () => t
  // store.start() (mock fetch fixture'ları mevcut testlerdeki gibi) → mevduat aç
  const before = t.store.netWorth!.amount;
  t.advance(3_600_000);            // t += 1saat; vi.advanceTimersByTime(1000) → tick fire
  flushSync();
  expect(t.store.netWorth!.amount).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Koş, FAIL doğrula** (bugün eşit kalır).
- [ ] **Step 3: Minimal implementasyon** — `let nowMsTick = $state(now());` + `start()`'ta `tickTimer = setInterval(() => { nowMsTick = now(); }, 1000)` + `stop()`'ta temizle; `depositUsd`/`propertiesUsd` içindeki `now()` → `nowMsTick`.
- [ ] **Step 4: Tüm store testleri + check** yeşil.
- [ ] **Step 5: Commit** — `fix(store): mevduat/kira değerlemesi reaktif saate bağlandı (audit P1, TDD)`

---

### Task 6: netWorth kısmi toplam — eksik fiyat nakiti düşürmesin

**Risk/etki:** P1 eki. Bugün tek holding fiyatı eksikse catch fallback'i nakit + fiyatı BİLİNEN pozisyonları da toplamdan atıyor ([liveGameStore.svelte.ts:239-247]) → yanlış-düşük net servet. Ürün kararı (onaylı): görünen değer = bilinen bileşenlerin kısmi toplamı (alt sınır); kâr göstergeleri eksik veride `null` kalır (yanıltıcı % gösterilmez); snapshot guard'ı (`netWorthDataComplete`) aynen kalır.

**Files:**
- Modify: `src/lib/stores/gameState.ts` (yeni saf fonksiyon), `src/lib/stores/liveGameStore.svelte.ts:239-257`
- Test: `src/lib/stores/gameState.test.ts`, `src/lib/stores/liveGameStore.test.ts`

**Interfaces:**
- Produces (domain):
  ```ts
  export interface NetWorthParts { totalUsd: number; complete: boolean; }
  export function netWorthPartsUsd(state: GameState, oracle: UsdPriceOracle): NetWorthParts
  // nakit + fiyatlanabilen her holding; fiyatlanamayan atlanır ve complete=false
  ```
- Store: `netWorth` artık `Money` (null olmaz: `usd(parts.totalUsd + depositUsd + propertiesUsd)`); `netWorthDataComplete = parts.complete`; `profit`/`vsUsdHold` **complete değilse null** (mevcut "profitRate null" testi geçmeye devam eder). `netWorth: null` bekleyen store testleri yeni sözleşmeye güncellenir; component prop tipleri (`Money | null`) geniş kalabilir — dokunma.

- [ ] **Step 1: Başarısız domain testi** — 2 holding'li state, oracle biri için throw: `totalUsd` = nakit + fiyatlı holding; `complete === false`. Tüm fiyatlar varken `complete === true` ve değer `netWorthUsd` ile birebir aynı.
- [ ] **Step 2: FAIL doğrula → Step 3: domain implementasyonu → Step 4: PASS.**
- [ ] **Step 5: Store'u bağla** — try/catch fallback'i sil, `nwParts` derived'ına geç; store testini ekle: fiyatı eksik holding'de `netWorth` nakiti içerir, `profit === null`, `recordSnapshot` yazmaz.
- [ ] **Step 6: Tüm suite + check + build yeşil → Commit** — `fix(store): eksik fiyatta netWorth kısmi toplam, kâr göstergeleri null (audit P1, TDD)`

---

### Task 7: `createKeyedTtlCache` — sembol-set-başına TTL + inflight dedup

**Risk/etki:** P1 önkoşulu. Mevcut `createTtlCache` tek-key; parametreli istekler cache'siz upstream'e gidiyor.

**Files:**
- Modify: `src/lib/api/cachedFetch.ts` (mevcut `createTtlCache` DEĞİŞMEZ; onu key-başına saran yeni fonksiyon eklenir)
- Test: `src/lib/api/cachedFetch.test.ts` (yoksa oluştur; varsa genişlet)

**Interfaces:**
- Produces:
  ```ts
  export interface KeyedTtlCacheOptions<T> {
    ttlMs: number; fallback: T; maxKeys?: number; // varsayılan 64
    fetcher: (key: string) => Promise<T>; now?: () => number;
  }
  export function createKeyedTtlCache<T>(opts: KeyedTtlCacheOptions<T>): (key: string) => Promise<Cached<T>>
  ```
- İç tasarım: `Map<key, createTtlCache instance>`; her erişimde LRU tazeleme (delete + set); `size > maxKeys` → en eski key düşer. Stale/fallback/inflight semantiği key başına `createTtlCache`'ten miras.

- [ ] **Step 1: Başarısız testler** — (a) aynı key TTL içinde ikinci çağrı fetcher'ı ÇAĞIRMAZ; (b) farklı key ayrı fetch; (c) eşzamanlı aynı key tek uçuş paylaşır (çözülmemiş deferred promise ile: iki çağrı başlat, fetcher 1 kez çağrılmış olmalı); (d) `maxKeys=2` iken 3. key en eskiyi düşürür (eski key yeniden fetch gerektirir); (e) fetcher hatasında `stale:true` + fallback.
- [ ] **Step 2: FAIL → Step 3: implementasyon (~25 satır) → Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(api): createKeyedTtlCache — bounded keyed TTL + inflight dedup (audit P1, TDD)`

---

### Task 8: `/api/yahoo` + `/api/crypto` — TÜM istekler cache'ten geçsin

**Risk/etki:** P1. Bugün her oyuncunun her 20s poll'u parametreli → cache %100 bypass ([api/yahoo/+server.ts:21-31], [api/crypto/+server.ts:18-27]); `activeBist` her oyuncuda dolu başladığı için "5s cache zorunlu" kanonu fiilen ölü.

**Files:**
- Modify: `src/routes/api/yahoo/+server.ts`, `src/routes/api/crypto/+server.ts`
- Test: bu rotaların mevcut server testleri (genişlet)

**Interfaces:**
- Consumes: `createKeyedTtlCache` (Task 7), `parseSymbolList` (mevcut).
- Key üretimi (her iki rota): normalize = `parseSymbolList` çıktısı → dedupe → sort → `join(',')`; yahoo key = `${bistKey}|${usKey}`. Parametresiz istek default setin key'ine düşer (tek kod yolu):

```ts
const hasParams = url.searchParams.has('bist') || url.searchParams.has('us');
const bist = hasParams ? parseSymbolList(url.searchParams.get('bist')) : DEFAULT_BIST;
const us = parseSymbolList(url.searchParams.get('us'));
return json(await cache(cacheKey(bist, us)), { headers });
// fetcher: (key) => { const [b, u] = key.split('|'); return fetchFxValue(b ? b.split(',') : [], u ? u.split(',') : [], fetch); }
```

- [ ] **Step 1: Başarısız testler** — (a) `?bist=THYAO,EREGL` ile 2 istek TTL içinde → upstream fetch 1 kez; (b) `?bist=EREGL,THYAO` (sıra farklı) AYNI cache'e düşer; (c) parametresiz istek default-set key'ini kullanır ve ikinci çağrıda upstream'e gitmez; (d) crypto için `?coins=` aynı davranış.
- [ ] **Step 2: FAIL → Step 3: iki rotayı geçir (custom/default dallanması silinir, tek yol) → Step 4: PASS + tüm suite.**
- [ ] **Step 5: Commit** — `fix(api): parametreli piyasa istekleri keyed 5s cache'ten geçer (audit P1, TDD)`

---

### Task 9: Poll zincirleme — üst üste binen `pollFx` kalksın

**Risk/etki:** Küçük P1 eki. `setInterval(() => void pollFx(), pollMs)` ([liveGameStore.svelte.ts:513]) yavaş upstream'de çağrıları bindirir.

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts` (start/stop + timer)
- Test: `src/lib/stores/liveGameStore.test.ts`

- [ ] **Step 1: Başarısız test** — fake timers: fetch'i çözülmeyen promise yap; `pollMs`'in 2 katı zaman ilerlet → fetch çağrı sayısı hâlâ 1 (bindirme yok); fetch'i çöz → `pollMs` sonra ikinci çağrı gelir.
- [ ] **Step 2: FAIL → Step 3: implementasyon:**

```ts
function scheduleNextPoll(): void { pollTimer = setTimeout(() => void runPoll(), pollMs); }
async function runPoll(): Promise<void> { try { await pollFx(); } finally { if (started) scheduleNextPoll(); } }
// start(): await pollFx(); if (started) scheduleNextPoll();   stop(): clearTimeout + null
```

  (`pollTimer` tipi `ReturnType<typeof setTimeout>` olur; `addBist/addUs`'un tek seferlik `void pollFx()`'i kalır — nadir tek bindirme kabul, not düş.)
- [ ] **Step 4: PASS + mevcut poll testleri güncel → Step 5: Commit** — `fix(store): poll self-scheduling — bindirme yok (audit P1)`

---

### Task 10: Kapalı/stale piyasada işlem guard'ı (onaylı semantik: YASAK)

**Risk/etki:** P1. `marketOpen`/`dataStale` yalnız görsel; TradeForm kapalı BIST'i 15dk gecikmeli son fiyattan alıp satabiliyor — ligde arbitraj deliği. Kurucu kararı: kapalı piyasada işlem yasak; kripto 7/24; stale fiyatta (fxStale) kripto-dışı işlem yasak. Emir kuyruğu / son-kapanış modu KAPSAM DIŞI. Mevduat/emlak aksiyonları borsa dışı — guard'sız kalır. **Bağımlılık: Task 5'in `nowMsTick`'i (reaktif — seans açılınca buton kendiliğinden açılır).**

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts` (helper + buy/sell guard + interface), `src/lib/components/TradeForm.svelte`
- Test: `src/lib/stores/liveGameStore.test.ts`

**Interfaces:**
- Produces (store, hem guard hem UI'nın TEK kaynağı):
  ```ts
  tradeBlockReason(assetId: string): string | null
  // null = işlem serbest
  // 'PİYASA KAPALI — bu varlık yalnız seans saatlerinde işlem görür'
  // 'FİYAT VERİSİ ESKİ — bağlantı dönene dek işlem kapalı'
  ```
- İç mantık: kategori = `CATALOG[assetId]?.category ?? (activeUs.includes(assetId) ? 'us' : 'bist')` (rows'un mevcut kalıbı, [liveGameStore.svelte.ts:292-320]); `crypto` → hep null; değilse `isMarketOpen(cat, new Date(nowMsTick))` (mevcut `domain/calendar/calendar.ts:79`) ve `fxStale` kontrolü.
- `buy`/`sell` aksiyonları `apply()` içinde önce guard: `const blocked = tradeBlockReason(assetId); if (blocked) throw new Error(blocked);` → mevcut `lastError` kanalıyla TradeForm'daki HATA kutusunda görünür ([TradeForm.svelte:172-176]).
- TradeForm UI: `const blockReason = $derived(assetId ? store.tradeBlockReason(assetId) : null);` → AL/SAT `disabled={blockReason !== null}` + disabled görünüm (`opacity-40`, `term.*` token) + form altında `blockReason` metni (amber uyarı kutusu, HATA kutusu kalıbı).

- [ ] **Step 1: Başarısız store testleri** — injected now ile deterministik (İstanbul saati; calendar.ts'teki gerçek seans penceresini kullan):
  - Cumartesi (`2026-07-18T09:00:00Z`) `buy('THYAO', 1)` → holdings değişmez, `lastError` 'PİYASA KAPALI…'.
  - Aynı anda `buy('BTC', 1)` → başarılı (kripto 7/24).
  - Hafta içi seans saati `buy('THYAO', 1)` → başarılı.
  - `fxStale` iken (stale fixture) `buy('THYAO', 1)` → 'FİYAT VERİSİ ESKİ…'; `buy('BTC', 1)` → başarılı.
  - Hafta içi seans dışı (`2026-07-15T22:00:00Z` ≈ 01:00 TSİ) `sell('THYAO', 1)` → bloklu (SAT de yasak).
- [ ] **Step 2: FAIL → Step 3: store implementasyonu → Step 4: PASS.**
- [ ] **Step 5: TradeForm'u bağla** — disabled + uyarı; `npm run check` yeşil. E2E etkilenmez (tüm E2E işlemleri BTC — core-journey.spec.ts:23 yorumu bunu zaten garanti ediyor).
- [ ] **Step 6: Tam suite + Commit** — `feat(trade): kapalı/stale piyasada işlem yasağı — guard + UI tek sözleşme (audit P1, TDD)`

---

### Task 11: `toUSD` komisyon formülü düzeltmesi (latent bug)

**Risk/etki:** Küçük ama gerçek: `rate * (1 - commission)` paydayı küçültüyor → komisyon arttıkça kullanıcı FAZLA USD alıyor ([money.ts:53-57]). Bugün yalnız testlerde kullanılıyor; legacy mekanikler portlanınca aktive olurdu.

**Files:**
- Modify: `src/lib/domain/money.ts:53-57`
- Test: `src/lib/domain/money.test.ts`

- [ ] **Step 1: Başarısız test** — `toUSD(tryM(35_300), 35.30, 0.001)` → **999.00** (önce çevir: 1000, sonra komisyon düş); komisyon 0 → 1000 (mevcut test bozulmaz); monotonluk: komisyon 0.002 sonucu < 0.001 sonucu.
- [ ] **Step 2: FAIL → Step 3: fix:** `return { amount: round2((m.amount / rate) * (1 - commission)), currency: 'USD' };`
- [ ] **Step 4: PASS → Step 5: Commit** — `fix(money): toUSD komisyonu proceeds'ten düşer, kur paydasından değil (audit latent bug, TDD)`

---

### Task 12: `openDeposit` oran seam'i — finansal tek-kaynak ilk adım

**Risk/etki:** P1 SSOT'un Faz 0 dilimi. Balance sim domain `openDeposit`'i kullanıyor → %50 sabitini miras alıyor; senaryo verisi %42 diyor ([macro2025.ts:77]). Bu task yalnız SEAM açar — **davranış değişikliği SIFIR** (kalibrasyon ayrı iş: winnability bandını oynatır, VASİYET backlog'unda kalır, bkz. winnability.test.ts:98 notu).

**Files:**
- Modify: `src/lib/stores/gameState.ts:131-149` (imza), `src/lib/data/macro2025.ts:77` (yorum satırı)
- Test: `src/lib/stores/gameState.test.ts`

**Interfaces:**
- Produces: `openDeposit(state, usdTry, usdAmount, nowMs, annualRate: number = DEPOSIT_ANNUAL_RATE)` — tüm mevcut çağrılar (liveGameStore, balance sim) parametresiz kalır.

- [ ] **Step 1: Başarısız test** — `openDeposit(s, 40, 1000, 0, 0.42).deposit!.annualRate === 0.42`; parametresiz çağrı `DEPOSIT_ANNUAL_RATE` taşımaya devam eder (mevcut test).
- [ ] **Step 2: FAIL → Step 3: parametre ekle → Step 4: PASS.**
- [ ] **Step 5: macro2025.ts:77'ye açıklama** — `// SENARYO oranı (yalnız VASİYET); canlı mod domain DEPOSIT_ANNUAL_RATE (%50) kullanır. Kalibrasyonda runner'a enjekte edilecek (winnability backlog).`
- [ ] **Step 6: Commit** — `refactor(deposit): openDeposit annualRate seam'i — senaryo oranı enjekte edilebilir (audit P1 SSOT, davranış değişikliği yok)`

---

### Task 13: CLAUDE.md senkronu + final doğrulama

**Risk/etki:** CLAUDE.md her oturuma yüklenir; bayat kanon pahalı.

**Files:**
- Modify: `CLAUDE.md` (Performance Constraint + Test Disiplini satırları)

- [ ] **Step 1: İki satır güncelle** — "Yahoo Finance proxy: 5s server cache zorunlu." → "Yahoo/Binance proxy: keyed 5s server cache + inflight dedup (parametreli istekler dahil — `createKeyedTtlCache`)." ve E2E senaryo sayısı 12 → 13 (signout-persistence).
- [ ] **Step 2: Final doğrulama (verification-before-completion)** — `npm run test` + `npm run check` + `npm run build` + `npm run e2e` TÜMÜ yeşil (sabit test sayısı yazma).
- [ ] **Step 3: Preview smoke** — (a) mevduat aç → net servet 1dk içinde kendiliğinden artıyor (Task 5 kanıtı); (b) BIST kapalıyken AL/SAT disabled + amber uyarı, BTC serbest (Task 10); (c) çıkış → tekrar giriş → oyun geri geldi (Task 1-4).
- [ ] **Step 4: Commit + finishing-a-development-branch** — worktree → main merge kararı kurucuyla.

---

## Kapsam Dışı (bilinçli — Faz 1+/SP2'ye)

- README/anlatı drift temizliği, veri metodolojisi dili, funnel telemetri olayları → **Faz 1**.
- ABD hissesi grafik upstream/para birimi (`AAPL → AAPL.IS`) → ayrı dilim (bilinen sınırlama).
- Kazanma çizgisi/enflasyonlu hedef birleştirmesi → SP2 lig spec'i (bugün `grewDollars` UI'da kullanılmıyor, yalnız test).
- Mevduat oranı KALİBRASYONU (0.42 enjeksiyonu, winnability bandı) → VASİYET backlog.
- Emir kuyruğu / son-kapanış fiyatından işlem → SP2 kararına göre.
- Tam nonce'lu CSP (B5), rate-limit (B2) → kendi planları.
