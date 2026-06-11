<script lang="ts">
	import type { Money } from '$lib/domain/money';
	import { displayUsd, pnlClass, signedPercent, signedUsd } from './format';

	interface Props {
		netWorthUsd: Money | null;
		profitRate: number | null;
		vsUsdHoldUsd: Money | null;
	}

	let { netWorthUsd, profitRate, vsUsdHoldUsd }: Props = $props();

	const netColor = $derived(
		netWorthUsd === null ? 'text-term-text' :
		netWorthUsd.amount >= 1_000_000 ? 'text-term-green glow-text-green' : 'text-term-red glow-text-red'
	);
	const pctColor = $derived(pnlClass(profitRate === null ? null : profitRate - 1));
	const vsColor = $derived(pnlClass(vsUsdHoldUsd?.amount ?? null));
</script>

<!-- Mobil mini servet bandı — "param ne oldu" her an göz önünde (md+ NetWorthMirror paneli var) -->
<div class="flex items-baseline justify-between gap-3 px-3 py-1.5 bg-term-panel border-x border-b border-term-border font-mono">
	<span class="text-sm font-bold {netColor} whitespace-nowrap">{displayUsd(netWorthUsd)}</span>
	<span class="text-xs font-bold {pctColor} whitespace-nowrap">{signedPercent(profitRate)}</span>
	<span class="text-xs {vsColor} whitespace-nowrap">
		{signedUsd(vsUsdHoldUsd)}<span class="text-term-text opacity-50 ml-1">vs $</span>
	</span>
</div>
