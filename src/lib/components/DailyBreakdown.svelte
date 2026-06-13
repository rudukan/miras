<script lang="ts">
	import type { DailyBreakdownRow } from '$lib/domain/snapshot/dailySnapshot';
	import { usd } from '$lib/domain/money';
	import { signedUsd, pnlClass, dailyChangeBadge, shortDate } from './format';

	interface Props {
		rows: DailyBreakdownRow[];
		/** Gösterilecek en yeni gün sayısı (varsayılan 10). */
		limit?: number;
	}

	let { rows, limit = 10 }: Props = $props();

	const visible = $derived(rows.slice(0, limit));
</script>

{#if visible.length > 0}
	<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-2">
		<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
			GÜNLÜK DÖKÜM
		</div>

		<div class="space-y-1">
			{#each visible as row (row.dateKey)}
				{@const pctBadge = dailyChangeBadge(row.deltaPct ?? undefined)}
				<div class="flex justify-between items-center gap-2">
					<span class="text-term-text opacity-70 w-16 shrink-0">{shortDate(row.dateKey)}</span>
					{#if row.deltaUsd === null}
						<span class="text-term-text opacity-40 italic text-[10px]">başlangıç</span>
					{:else}
						<div class="flex items-center justify-end gap-1.5 flex-1">
							<span class="{pnlClass(row.deltaUsd.amount)} font-bold">{signedUsd(usd(row.deltaUsd.amount))}</span>
							{#if pctBadge}<span class="{pctBadge.cls} text-[10px]">({pctBadge.text})</span>{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
