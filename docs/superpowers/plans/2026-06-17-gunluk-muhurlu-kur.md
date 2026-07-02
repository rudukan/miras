# Günlük Mühürlü Kur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oyunun operatif USD/TRY kurunu günde bir mühürle ("günün kuru") → mevduatla büyük TL pozisyonu varken canlı kur tiki net serveti zıplatmasın, saniyelik faiz görünür olsun.

**Architecture:** Tek seam — store içinde `effectiveUsdTry()` (canlı) yanına `sealedUsdTry()` (operatif) eklenir. Operatif tüketiciler (oracle, kripto TRY çevrimi, mevduat aç/boz, mevduat değerleme, `store.usdTry`) sealed kuru kullanır; canlı kur yalnız tohum + gösterime düşer. Mühür İstanbul gün-anahtarı değişince `pollFx` içinde yeniden kurulur, `SaveEnvelopeV1.sealedFx`'e persist edilir. Motor (reducer'lar, `UsdPriceOracle` arayüzü) DEĞİŞMEZ.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TypeScript (strict) + Vitest. İlgili dosyalar: `src/lib/stores/savegame.ts`, `src/lib/stores/liveGameStore.svelte.ts`, `src/lib/components/WalletSummary.svelte`, `src/routes/+page.svelte`.

Spec: [docs/superpowers/specs/2026-06-14-gunluk-muhurlu-kur-design.md](../specs/2026-06-14-gunluk-muhurlu-kur-design.md)

---

## File Structure

- `src/lib/stores/savegame.ts` — **Modify**: `SealedFx` tipi + `SaveEnvelopeV1.sealedFx?` opsiyonel alanı. Revive passthrough (sealedFx primitiftir, dönüşüm gerekmez).
- `src/lib/stores/savegame.test.ts` — **Modify**: sealedFx round-trip + eski kayıt (sealedFx yok → undefined) testleri.
- `src/lib/stores/liveGameStore.svelte.ts` — **Modify**: `sealedFx` state + `sealedUsdTry()` + `ensureSeal()` + operatif tüketicileri sealed'a çevir + `liveUsdTry` getter + persist'e sealedFx ekle.
- `src/lib/stores/liveGameStore.test.ts` — **Modify**: mühür kurulumu/jitter-yok, gün-içi sabit, gün-değişince reseal, persist+restore testleri.
- `src/lib/components/WalletSummary.svelte` — **Modify**: parite satırı "günün kuru" + opsiyonel "piyasa (canlı)" ikincil satırı.
- `src/routes/+page.svelte` — **Modify**: `WalletSummary`'ye `liveUsdTry={store.liveUsdTry}` geçir.

---

## Task 1: savegame — sealedFx tipi + persistence

**Files:**
- Modify: `src/lib/stores/savegame.ts:9-13` (SaveEnvelopeV1)
- Test: `src/lib/stores/savegame.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/stores/savegame.test.ts` içinde, `describe('mevduat persistence', ...)` bloğundan SONRA, `describe('getOrCreatePlayerId', ...)` bloğundan ÖNCE şu bloğu ekle:

```ts
  describe('sealedFx persistence', () => {
    it('round-trip: sealedFx save → load korunur', () => {
      const storage = makeStorage();
      const game = createGameState('canli', 1, 'p1', 1000);
      const envelope: SaveEnvelopeV1 = {
        v: 1,
        game,
        activeBist: [],
        sealedFx: { dateKey: '2026-06-17', rate: 41.25 },
      };

      saveGame(storage, envelope);

      expect(loadGame(storage)?.sealedFx).toEqual({ dateKey: '2026-06-17', rate: 41.25 });
    });

    it('sealedFx olmayan eski kayıt → sealedFx undefined', () => {
      const storage = makeStorage();
      const game = createGameState('canli', 1, 'p1', 1000);

      saveGame(storage, { v: 1, game, activeBist: [] });

      expect(loadGame(storage)?.sealedFx).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/stores/savegame.test.ts`
Expected: FAIL — TS hatası `sealedFx` `SaveEnvelopeV1`'de yok (ya da round-trip undefined döner).

- [ ] **Step 3: Add the type**

`src/lib/stores/savegame.ts` — mevcut:

```ts
export interface SaveEnvelopeV1 {
  v: 1;
  game: GameState;
  activeBist: string[];
}
```

