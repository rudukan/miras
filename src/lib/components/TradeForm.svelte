<script lang="ts">
	import { tick } from 'svelte';
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import { CATALOG } from '$lib/catalog/liveAssets';
	import { bistName } from '$lib/catalog/bist100';
	import {
		maxUnitsAffordable,
		heldUnits,
		tradeToastMessage,
		queueToastMessage,
		parseTypedAmount,
		formatTypedAmount,
		countNonCommaBefore,
		caretAfterNonComma,
	} from './format';

	interface Props {
		store: LiveGameStore;
		assetId: string | null;
		/** Boş durumda gösterilecek metin (panel: "Soldan bir varlık seç"). */
		emptyText?: string;
		onTradeSuccess?: (message: string) => void;
	}
	let { store, assetId, emptyText = 'Bir varlık seç', onTradeSuccess }: Props = $props();

	const chipCls =
		'px-1.5 py-0.5 bg-term-bg border border-term-border text-term-blue text-[10px] ' +
		'hover:border-term-borderGlow hover:text-term-green transition-colors';

	const usdBalance = $derived(store.game.usdBalance.amount);
	const assetUsd = $derived(assetId ? store.assetUsdPrice(assetId) : undefined);
	const heldUnitsSel = $derived(heldUnits(store.positions, assetId));
	const assetLabel = $derived(
		assetId ? (CATALOG[assetId]?.label ?? bistName(assetId)) : null,
	);
	// İşlem yönlendirmesi — store'un TEK kaynağı. 'queued' bir hata DEĞİL, yönlendirmedir: AL/SAT
	// devre dışı bırakılmaz, kuyruğa alınır (audit P1 → Task 3/4: eski red davranışı terk edildi).
	const mode = $derived(assetId ? store.tradeMode(assetId) : 'instant');

	// Kaynak: yazılan biçimlendirilmiş metin (binlik virgüllü). Sayısal değerler bundan türer —
	// büyük tutarlar (ör. 62,161,390) yazarken basamak sayısı okunur kalsın diye.
	let unitsRaw = $state('');
	let dollarRaw = $state('');
	const units = $derived(parseTypedAmount(unitsRaw));
	const dollarAmount = $derived(parseTypedAmount(dollarRaw));
	// Kullanıcı en son hangi alana yazdı — kuyruklu alışta (mode='queued') bu, emrin units-kind mi
	// yoksa amountUsd-kind mi kaydedileceğini belirler (bkz. handleBuy).
	let lastEdited = $state<'units' | 'dollars'>('units');

	// Varlık değişince formu sıfırla (pop-up farklı varlık açtığında eski değer kalmasın).
	$effect(() => {
		void assetId;
		unitsRaw = '';
		dollarRaw = '';
	});

	function syncDollarFromUnits() {
		dollarRaw =
			assetUsd !== undefined ? formatTypedAmount(String(Math.round(units * assetUsd * 100) / 100)) : '';
	}
	function syncUnitsFromDollar() {
		if (assetUsd !== undefined && assetUsd > 0) {
			unitsRaw = formatTypedAmount(String(Math.floor((dollarAmount / assetUsd) * 10000) / 10000));
		}
	}
	function maxUnits() {
		unitsRaw = formatTypedAmount(String(maxUnitsAffordable(usdBalance, assetUsd)));
		syncDollarFromUnits();
	}
	function allUnits() {
		unitsRaw = formatTypedAmount(String(heldUnitsSel));
		syncDollarFromUnits();
	}

	/** Yazarken binlik virgülünü canlı uygular; imleci (caret) doğru konumda tutar. */
	function reformatInput(e: Event, setRaw: (formatted: string) => void) {
		const input = e.currentTarget as HTMLInputElement;
		const caret = input.selectionStart ?? input.value.length;
		const keep = countNonCommaBefore(input.value, caret);
		const formatted = formatTypedAmount(input.value);
		setRaw(formatted);
		void tick().then(() => {
			const pos = caretAfterNonComma(formatted, keep);
			input.setSelectionRange(pos, pos);
		});
	}
	function handleUnitsInput(e: Event) {
		lastEdited = 'units';
		reformatInput(e, (f) => (unitsRaw = f));
		syncDollarFromUnits();
	}
	function handleDollarInput(e: Event) {
		lastEdited = 'dollars';
		reformatInput(e, (f) => (dollarRaw = f));
		syncUnitsFromDollar();
	}

	function handleBuy() {
		if (!assetId || units <= 0) return;
		const id = assetId;
		const u = units;
		const amt = dollarAmount;
		// Kuyruklu + dolar alanına yazılmışsa tutar bazlı emir (gerçekleşme anındaki fiyattan
		// adede çevrilir) — diğer tüm durumlarda (anlık, ya da kuyruklu ama adet alanına yazılmış)
		// adet bazlı. Toast'a hangi temsilin gösterileceğini `useAmountUsd` belirler.
		const useAmountUsd = mode === 'queued' && lastEdited === 'dollars' && amt > 0;
		if (useAmountUsd) {
			store.buyAmountUsd(id, usd(amt));
		} else {
			store.buy(id, u);
		}
		unitsRaw = '';
		dollarRaw = '';
		if (store.lastError === null) {
			const message =
				mode === 'queued'
					? queueToastMessage('buy', id, useAmountUsd ? 0 : u, amt)
					: tradeToastMessage('buy', id, u, amt);
			onTradeSuccess?.(message);
		}
	}
	function handleSell() {
		if (!assetId || units <= 0) return;
		const id = assetId;
		const u = units;
		const amt = dollarAmount;
		store.sell(id, u);
		unitsRaw = '';
		dollarRaw = '';
		if (store.lastError === null) {
			const message =
				mode === 'queued' ? queueToastMessage('sell', id, u, amt) : tradeToastMessage('sell', id, u, amt);
			onTradeSuccess?.(message);
		}
	}
