<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import { usd } from '$lib/domain/money';
	import {
		TERM_DAYS,
		DEPOSIT_ANNUAL_RATE,
		currentValueTry,
		isMatured,
	} from '$lib/domain/deposit/deposit';
	import { displayTry, displayUsd, countdownLabel } from './format';

	interface Props {
		store: LiveGameStore;
		nowMs: number;
	}

	let { store, nowMs }: Props = $props();

	const DAY_MS = 86_400_000;
	const ratePct = Math.round(DEPOSIT_ANNUAL_RATE * 100);

	const chipCls =
		'px-1.5 py-0.5 bg-term-bg border border-term-border text-term-blue text-[10px] ' +
		'hover:border-term-borderGlow hover:text-term-green transition-colors';

	const usdBalance = $derived(store.game.usdBalance.amount);
	const usdTry = $derived(store.usdTry);

	// ── Açma formu ───────────────────────────────────────────────────────────
	let amount = $state(0);
	function maxAmount() {
		amount = usdBalance;
	}
	function handleOpen() {
		if (amount <= 0) return;
		store.openDeposit(amount);
		amount = 0;
	}

	// ── Aktif mevduat (saniyelik: nowMs prop'una bağlı) ────────────────────────
	const dep = $derived(store.deposit);
	const valueTry = $derived(dep ? currentValueTry(dep, nowMs) : null);
	const valueUsd = $derived(dep && usdTry > 0 ? usd(valueTry!.amount / usdTry) : null);
	const matured = $derived(dep ? isMatured(dep, nowMs) : false);
	const msRemaining = $derived(dep ? dep.openedAtMs + TERM_DAYS * DAY_MS - nowMs : 0);

	function handleBreak() {
		if (!dep) return;
		if (!matured) {
			const ok = confirm(
				'Erken bozarsan faizden vazgeçersin, sadece anaparayı alırsın. Bozulsun mu?',
			);
			if (!ok) return;
		}
		store.breakDeposit();
	}
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-3">
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		MEVDUAT
	</div>

	{#if dep === null}
		<!-- Kapalı: açma formu -->
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<label for="dep-amount" class="text-term-text opacity-50 shrink-0 w-16">Tutar $</label>
				<input
					type="number"
					min="0"
					id="dep-amount"
					step="1000"
					bind:value={amount}
					class="flex-1 bg-term-bg border border-term-border px-2 py-1 text-term-text
					       focus:outline-none focus:border-term-borderGlow text-xs w-full"
				/>
				<button type="button" onclick={maxAmount} class="shrink-0 {chipCls}">HEPSİ</button>
			</div>
			<div class="flex justify-between text-[10px] text-term-text opacity-50">
				<span>{TERM_DAYS} gün · faiz %{ratePct}/yıl</span>
				<span>≈ {displayTry(usdTry > 0 ? amount * usdTry : undefined)} yatırılacak</span>
			</div>
			<button
				type="button"
				onclick={handleOpen}
				class="w-full py-1.5 bg-term-bg border border-term-green text-term-green font-bold
				       hover:bg-term-panelLight glow-border-green transition-colors"
			>
				MEVDUAT AÇ
			</button>
		</div>
	{:else}
		<!-- Açık: aktif mevduat -->
		<div class="space-y-1.5">
			<div class="flex justify-between items-center">
				<span class="text-term-text opacity-70">{matured ? 'VADE DOLDU' : 'kilitli'}</span>
				<span class="text-term-green glow-text-green font-bold">{displayTry(valueTry?.amount)}</span>
			</div>
			<div class="flex justify-between items-center text-[10px]">
				<span class="text-term-text opacity-50">
					≈ {displayUsd(valueUsd)} (yatırdığın: {displayUsd(dep.usdAtOpen)})
				</span>
				<span class="text-term-blue">{matured ? 'faiz işledi' : countdownLabel(msRemaining)}</span>
			</div>
			<div class="flex justify-between items-center pt-1">
				<span class="text-term-text opacity-50 text-[10px]">faiz %{ratePct}/yıl</span>
				<button
					type="button"
					onclick={handleBreak}
					class="px-3 py-1 bg-term-bg border {matured ? 'border-term-green text-term-green' : 'border-term-red text-term-red'}
					       font-bold hover:bg-term-panelLight transition-colors"
				>
					{matured ? 'TOPLA' : 'BOZ'}
				</button>
			</div>
		</div>
	{/if}
</div>