ile değiştir:

```ts
/** Günlük mühürlü operatif kur — İstanbul gün-anahtarı + o gün için yakalanan USD/TRY. */
export interface SealedFx {
  dateKey: string; // 'YYYY-MM-DD' (Europe/Istanbul)
  rate: number;    // o günün operatif USD/TRY kuru
}

export interface SaveEnvelopeV1 {
  v: 1;
  game: GameState;
  activeBist: string[];
  /** Opsiyonel — eski kayıtlarda yok (undefined → store ilk poll'da mühürler). */
  sealedFx?: SealedFx;
}
```

> **Not:** `reviveEnvelope` `{ ...raw, game: {...} }` döndürdüğü için `sealedFx` (saf string+number) otomatik korunur — revive'da ek dönüşüm GEREKMEZ. `loadGame` doğrulaması (`v !== 1 || !game || !Array.isArray(activeBist)`) sealedFx'ten bağımsızdır, değiştirme.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/stores/savegame.test.ts`
Expected: PASS (tüm savegame testleri).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/savegame.ts src/lib/stores/savegame.test.ts
git commit -m "feat(fx): SaveEnvelopeV1.sealedFx — gunluk muhurlu kur persistence tipi"
```

---

## Task 2: liveGameStore — sealed state, sealedUsdTry, ensureSeal, operatif tüketiciler

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Test: `src/lib/stores/liveGameStore.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/stores/liveGameStore.test.ts` dosyasının en sonundaki `describe('createLiveGameStore (USD-taban)', ...)` bloğunun KAPANIŞ `});`'inden hemen önce şu testleri ekle. (Üstte `SaveEnvelopeV1` importu gerekiyorsa ekle: `import type { SaveEnvelopeV1 } from './savegame';`)

```ts
  describe('günlük mühürlü kur', () => {
    it('canlı USD/TRY tiki net serveti oynatmaz (mevduat sealed kurla değerlenir)', async () => {
      const t = setup(); // yahoo usdTry 40
      await t.store.start(); // ilk poll → mühür { 2026-06-01, 40 }
      flushSync();
      expect(t.store.usdTry).toBe(40); // operatif = sealed
      expect(t.store.netWorthUsd?.amount).toBeCloseTo(1_000_000, 0);

      t.store.openDeposit(500_000); // $500k → sealed 40 ile ₺20M mevduat
      flushSync();
      expect(t.store.lastError).toBeNull();
      const before = t.store.netWorthUsd!.amount;
      expect(before).toBeCloseTo(1_000_000, 0);

      // Canlı kur fırlar (WS): operatif kur mühürlü kaldığı için net servet OYNAMAZ.
      t.feed.onStatus?.('live');
      t.feed.onFxRate?.('USDTTRY', 50);
      flushSync();
      expect(t.store.liveUsdTry).toBe(50); // canlı gösterim güncel
      expect(t.store.usdTry).toBe(40); // operatif hâlâ mühürlü
      expect(t.store.netWorthUsd?.amount).toBeCloseTo(before, 0); // jitter yok
    });

    it('gün içi ikinci poll mührü değiştirmez', async () => {
      vi.useFakeTimers();
      const t = setup(); // pollMs 5000
      await t.store.start();
      expect(t.store.usdTry).toBe(40);

      // Aynı gün, Yahoo kuru değişse bile mühür sabit kalır.
      t.setYahoo({
        value: { usdTry: 55, prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 } },
        asOf: 222,
        stale: false,
      });
      await vi.advanceTimersByTimeAsync(5000);
      flushSync();

      expect(t.store.usdTry).toBe(40); // mühür değişmedi
      expect(t.store.liveUsdTry).toBe(55); // canlı (Yahoo) güncel (feedStatus stale → effective=fxCache)
    });

    it('gün-anahtarı değişince reseal eder', async () => {
      vi.useFakeTimers();
      let clock = new Date('2026-06-01T12:00:00+03:00').getTime();
      const t = setup({ now: () => clock });
      await t.store.start();
      expect(t.store.usdTry).toBe(40);

      t.setYahoo({
        value: { usdTry: 45, prices: { THYAO: 300, ASELS: 200, XAUGRAM: 5000, EUR: 45 } },
        asOf: 222,
        stale: false,
      });
      clock = new Date('2026-06-02T12:00:00+03:00').getTime(); // ertesi gün
      await vi.advanceTimersByTimeAsync(5000);
      flushSync();

      expect(t.store.usdTry).toBe(45); // yeni günün kuru mühürlendi
    });

    it('mühür persist edilir ve initial.sealedFx restore edilir', async () => {
      const saved: SaveEnvelopeV1[] = [];
      const t = setup({ onPersist: (e: SaveEnvelopeV1) => saved.push(e) });
      await t.store.start();
      flushSync();
      const last = saved[saved.length - 1];
      expect(last.sealedFx).toEqual({ dateKey: '2026-06-01', rate: 40 });

      // Restore: kayıttaki mühürle yeni store → start() öncesi bile operatif kur restore edilendir.
      const t2 = setup({
        initial: { v: 1, game: last.game, activeBist: last.activeBist, sealedFx: { dateKey: '2026-06-01', rate: 38 } },
      });
      expect(t2.store.usdTry).toBe(38);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/stores/liveGameStore.test.ts`