</script>

{#if assetId === null}
	<div class="text-term-text opacity-40 italic py-2 text-center">{emptyText}</div>
{:else}
	<div class="text-term-green font-bold mb-2">
		{assetLabel}
		<span class="text-term-text opacity-50 font-normal ml-1 text-[10px]">({assetId})</span>
	</div>

	<div class="space-y-1.5">
		<div class="flex items-center gap-2">
			<label for="trade-units-{assetId}" class="text-term-text opacity-50 shrink-0 w-20">Adet</label>
			<input
				type="text"
				inputmode="decimal"
				id="trade-units-{assetId}"
				value={unitsRaw}
				oninput={handleUnitsInput}
				placeholder="0"
				class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
				       focus:outline-none focus:border-term-borderGlow text-xs w-full"
			/>
			<button type="button" onclick={maxUnits} class="shrink-0 {chipCls}">MAX</button>
			{#if heldUnitsSel > 0}
				<button type="button" onclick={allUnits} class="shrink-0 {chipCls}">TÜMÜ</button>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<label for="trade-dollars-{assetId}" class="text-term-text opacity-50 shrink-0 w-20">Tutar ($)</label>
			<input
				type="text"
				inputmode="decimal"
				id="trade-dollars-{assetId}"
				value={dollarRaw}
				oninput={handleDollarInput}
				placeholder="0"
				class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
				       focus:outline-none focus:border-term-borderGlow text-xs w-full"
			/>
		</div>
	</div>

	<div class="flex gap-2 mt-1">
		<button
			type="button"
			onclick={handleBuy}
			class="flex-1 py-1.5 bg-term-bg border border-term-green text-term-green font-bold
			       hover:bg-term-panelLight glow-border-green transition-colors"
		>
			AL
		</button>
		<button
			type="button"
			onclick={handleSell}
			class="flex-1 py-1.5 bg-term-bg border border-term-red text-term-red font-bold
			       hover:bg-term-panelLight transition-colors"
		>
			SAT
		</button>
	</div>

	{#if mode === 'queued'}
		<div class="border border-term-amber bg-term-bg px-3 py-2 text-term-amber text-[11px] leading-snug mt-2">
			PİYASA KAPALI / VERİ BEKLENİYOR — emir kuyruğa alınır, açılışı izleyen ilk taze fiyatta
			gerçekleşir; bakiye yetmezse iptal olur.
		</div>
	{/if}

	{#if store.lastError !== null}
		<div class="border border-term-red bg-term-bg px-3 py-2 text-term-red text-[11px] leading-snug mt-2">
			<span class="font-bold mr-1">HATA:</span>{store.lastError}
		</div>
	{/if}
{/if}
