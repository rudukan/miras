# Evren Genişletme — Hızlı Paket + Piyasa Listesi Düzeni Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlı kataloğa 5 yeni varlık (SOL/XRP/DOGE/AVAX + Gram Gümüş) ekle ve piyasa listesini hibrit sekme+grup düzeniyle topla.

**Architecture:** Değişiklik yalnız katalog + UI katmanında. Motor (`gameState.ts`), oracle (`usdOracle.ts`) ve Binance WS koduna DOKUNULMAZ — store zaten katalog türevlerini (`CRYPTO_SYMBOLS`, `CORE_ASSETS`) tükettiği için yeni varlıklar kendiliğinden akar. UI: `PriceList.svelte` kabuk olur (arama + sekme + orkestrasyon), satır `PriceRow.svelte`'e çıkar, gruplama saf `groupByCategory` helper'ında (testlenebilir).

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TypeScript strict + Tailwind (`term.*` token) + Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-evren-genisletme-hizli-paket-design.md`

---

## Dosya Haritası

| Dosya | İş |
|-------|-----|
| `src/lib/catalog/liveAssets.ts` | Modify — 5 yeni varlık satırı |
| `src/lib/catalog/liveAssets.test.ts` | Modify — beklentiler 11 varlığa güncellenir |
| `src/lib/components/format.ts` | Modify — `groupByCategory` + `CATEGORY_LABELS` eklenir |
| `src/lib/components/format.test.ts` | Modify — yeni describe bloğu |
| `src/lib/components/PriceRow.svelte` | **Create** — tek varlık satırı |
| `src/lib/components/PriceList.svelte` | Modify — kabuk: sekme + grup + arama-ezer |

`+page.svelte` DEĞİŞMEZ (PriceList props arayüzü aynı kalır: `prices`, `onSelect`, `onAddBist`).

---

### Task 0: Dal aç + Binance parite smoke

- [ ] **Step 0.1: Feature dalı aç**

```bash
git checkout -b feat/evren-hizli-paket
```

- [ ] **Step 0.2: 4 yeni USDT paritesinin Binance spot'ta döndüğünü doğrula**

```bash
curl -s "https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT" | head -c 200
curl -s "https://api.binance.com/api/v3/ticker/24hr?symbol=XRPUSDT" | head -c 200
curl -s "https://api.binance.com/api/v3/ticker/24hr?symbol=DOGEUSDT" | head -c 200
curl -s "https://api.binance.com/api/v3/ticker/24hr?symbol=AVAXUSDT" | head -c 200
```

Expected: her biri `"symbol":"SOLUSDT","priceChange":...` içeren JSON döner (HTTP 200, `lastPrice` dolu).
Eğer biri `{"code":-1121,...}` (geçersiz sembol) dönerse DUR — spec'e dön, o coin'i değiştir/çıkar.

> Not: `fetchCryptoValue` atomik (`Promise.all`) — tek geçersiz sembol TÜM kripto snapshot'ını düşürür. Bu smoke o yüzden ilk adım.

---

### Task 1: Katalog — 5 yeni varlık (TDD)

**Files:**
- Modify: `src/lib/catalog/liveAssets.ts`
- Test: `src/lib/catalog/liveAssets.test.ts`

- [ ] **Step 1.1: Testleri 11 varlığa güncelle (failing)**

`src/lib/catalog/liveAssets.test.ts` dosyasının TÜM içeriğini şununla değiştir:

```typescript
import { describe, it, expect } from 'vitest';
import { LIVE_ASSETS, CATALOG, CRYPTO_SYMBOLS, BIST_SYMBOLS, CRYPTO_SET, CORE_ASSETS } from './liveAssets';