Expected: FAIL — `store.liveUsdTry` undefined / `usdTry` canlı tikle değişiyor / `sealedFx` persist edilmiyor.

- [ ] **Step 3: Add SealedFx import**

`src/lib/stores/liveGameStore.svelte.ts:27` — mevcut:

```ts
import type { SaveEnvelopeV1 } from './savegame';
```

ile değiştir:

```ts
import type { SaveEnvelopeV1, SealedFx } from './savegame';
```

- [ ] **Step 4: Add sealedFx state**

`src/lib/stores/liveGameStore.svelte.ts` — `history` state tanımından (`let history = $state<DailySnapshot[]>(opts.initialHistory ?? []);`) hemen SONRA ekle:

```ts
  // Günlük mühürlü operatif kur: İstanbul gün-anahtarı değişince bir kez yakalanır.
  // Net servet/işlem bunu kullanır → gün-içi canlı kur gürültüsü net serveti oynatmaz.
  let sealedFx = $state<SealedFx | null>(initial?.sealedFx ?? null);
```

- [ ] **Step 5: Add sealedUsdTry helper**

`effectiveUsdTry` tanımından (`feedStatus === 'live' && liveUsdTry !== undefined ? liveUsdTry : fxCache.usdTry;`) hemen SONRA ekle:

```ts
  // Operatif kur (işlem + değerleme) — mühür yoksa (ilk poll öncesi kısa pencere) canlı kura düşülür.
  const sealedUsdTry = (): number => sealedFx?.rate ?? effectiveUsdTry();
```

- [ ] **Step 6: Switch operatif consumers to sealedUsdTry**

`source.assetTry` kripto kolu — mevcut:

```ts
      if (CRYPTO_SET.has(id)) {
        const u = cryptoUsd[id];
        return u === undefined ? undefined : u * effectiveUsdTry();
      }
```

ile değiştir:

```ts
      if (CRYPTO_SET.has(id)) {
        const u = cryptoUsd[id];
        return u === undefined ? undefined : u * sealedUsdTry();
      }
```

`oracle.assetUsd` — mevcut:

```ts
      const t = fxCache.prices[id];
      if (t === undefined) throw new Error(`No live price: ${id}`);
      return usd(t / effectiveUsdTry());
```

ile değiştir:

```ts
      const t = fxCache.prices[id];
      if (t === undefined) throw new Error(`No live price: ${id}`);
      return usd(t / sealedUsdTry());
```

`depositUsd` derived — mevcut:

```ts
  const depositUsd = $derived(
    game.deposit === null ? 0 : currentValueTry(game.deposit, now()).amount / effectiveUsdTry(),
  );
```

ile değiştir:

```ts
  const depositUsd = $derived(
    game.deposit === null ? 0 : currentValueTry(game.deposit, now()).amount / sealedUsdTry(),
  );
```

`openDepositAction` / `breakDepositAction` — mevcut:

```ts
  const openDepositAction = (usdAmount: number) =>
    apply(() => openDeposit(game, effectiveUsdTry(), usdAmount, now()));
  const breakDepositAction = () => apply(() => breakDeposit(game, effectiveUsdTry(), now()));
```

ile değiştir:

