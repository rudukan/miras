<script lang="ts">
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

	// Renk sınıfları
	const netColor = $derived(
		netWorthUsd === null ? 'text-term-text' :
		netWorthUsd.amount >= 1_000_000 ? 'text-term-green glow-text-green' : 'text-term-red glow-text-red'
	);
	const pctColor = $derived(pnlClass(profitRate === null ? null : profitRate - 1));
	const vsColor = $derived(pnlClass(vsUsdHoldUsd?.amount ?? null));
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono space-y-3">
	<!-- Başlık -->
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		NET SERVET
	</div>

	<!-- Ana rakam -->
	<div class="text-center py-2">
		<div class="text-[10px] text-term-text opacity-50 uppercase tracking-wider mb-1">
			Toplam Değer (USD)
		</div>
		<div class="text-2xl font-bold {netColor}">
			{netLabel}
		</div>
	</div>

	<!-- Getiri ve karşılaştırma -->
	<div class="grid grid-cols-2 gap-2 pt-1 border-t border-term-border">
		<div class="text-center">
			<div class="text-[10px] text-term-text opacity-50 uppercase tracking-wider mb-0.5">
				Getiri
			</div>
			<div class="text-sm font-bold {pctColor}">
				{pctLabel}
			</div>
		</div>
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
