# Cüzdan / Net Servet UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NET SERVET panelinde "Kalan nakit / Yatırımda (güncel değer)" dağılımını göster, ve cüzdandaki pozisyonlara tıklayınca o varlığı İŞLEM PANELİ'nde seçilebilir yap.

**Architecture:** İki bağımsız UX parçası. Parça 1: saf `investedUsd(netWorth, cash)` helper'ı `format.ts`'e (node'da test edilebilir) + `NetWorthMirror`'a ikinci 2 sütunlu satır. Parça 2: `WalletSummary` pozisyon satırlarını `<button>`'a çevir, opsiyonel `onSelect` prop'unu `+page`'in mevcut `handleSelectAsset`'ine bağla (PriceRow ile birebir aynı kalıp). Motor/store değişmez.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TypeScript (strict) + Tailwind (`term.*` token'ları) + Vitest (node env — Svelte render testi YOK, saf mantık `format.ts`'te test edilir).

Spec: [docs/superpowers/specs/2026-06-17-cuzdan-net-servet-ux-design.md](../specs/2026-06-17-cuzdan-net-servet-ux-design.md)

---

## File Structure

- `src/lib/components/format.ts` — **Modify**: `investedUsd(netWorthUsd, cashUsd)` saf helper'ı (net servet − nakit; netWorth null → null). `usd` importu eklenir.
- `src/lib/components/format.test.ts` — **Modify**: `investedUsd` testleri.
- `src/lib/components/NetWorthMirror.svelte` — **Modify**: `cashUsd: Money` prop'u + dağılım satırı (Kalan Nakit / Yatırımda).
- `src/lib/components/WalletSummary.svelte` — **Modify**: `onSelect?: (assetId) => void` prop'u + pozisyon satırları `<button>` + hover.
- `src/routes/+page.svelte` — **Modify**: `NetWorthMirror`'a `cashUsd`, `WalletSummary`'ye `onSelect` geçir.

---

## Task 1: investedUsd saf helper (format.ts)

**Files:**
- Modify: `src/lib/components/format.ts`
- Test: `src/lib/components/format.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/components/format.test.ts` dosyasının en sonuna ekle:

```ts
// ── investedUsd ─────────────────────────────────────────────────────────────────
describe('investedUsd', () => {
	it('net servet − nakit = yatırımdaki güncel değer', () => {
		expect(investedUsd(usd(1_008_634), usd(732_995))).toEqual(usd(275_639));
	});
	it('netWorth null → null (fiyat eksik)', () => {
		expect(investedUsd(null, usd(500_000))).toBeNull();
	});
	it('hiç yatırım yok → $0 (nakit = net servet)', () => {
		expect(investedUsd(usd(1_000_000), usd(1_000_000))).toEqual(usd(0));
	});
});
```

`format.test.ts` ilk satırındaki `./format` import listesine `investedUsd` ekle (mevcut: `..., shortDate, countdownLabel }`):

```ts
import { displayTry, displayUsd, pnlClass, signedPercent, marketBadge, signedUsd, dailyChangeBadge, relativeTime, positionPnl, maxUnitsAffordable, heldUnits, groupByCategory, CATEGORY_LABELS, shortDate, countdownLabel, investedUsd } from './format';
```

(`usd` zaten `import { usd, tryM } from '../domain/money';` ile mevcut.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/components/format.test.ts`
Expected: FAIL — `investedUsd is not a function` / TS hatası (export yok).

- [ ] **Step 3: Add the helper**

`src/lib/components/format.ts` — mevcut import:

```ts
import { tryM, formatMoney } from '../domain/money';
```

ile değiştir:

```ts
import { usd, tryM, formatMoney } from '../domain/money';
```

Sonra `displayUsd` fonksiyonundan hemen SONRA ekle:

```ts
/**
 * Net servetin yatırımda olan kısmı = net servet − kenardaki nakit.
 * (pozisyonlar + mevduatın GÜNCEL değeri toplamı; nakit + yatırım = net servet.)
 * netWorth null (fiyat eksik) → null ('—' gösterilir).
 */
export function investedUsd(netWorthUsd: Money | null, cashUsd: Money): Money | null {
	if (netWorthUsd === null) return null;
	return usd(netWorthUsd.amount - cashUsd.amount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/components/format.test.ts`
Expected: PASS (tüm format testleri).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/format.ts src/lib/components/format.test.ts
git commit -m "feat(ui): investedUsd saf helper — net servet dagilimi (yatirimda = netWorth - nakit)"
```

---

## Task 2: NET SERVET dağılım satırı (NetWorthMirror)

**Files:**
- Modify: `src/lib/components/NetWorthMirror.svelte`
- Modify: `src/routes/+page.svelte:247-251`

- [ ] **Step 1: Add cashUsd prop + derived labels**

`src/lib/components/NetWorthMirror.svelte` — mevcut script:

```svelte
	import type { Money } from '$lib/domain/money';
	import { displayUsd, pnlClass, signedPercent, signedUsd } from './format';

	interface Props {
		netWorthUsd: Money | null;
		profitRate: number | null;
		vsUsdHoldUsd: Money | null;
	}

	let { netWorthUsd, profitRate, vsUsdHoldUsd }: Props = $props();

	const netLabel = $derived(displayUsd(netWorthUsd));
	const pctLabel = $derived(signedPercent(profitRate));
	const vsLabel = $derived(signedUsd(vsUsdHoldUsd));
```

ile değiştir:

```svelte
	import type { Money } from '$lib/domain/money';
	import { displayUsd, pnlClass, signedPercent, signedUsd, investedUsd } from './format';

	interface Props {
		netWorthUsd: Money | null;
		profitRate: number | null;
		vsUsdHoldUsd: Money | null;
		cashUsd: Money;
	}

	let { netWorthUsd, profitRate, vsUsdHoldUsd, cashUsd }: Props = $props();

	const netLabel = $derived(displayUsd(netWorthUsd));
	const pctLabel = $derived(signedPercent(profitRate));
	const vsLabel = $derived(signedUsd(vsUsdHoldUsd));
	const cashLabel = $derived(displayUsd(cashUsd));
	const investedLabel = $derived(displayUsd(investedUsd(netWorthUsd, cashUsd)));
```

- [ ] **Step 2: Add the dağılım markup**

`NetWorthMirror.svelte` — mevcut "Getiri ve karşılaştırma" grid bloğunun KAPANIŞ `</div>`'inden (panelin son `</div>`'inden hemen önce) sonra, panel `</div>`'inden ÖNCE ekle. Yani mevcut:

```svelte
		<div class="text-center">
			<div class="text-[10px] text-term-text opacity-50 uppercase tracking-wider mb-0.5">
				USD Tutsaydın
			</div>
			<div class="text-sm font-bold {vsColor}">
				{vsLabel}
			</div>
		</div>
	</div>
</div>
```

ile değiştir:

```svelte
		<div class="text-center">
			<div class="text-[10px] text-term-text opacity-50 uppercase tracking-wider mb-0.5">
				USD Tutsaydın
			</div>
			<div class="text-sm font-bold {vsColor}">
				{vsLabel}
			</div>
		</div>
	</div>

	<!-- Dağılım: kenardaki nakit vs yatırımdaki güncel değer (toplamı = net servet) -->
	<div class="grid grid-cols-2 gap-2 pt-1 border-t border-term-border">
		<div class="text-center">
			<div class="text-[10px] text-term-text opacity-50 uppercase tracking-wider mb-0.5">
				Kalan Nakit
			</div>
			<div class="text-sm font-bold text-term-green">
				{cashLabel}
			</div>
		</div>
		<div class="text-center">
			<div class="text-[10px] text-term-text opacity-50 uppercase tracking-wider mb-0.5">
				Yatırımda
			</div>
			<div class="text-sm font-bold text-term-blue">
				{investedLabel}
			</div>
		</div>
	</div>
</div>
```

- [ ] **Step 3: Pass cashUsd from +page.svelte**

`src/routes/+page.svelte` — mevcut:

```svelte
							<NetWorthMirror
								netWorthUsd={store.netWorthUsd}
								profitRate={store.profitRate}
								vsUsdHoldUsd={store.vsUsdHoldUsd}
							/>
```

ile değiştir:

```svelte
							<NetWorthMirror
								netWorthUsd={store.netWorthUsd}
								profitRate={store.profitRate}
								vsUsdHoldUsd={store.vsUsdHoldUsd}
								cashUsd={store.game.usdBalance}
							/>
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/NetWorthMirror.svelte src/routes/+page.svelte
git commit -m "feat(ui): NET SERVET dagilim satiri — Kalan Nakit / Yatirimda (guncel deger)"
```

---

## Task 3: Cüzdanda tıkla-işlem (WalletSummary)

**Files:**
- Modify: `src/lib/components/WalletSummary.svelte`
- Modify: `src/routes/+page.svelte:253-258`

- [ ] **Step 1: Add onSelect prop**

`src/lib/components/WalletSummary.svelte` — mevcut Props (Task: günlük mühürlü kur sonrası hali):

```svelte
	interface Props {
		game: GameState;
		usdTry: number;
		liveUsdTry?: number;
		positions: PositionRow[];
	}

	let { game, usdTry, liveUsdTry, positions }: Props = $props();
```

ile değiştir:

```svelte
	interface Props {
		game: GameState;
		usdTry: number;
		liveUsdTry?: number;
		positions: PositionRow[];
		onSelect?: (assetId: string) => void;
	}

	let { game, usdTry, liveUsdTry, positions, onSelect }: Props = $props();
```

- [ ] **Step 2: Convert position row to a clickable button**

`WalletSummary.svelte` — mevcut pozisyon satırı (`{#each ...}` içindeki dış `<div>`):

```svelte
				{#each positions as p (p.assetId)}
					{@const pnl = positionPnl(p.units, p.avgCostUsd, p.valueUsd)}
					{@const pctBadge = dailyChangeBadge(pnl.pnlPct)}
					<div class="flex justify-between items-start gap-2 border-b border-term-border border-opacity-30 pb-1 last:border-0 last:pb-0">
						<div class="flex flex-col">
							<span class="text-term-text font-bold">{p.assetId}</span>
							<span class="text-term-text opacity-50 text-[10px]">
								{p.units.toFixed(4)} adet
							</span>
						</div>
						<div class="text-right">
							<div class="text-term-text">{displayUsd(p.valueUsd === undefined ? null : usd(p.valueUsd))}</div>
							<div class="text-[10px] flex items-center justify-end gap-1.5">
								<span class={pnlClass(pnl.pnl ?? null)}>{signedUsd(pnl.pnl === undefined ? null : usd(pnl.pnl))}</span>
								{#if pctBadge}<span class={pctBadge.cls}>({pctBadge.text})</span>{/if}
							</div>
						</div>
					</div>
				{/each}
```

ile değiştir (dış `<div>` → `<button>`; PriceRow ile aynı hover kalıbı):

```svelte
				{#each positions as p (p.assetId)}
					{@const pnl = positionPnl(p.units, p.avgCostUsd, p.valueUsd)}
					{@const pctBadge = dailyChangeBadge(pnl.pnlPct)}
					<button
						type="button"
						onclick={() => onSelect?.(p.assetId)}
						class="w-full text-left flex justify-between items-start gap-2 border-b border-term-border border-opacity-30 pb-1 last:border-0 last:pb-0
						       hover:bg-term-panelLight hover:border-term-borderGlow focus:outline-none focus:bg-term-panelLight
						       transition-colors duration-75 cursor-pointer"
					>
						<div class="flex flex-col">
							<span class="text-term-text font-bold">{p.assetId}</span>
							<span class="text-term-text opacity-50 text-[10px]">
								{p.units.toFixed(4)} adet
							</span>
						</div>
						<div class="text-right">
							<div class="text-term-text">{displayUsd(p.valueUsd === undefined ? null : usd(p.valueUsd))}</div>
							<div class="text-[10px] flex items-center justify-end gap-1.5">
								<span class={pnlClass(pnl.pnl ?? null)}>{signedUsd(pnl.pnl === undefined ? null : usd(pnl.pnl))}</span>
								{#if pctBadge}<span class={pctBadge.cls}>({pctBadge.text})</span>{/if}
							</div>
						</div>
					</button>
				{/each}
```

- [ ] **Step 3: Wire onSelect from +page.svelte**

`src/routes/+page.svelte` — mevcut (Task 2'den sonra `cashUsd` zaten yoksa bu blok ayrı):

```svelte
							<WalletSummary
								game={store.game}
								usdTry={store.usdTry}
								liveUsdTry={store.liveUsdTry}
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
								onSelect={handleSelectAsset}
							/>
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

> **Not (Parça 2 test):** Test ortamı `node` (jsdom/testing-library yok) → Svelte tık simülasyonu için render harness yok; bu saf wiring `npm run check` + build + manuel ile doğrulanır (proje kalıbına uygun; YAGNI). `onSelect` opsiyonel → verilmeyen yerlerde tık no-op, çökmez.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/WalletSummary.svelte src/routes/+page.svelte
git commit -m "feat(ui): cuzdan pozisyonlari tiklanabilir — secip ISLEM PANELI'ne yonlendir"
```

---

## Task 4: Tam doğrulama + manuel smoke

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS (341 → +3 = 344 civarı).

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Build (compile)**

Run: `npm run build`
Expected: `✓ built` (compile temiz); Windows adapter-vercel symlink EPERM bilinen+kabul.

- [ ] **Step 4: Manuel smoke (kurucu)**

`npm run dev` →
- NET SERVET panelinde "KALAN NAKİT" + "YATIRIMDA" satırı; toplamları net servete eşit; bir varlık alınca nakit ↓ / yatırımda ↑.
- CÜZDAN'da pozisyon satırına fare → yeşil çerçeve + el imleci; tıkla → İŞLEM PANELİ o varlık seçili (mobilde panele kayar).

- [ ] **Step 5: Merge note**

main hareketsizse doğrudan main'de devam (mevcut akış). Aksi halde `finishing-a-development-branch`.

---

## Self-Review

**1. Spec coverage:**
- "Yatırımda = güncel değer, netWorth − nakit" → Task 1 `investedUsd` + Task 2 derived ✓
- Dağılım NET SERVET panelinde (NetWorthMirror), Getiri/Tutsaydın altında 2 sütun → Task 2 markup ✓
- Mobil NetWorthMini sade kalır → bu plan NetWorthMini'ye DOKUNMUYOR ✓
- netWorth null → Yatırımda "—", nakit her zaman → `investedUsd` null + `displayUsd` "—" (Task 1 test) ✓
- Tıkla-işlem = varlığı İŞLEM PANELİ'nde seç (PriceList akışı) → Task 3 `onSelect` + `handleSelectAsset` ✓
- `<div>`→`<button>` (a11y) + hover ipucu (PriceRow kalıbı) → Task 3 Step 2 ✓
- `onSelect` opsiyonel, verilmezse no-op → Task 3 (`onSelect?.()`) ✓
- Yerinde AL/SAT yok, maliyet-dağılım yok, alt-kırılım yok → planda yok (YAGNI) ✓

**2. Placeholder scan:** Yok — her step'te tam kod/komut.

**3. Type consistency:** `investedUsd(netWorthUsd: Money | null, cashUsd: Money): Money | null` Task 1'de tanımlı; Task 2'de aynı imzayla `investedUsd(netWorthUsd, cashUsd)` çağrılıyor. `cashUsd: Money` prop'u `store.game.usdBalance` (Money) ile besleniyor. `onSelect?: (assetId: string) => void` Task 3'te tanımlı, `handleSelectAsset(id: string)` ile uyumlu. Hover class'ları PriceRow ile birebir (`hover:bg-term-panelLight hover:border-term-borderGlow ... cursor-pointer`).