```ts
  const openDepositAction = (usdAmount: number) =>
    apply(() => openDeposit(game, sealedUsdTry(), usdAmount, now()));
  const breakDepositAction = () => apply(() => breakDeposit(game, sealedUsdTry(), now()));
```

- [ ] **Step 7: Persist sealedFx**

`persist` fonksiyonu — mevcut:

```ts
  function persist(): void {
    opts.onPersist?.({ v: 1, game, activeBist });
  }
```

ile değiştir:

```ts
  function persist(): void {
    opts.onPersist?.({ v: 1, game, activeBist, sealedFx: sealedFx ?? undefined });
  }
```

- [ ] **Step 8: Add ensureSeal + call it in pollFx**

`recordSnapshot` fonksiyon tanımından (`function recordSnapshot(): void {`) hemen ÖNCE ekle:

```ts
  // Gün-anahtarı (İstanbul) değişince operatif kuru yeniden mühürle — yalnız GÜVENİLİR kurla
  // (canlı WS veya taze Yahoo). Stale fallback (₺40 zemini) mühürlenmez → tüm gün sahte kalmaz.
  function ensureSeal(): void {
    const haveRealFx = (feedStatus === 'live' && liveUsdTry !== undefined) || !fxStale;
    if (!haveRealFx) return;
    const key = istanbulParts(new Date(now())).key;
    if (sealedFx === null || sealedFx.dateKey !== key) {
      sealedFx = { dateKey: key, rate: effectiveUsdTry() };
      persist();
    }
  }
```

`pollFx` fonksiyonunun en sonundaki `recordSnapshot();` çağrısı — mevcut:

```ts
    recordSnapshot();
  }
```

ile değiştir:

```ts
    ensureSeal();
    recordSnapshot();
  }
```

> **Not:** `ensureSeal()` `recordSnapshot()`'tan ÖNCE çağrılmalı — snapshot'taki net servet/allocation sealed kuru kullanır, mühür önce kurulmalı.

- [ ] **Step 9: Add liveUsdTry to interface + getters, switch usdTry getter**

`LiveGameStore` arayüzünde `readonly usdTry: number;` satırından SONRA ekle:

```ts
  readonly liveUsdTry: number;
```

Return objesindeki `usdTry` getter — mevcut:

```ts
    get usdTry() {
      return effectiveUsdTry();
    },
```

ile değiştir:

```ts
    get usdTry() {
      return sealedUsdTry();
    },
    get liveUsdTry() {
      return effectiveUsdTry();
    },
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm run test -- src/lib/stores/liveGameStore.test.ts`
Expected: PASS (yeni 4 test + mevcut tüm testler).

- [ ] **Step 11: Commit**

```bash
git add src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "feat(fx): gunluk muhurlu operatif kur — sealedUsdTry + ensureSeal + persist"
```

---

## Task 3: WalletSummary — "günün kuru" + canlı piyasa ipucu

**Files:**
- Modify: `src/lib/components/WalletSummary.svelte`
- Modify: `src/routes/+page.svelte:253-257`

- [ ] **Step 1: Update WalletSummary props + derived**

`src/lib/components/WalletSummary.svelte` — mevcut script:

```svelte
	interface Props {
		game: GameState;
		usdTry: number;
		positions: PositionRow[];
	}

	let { game, usdTry, positions }: Props = $props();

	const usdRate = $derived(usdTry.toFixed(2));
```

ile değiştir:

```svelte
	interface Props {
		game: GameState;
		usdTry: number;
		liveUsdTry?: number;
		positions: PositionRow[];
	}

	let { game, usdTry, liveUsdTry, positions }: Props = $props();

	const usdRate = $derived(usdTry.toFixed(2));
	const liveRate = $derived(liveUsdTry === undefined ? null : liveUsdTry.toFixed(2));
	// Canlı piyasa ipucu yalnız mühürden farklıysa gösterilir (gürültü yok).
	const showLive = $derived(liveRate !== null && liveRate !== usdRate);
```

- [ ] **Step 2: Update parite markup**

Mevcut parite satırı:

```svelte
		<div class="flex justify-between items-center pt-0.5">
			<span class="text-term-text opacity-50 text-[10px]">USD/TRY (parite)</span>
			<span class="text-term-blue text-[10px]">₺{usdRate}</span>
		</div>
```