describe('liveAssets katalog', () => {
  it('11 varlık ve 4 kategori temsil edilir', () => {
    expect(LIVE_ASSETS).toHaveLength(11);
    const cats = new Set(LIVE_ASSETS.map((a) => a.category));
    expect(cats).toEqual(new Set(['crypto', 'bist', 'commodity', 'fx']));
  });

  it('CATALOG her id için meta döndürür', () => {
    expect(CATALOG.BTC).toEqual({ id: 'BTC', label: 'Bitcoin', category: 'crypto', source: 'crypto' });
    expect(CATALOG.SOL).toEqual({ id: 'SOL', label: 'Solana', category: 'crypto', source: 'crypto' });
    expect(CATALOG.XAGGRAM).toEqual({ id: 'XAGGRAM', label: 'Gram Gümüş', category: 'commodity', source: 'yahoo' });
    expect(CATALOG.THYAO.source).toBe('yahoo');
    expect(CATALOG.NOPE).toBeUndefined();
  });

  it('CRYPTO_SYMBOLS yalnızca source=crypto', () => {
    expect(CRYPTO_SYMBOLS).toEqual(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX']);
  });

  it('BIST_SYMBOLS yalnızca category=bist (altın/gümüş/euro hariç — proxy ekler)', () => {
    expect(BIST_SYMBOLS).toEqual(['THYAO', 'ASELS']);
  });

  it('kripto kaynakları USD, yahoo kaynakları TRY varsayımıyla işaretli', () => {
    for (const a of LIVE_ASSETS) {
      expect(a.source === 'crypto' ? a.category === 'crypto' : true).toBe(true);
    }
  });

  it("CRYPTO_SET kripto id'lerini içerir, kripto olmayanı içermez", () => {
    for (const id of ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX']) {
      expect(CRYPTO_SET.has(id)).toBe(true);
    }
    expect(CRYPTO_SET.has('THYAO')).toBe(false);
    expect(CRYPTO_SET.has('XAGGRAM')).toBe(false);
  });

  it('CORE_ASSETS = BIST olmayan çekirdek (kripto + emtia + döviz); BIST yok', () => {
    const ids = CORE_ASSETS.map((a) => a.id);
    expect(ids).toContain('BTC');
    expect(ids).toContain('SOL');
    expect(ids).toContain('XAUGRAM');
    expect(ids).toContain('XAGGRAM');
    expect(ids).toContain('EUR');
    expect(ids).not.toContain('THYAO');
    expect(CORE_ASSETS.every((a) => a.category !== 'bist')).toBe(true);
  });
});
```

- [ ] **Step 1.2: Testin düştüğünü doğrula**

Run: `npx vitest run src/lib/catalog/liveAssets.test.ts`
Expected: FAIL — "expected [...] to have a length of 11 but got 6" vb.

- [ ] **Step 1.3: Kataloğa 5 satır ekle**

`src/lib/catalog/liveAssets.ts` içinde `LIVE_ASSETS` dizisini şununla değiştir (kripto bloğu genişler, `XAUGRAM`'dan sonra gümüş gelir):

```typescript
export const LIVE_ASSETS: ReadonlyArray<LiveAssetMeta> = [
  { id: 'BTC', label: 'Bitcoin', category: 'crypto', source: 'crypto' },
  { id: 'ETH', label: 'Ethereum', category: 'crypto', source: 'crypto' },
  { id: 'SOL', label: 'Solana', category: 'crypto', source: 'crypto' },
  { id: 'XRP', label: 'Ripple', category: 'crypto', source: 'crypto' },
  { id: 'DOGE', label: 'Dogecoin', category: 'crypto', source: 'crypto' },
  { id: 'AVAX', label: 'Avalanche', category: 'crypto', source: 'crypto' },
  { id: 'THYAO', label: 'Türk Hava Yolları', category: 'bist', source: 'yahoo' },
  { id: 'ASELS', label: 'Aselsan', category: 'bist', source: 'yahoo' },
  { id: 'XAUGRAM', label: 'Gram Altın', category: 'commodity', source: 'yahoo' },
  { id: 'XAGGRAM', label: 'Gram Gümüş', category: 'commodity', source: 'yahoo' },
  { id: 'EUR', label: 'Euro', category: 'fx', source: 'yahoo' },
];
```

Başka hiçbir şey değişmez — türev listeler (`CRYPTO_SYMBOLS`, `CRYPTO_SET`, `CORE_ASSETS`, `BIST_SYMBOLS`, `CATALOG`) filtreden üretiliyor.

- [ ] **Step 1.4: Testlerin geçtiğini doğrula (tüm suite)**

Run: `npx vitest run`
Expected: PASS — 252+ test yeşil. (Store testleri katalogdan türetilen listeleri kullanır; sayım assert'i yoksa kırılmaz. Kırılan olursa beklentisini 11-varlık evrenine güncelle — davranış değişikliği DEĞİL, sayım güncellemesi.)

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/catalog/liveAssets.ts src/lib/catalog/liveAssets.test.ts
git commit -m "feat(catalog): SOL/XRP/DOGE/AVAX + gram gumus canli evrene eklendi"
```

---

### Task 2: `groupByCategory` + `CATEGORY_LABELS` (TDD)

**Files:**
- Modify: `src/lib/components/format.ts`
- Test: `src/lib/components/format.test.ts`

- [ ] **Step 2.1: Failing test yaz**

`src/lib/components/format.test.ts` — import satırını güncelle:

```typescript
import { displayTry, displayUsd, pnlClass, signedPercent, marketBadge, signedUsd, dailyChangeBadge, relativeTime, positionPnl, maxUnitsAffordable, heldUnits, groupByCategory, CATEGORY_LABELS } from './format';
```

Dosyanın SONUNA ekle:

```typescript
// ── groupByCategory ───────────────────────────────────────────────────────────
describe('groupByCategory', () => {
	const row = (id: string, category: string) => ({ id, category });

	it('boş liste → boş dizi', () => {
		expect(groupByCategory([])).toEqual([]);
	});

	it('sabit kategori sırası: crypto → bist → commodity → fx (giriş sırasından bağımsız)', () => {
		const rows = [row('EUR', 'fx'), row('XAUGRAM', 'commodity'), row('THYAO', 'bist'), row('BTC', 'crypto')];
		expect(groupByCategory(rows).map((g) => g.category)).toEqual(['crypto', 'bist', 'commodity', 'fx']);
	});

	it('grup içi giriş sırası korunur', () => {
		const rows = [row('BTC', 'crypto'), row('SOL', 'crypto'), row('ETH', 'crypto')];
		expect(groupByCategory(rows)[0].rows.map((r) => r.id)).toEqual(['BTC', 'SOL', 'ETH']);
	});

	it('boş kategori grubu üretilmez', () => {
		const rows = [row('BTC', 'crypto')];
		expect(groupByCategory(rows)).toHaveLength(1);
	});

	it('bilinmeyen kategori sona gider', () => {
		const rows = [row('X', 'weird'), row('BTC', 'crypto')];
		expect(groupByCategory(rows).map((g) => g.category)).toEqual(['crypto', 'weird']);
	});
});

// ── CATEGORY_LABELS ───────────────────────────────────────────────────────────
describe('CATEGORY_LABELS', () => {
	it('4 kategori Türkçe etiketli (EMTİA yerine ALTIN&GÜMÜŞ — jargon yok)', () => {
		expect(CATEGORY_LABELS.crypto).toBe('KRİPTO');
		expect(CATEGORY_LABELS.bist).toBe('BIST');
		expect(CATEGORY_LABELS.commodity).toBe('ALTIN&GÜMÜŞ');
		expect(CATEGORY_LABELS.fx).toBe('DÖVİZ');
	});
});
```

- [ ] **Step 2.2: Testin düştüğünü doğrula**

Run: `npx vitest run src/lib/components/format.test.ts`
Expected: FAIL — "groupByCategory is not a function" / export yok.

- [ ] **Step 2.3: Implementasyon**

`src/lib/components/format.ts` dosyasının SONUNA ekle:

```typescript
/** Piyasa listesi grup/sekme sırası — sabit: kripto → bist → emtia → döviz. */
const CATEGORY_ORDER: ReadonlyArray<string> = ['crypto', 'bist', 'commodity', 'fx'];

/** Kategori → UI etiketi. "EMTİA" jargon olduğu için ALTIN&GÜMÜŞ (hedef kitle: sıradan kriz-insanı). */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
	crypto: 'KRİPTO',
	bist: 'BIST',
	commodity: 'ALTIN&GÜMÜŞ',
	fx: 'DÖVİZ',
};

export interface CategoryGroup<T> {
	category: string;
	rows: T[];
}

/**
 * Satırları sabit kategori sırasıyla gruplar (grup içi giriş sırası korunur).
 * Bilinmeyen kategoriler sona, giriş sırasıyla. Boş grup üretilmez.
 */
export function groupByCategory<T extends { category: string }>(
	rows: ReadonlyArray<T>,
): CategoryGroup<T>[] {
	const map = new Map<string, T[]>();
	for (const r of rows) {
		const list = map.get(r.category);
		if (list) list.push(r);
		else map.set(r.category, [r]);
	}
	const known = CATEGORY_ORDER.filter((c) => map.has(c));
	const unknown = [...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
	return [...known, ...unknown].map((category) => ({ category, rows: map.get(category)! }));
}
```

- [ ] **Step 2.4: Testin geçtiğini doğrula**

Run: `npx vitest run src/lib/components/format.test.ts`
Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/components/format.ts src/lib/components/format.test.ts
git commit -m "feat(format): groupByCategory + CATEGORY_LABELS (sekme/grup altyapisi)"
```

---

### Task 3: `PriceRow.svelte` — temiz satır bileşeni

**Files:**
- Create: `src/lib/components/PriceRow.svelte`

Satır kuralları (spec §4.4): kategori etiketi YOK · % rozeti fiyatın yanında · USD karşılığı altta · "AÇIK" rozeti YOK, yalnız kapalıyken `KAPALI` · fiyatsız satır soluk + rozetsiz.

- [ ] **Step 3.1: Bileşeni oluştur**

`src/lib/components/PriceRow.svelte` (yeni dosya):

```svelte
<script lang="ts">
	import type { PriceRow } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { displayTry, displayUsd, dailyChangeBadge } from './format';

	interface Props {
		row: PriceRow;
		onSelect: (id: string) => void;
	}

	let { row, onSelect }: Props = $props();

	const hasPrice = $derived(row.priceTry !== undefined);
	// Fiyat henüz gelmediyse % rozeti de gizlenir ("—" + canlı rozet tutarsızlığı olmaz).
	const chg = $derived(hasPrice ? dailyChangeBadge(row.changePct) : null);
</script>

<button
	type="button"
	onclick={() => onSelect(row.id)}
	class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
	       hover:bg-term-panelLight hover:border-term-borderGlow
	       focus:outline-none focus:bg-term-panelLight
	       transition-colors duration-75 cursor-pointer {hasPrice ? '' : 'opacity-40'}"
>
	<div class="flex items-center justify-between gap-2">
		<span class="text-term-text font-bold truncate">{row.label}</span>
		<div class="flex flex-col items-end shrink-0">
			<div class="flex items-baseline gap-2">
				{#if chg}
					<span class="text-[10px] {chg.cls} font-bold">{chg.text}</span>
				{/if}
				{#if !row.marketOpen}
					<span class="text-[10px] text-term-amber">KAPALI</span>
				{/if}
				<span class="text-term-green font-bold">{displayTry(row.priceTry)}</span>
			</div>
			<span class="text-[10px] text-term-text opacity-50">
				≈ {displayUsd(row.priceUsd === undefined ? null : usd(row.priceUsd))}
			</span>
		</div>
	</div>
</button>
```

- [ ] **Step 3.2: Tip/derleme kontrolü**

Run: `npm run check`
Expected: 0 hata 0 uyarı. (Bileşen henüz kullanılmıyor — sadece derlenebilirlik.)

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/components/PriceRow.svelte
git commit -m "feat(ui): PriceRow bileseni — temiz satir (kategori etiketi yok, KAPALI-only rozet)"
```

---

### Task 4: `PriceList.svelte` — sekme + grup + arama-ezer kabuk

**Files:**
- Modify: `src/lib/components/PriceList.svelte` (tam yeniden yazım)

Davranış (spec §4.2–4.3): TÜMÜ=gruplu · kategori sekmesi=filtre (başlığıyla) · arama doluyken sekme yok sayılır, sonuç GENE gruplu + "+ EKLE" bölümü · props arayüzü DEĞİŞMEZ.

- [ ] **Step 4.1: Bileşeni yeniden yaz**

`src/lib/components/PriceList.svelte` dosyasının TÜM içeriğini şununla değiştir:

```svelte
<script lang="ts">
	import type { PriceRow as PriceRowData } from '$lib/stores/liveGameStore.svelte';
	import { groupByCategory, CATEGORY_LABELS } from './format';
	import { searchBist100 } from '$lib/catalog/bist100';
	import PriceRow from './PriceRow.svelte';

	interface Props {
		prices: PriceRowData[];
		onSelect: (id: string) => void;
		onAddBist: (symbol: string) => void;
	}

	let { prices, onSelect, onAddBist }: Props = $props();

	let q = $state('');
	let tab = $state('all');

	const TABS: ReadonlyArray<{ id: string; label: string }> = [
		{ id: 'all', label: 'TÜMÜ' },
		{ id: 'crypto', label: CATEGORY_LABELS.crypto },
		{ id: 'bist', label: CATEGORY_LABELS.bist },
		{ id: 'commodity', label: CATEGORY_LABELS.commodity },
		{ id: 'fx', label: CATEGORY_LABELS.fx },
	];

	const searching = $derived(q.trim() !== '');

	// Arama her şeyi ezer (sekme yok sayılır); aramasızken sekme filtreler.
	// Tek render yolu: sonuç her durumda gruplu çizilir.
	const visible = $derived.by(() => {
		if (searching) {
			const needle = q.trim().toLowerCase();
			return prices.filter(
				(r) => r.label.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle)
			);
		}
		return tab === 'all' ? prices : prices.filter((r) => r.category === tab);
	});

	const groups = $derived(groupByCategory(visible));

	// Arama yapılınca: BIST100'den eşleşip henüz aktif sette OLMAYAN semboller ("eklenebilir").
	const addable = $derived.by(() => {
		if (!searching) return [];
		const activeIds = new Set(prices.map((p) => p.id));
		return searchBist100(q).filter((e) => !activeIds.has(e.symbol));
	});

	function handleAdd(symbol: string) {
		onAddBist(symbol);
		q = ''; // aramayı temizle → yeni eklenen aktif listede görünür
	}
</script>

<div class="bg-term-panel border border-term-border font-mono text-xs flex flex-col h-full">
	<!-- Başlık + arama -->
	<div class="px-3 pt-3 pb-2 border-b border-term-border">
		<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold mb-2">
			PİYASA FİYATLARI
		</div>
		<input
			type="text"
			placeholder="Ara..."
			bind:value={q}
			class="w-full bg-term-bg border border-term-border px-2 py-1 text-term-text placeholder-term-text placeholder-opacity-30 focus:outline-none focus:border-term-borderGlow text-xs"
		/>
	</div>

	<!-- Kategori sekmeleri (arama doluyken pasif görünür — arama her şeyi ezer) -->
	<div class="flex flex-wrap gap-1 px-3 py-2 border-b border-term-border">
		{#each TABS as t (t.id)}
			<button
				type="button"
				onclick={() => (tab = t.id)}
				class="px-2 py-0.5 text-[10px] border transition-colors duration-75
				       {tab === t.id && !searching
					? 'border-term-green text-term-green bg-term-panelLight'
					: 'border-term-border text-term-text opacity-60 hover:opacity-100'}"
			>
				{t.label}
			</button>
		{/each}
	</div>

	<!-- Liste: her durumda gruplu (tek render yolu) -->
	<div class="flex-1 overflow-y-auto">
		{#if groups.length === 0 && addable.length === 0}
			<div class="px-3 py-4 text-term-text opacity-40 italic text-center">
				Sonuç bulunamadı
			</div>
		{:else}
			{#each groups as g (g.category)}
				<div class="px-3 py-1 text-[10px] uppercase tracking-widest text-term-blue opacity-60 bg-term-bg">
					{CATEGORY_LABELS[g.category] ?? g.category}
				</div>
				{#each g.rows as row (row.id)}
					<PriceRow {row} {onSelect} />
				{/each}
			{/each}
		{/if}

		{#if addable.length > 0}
			<div class="px-3 pt-3 pb-1 text-[10px] uppercase tracking-widest text-term-blue opacity-60 border-t border-term-border">
				BIST100 — Ekle
			</div>
			{#each addable as e (e.symbol)}
				<button
					type="button"
					onclick={() => handleAdd(e.symbol)}
					class="w-full text-left px-3 py-2 border-b border-term-border border-opacity-40
					       hover:bg-term-panelLight hover:border-term-borderGlow
					       focus:outline-none focus:bg-term-panelLight
					       transition-colors duration-75 cursor-pointer flex items-center justify-between gap-2"
				>
					<div class="flex flex-col min-w-0">
						<span class="text-term-text font-bold truncate">{e.name}</span>
						<span class="text-[10px] text-term-blue opacity-70 uppercase tracking-wide">{e.symbol}</span>
					</div>
					<span class="text-[10px] text-term-green font-bold shrink-0">+ EKLE</span>
				</button>
			{/each}
		{/if}
	</div>
</div>
```

Not: eski `categoryLabel`/`categoryColor` yerel map'leri ve `marketBadge` importu bilinçli silindi — etiketler `CATEGORY_LABELS`'a taşındı, AÇIK rozeti kalktı (KAPALI mantığı PriceRow'da).

- [ ] **Step 4.2: Suite + tip kontrolü**

Run: `npx vitest run` ve `npm run check`
Expected: tümü PASS, 0 hata 0 uyarı.

- [ ] **Step 4.3: Commit**

```bash
git add src/lib/components/PriceList.svelte
git commit -m "feat(ui): piyasa listesi hibrit sekme+grup duzeni, arama-ezer (spec 4.2-4.3)"
```

---

### Task 5: Final doğrulama + merge

- [ ] **Step 5.1: Tam gate**

Run: `npm run test` → tümü PASS (260+ beklenir) · `npm run check` → 0/0 · `npm run build` → başarılı.

- [ ] **Step 5.2: Motor dokunulmazlığı kanıtı**

```bash
git diff main -- src/lib/stores/gameState.ts src/lib/domain/fx/usdOracle.ts src/lib/api/binance.ts
```

Expected: BOŞ çıktı (spec kabul kriteri 5).

- [ ] **Step 5.3: Dev server gözle smoke (kullanıcıyla)**

Run: `npm.cmd run dev`
Kontrol listesi:
1. 9 çekirdek varlık listede (BTC, ETH, SOL, XRP, DOGE, AVAX, Gram Altın, Gram Gümüş, EUR) + THYAO/ASELS.
2. Yeni coinler canlı tick alıyor (fiyat oynuyor), gümüş TRY+USD fiyat gösteriyor.
3. Sekmeler: TÜMÜ gruplu; KRİPTO/BIST/ALTIN&GÜMÜŞ/DÖVİZ filtreli; arama yazınca sekme ezilip gruplu sonuç + "+ EKLE" geliyor; kutu boşalınca sekmeye dönüyor.
4. Satırlarda kategori etiketi ve "AÇIK" yok; BIST kapalıysa KAPALI rozeti; fiyatsız satır soluk ve %-rozetsiz.
5. SOL/gümüş AL → cüzdanda pozisyon + K/Z görünüyor (mevcut genel yol).

- [ ] **Step 5.4: Merge + push (kullanıcı onayıyla)**

```bash
git checkout main
git merge --no-ff feat/evren-hizli-paket -m "merge: evren genisletme hizli paket (5 varlik + piyasa listesi duzeni)"
git push
git branch -d feat/evren-hizli-paket
```