ile değiştir:

```svelte
		<div class="flex justify-between items-center pt-0.5">
			<span class="text-term-text opacity-50 text-[10px]">USD/TRY (günün kuru)</span>
			<span class="text-term-blue text-[10px]">₺{usdRate}</span>
		</div>
		{#if showLive}
			<div class="flex justify-between items-center">
				<span class="text-term-text opacity-40 text-[10px]">piyasa (canlı)</span>
				<span class="text-term-text opacity-50 text-[10px]">₺{liveRate}</span>
			</div>
		{/if}
```

- [ ] **Step 3: Pass liveUsdTry from +page.svelte**

`src/routes/+page.svelte` — mevcut:

```svelte
						<WalletSummary
							game={store.game}
							usdTry={store.usdTry}
							positions={store.positions}
						/>
```

ile değiştir:

```svelte
						<WalletSummary
							game={store.game}
							usdTry={store.usdTry}
							liveUsdTry={store.liveUsdTry}
							positions={store.positions}
						/>
```

- [ ] **Step 4: Verify build + typecheck (görsel smoke = build geçer)**

Run: `npm run build`
Expected: Hatasız build (Windows'ta adapter-vercel symlink EPERM bilinen+kabul; o satıra kadar svelte-check/compile temiz olmalı).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/WalletSummary.svelte src/routes/+page.svelte
git commit -m "feat(ui): cuzdan parite satiri 'gunun kuru' + canli piyasa ipucu"
```

---

## Task 4: Tam doğrulama + merge

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS (test sayısı 335 → +6 = 341 civarı). `verification-before-completion` skill'ine göre çıktıyı gözle doğrula.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: adapter-vercel öncesi temiz; Windows symlink EPERM kabul.

- [ ] **Step 3: Manuel smoke (opsiyonel, kurucu)**

`npm run dev` → mevduat aç → cüzdanda "USD/TRY (günün kuru)" sabit, net servet saniyelik faizle yumuşak artıyor, kur tikiyle zıplamıyor. "piyasa (canlı)" ikincil satırı kur kıpırdayınca beliriyor.

- [ ] **Step 4: Merge note**

main hareketsizse doğrudan main üzerinde devam edilebilir (mevcut akış). Aksi halde `finishing-a-development-branch` skill'iyle entegre et.

---

## Self-Review

**1. Spec coverage:**
- Kapsam "her şey" (işlem + değerleme aynı sealed kur) → Task 2 Step 6 (oracle, kripto assetTry, deposit aç/boz, depositUsd) ✓
- Canlı kur = bilgi/gösterim + tohum → `liveUsdTry` getter (Task 2 Step 9) + WalletSummary "piyasa" satırı (Task 3) ✓
- Mühür anı = gün başı, reseal = gün-anahtarı değişince → `ensureSeal` (Task 2 Step 8) ✓
- Persistence `SaveEnvelopeV1.sealedFx?` eski-kayıt uyumlu → Task 1 ✓
- İlk açılış mühür yoksa ilk canlı kurla → `sealedUsdTry` fallback + ilk `ensureSeal` (Task 2 Step 5, 8) ✓
- "Canlı" hissi: kripto/BIST/altın native canlı tikler → `oracle.assetUsd` kripto kolu `usd(u)` değişmedi; native TRY fiyatları (fxCache) canlı kalır ✓
- `store.usdTry` getter → sealed; motor değişmez (reducer'lara geçen kur store'dan gelir) ✓
- Test stratejisi (ilk poll mühür, gün-içi sabit, reseal, persist, eski-kayıt) → Task 1+2 testleri ✓

**2. Placeholder scan:** Yok — her step'te tam kod/komut var.

**3. Type consistency:** `SealedFx { dateKey: string; rate: number }` Task 1'de tanımlı; Task 2'de import + state + `ensureSeal` + persist hep aynı şekil kullanıyor. `sealedUsdTry()` / `effectiveUsdTry()` / `liveUsdTry` getter adları tutarlı. `persist` `sealedFx ?? undefined` (strict, exactOptional değil → undefined ataması OK).

**Kapsam dışı (YAGNI, spec ile uyumlu):** manuel kur kilidi, geçmiş kur grafiği, gün-içi reseal, native fiyat mühürleme.
