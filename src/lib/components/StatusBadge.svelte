<script lang="ts">
	interface Props {
		stale: boolean;
		asOf: number;
		feedStatus: 'live' | 'stale';
	}

	let { stale, asOf, feedStatus }: Props = $props();

	const timeLabel = $derived(
		asOf > 0 ? new Date(asOf).toLocaleTimeString('tr-TR') : '—'
	);

	const dotColor = $derived(stale ? 'text-term-amber' : 'text-term-green');
	const dotGlow = $derived(stale ? '' : 'glow-text-green');
	const statusText = $derived(stale ? 'VERİ ESKİ' : 'CANLI');
	const feedLabel = $derived(feedStatus === 'live' ? 'canlı' : 'kopuk');
	const feedColor = $derived(feedStatus === 'live' ? 'text-term-green' : 'text-term-amber');
</script>

<div class="flex items-center gap-3 px-3 py-1.5 bg-term-panel border border-term-border text-xs font-mono">
	<span class="{dotColor} {dotGlow} font-bold tracking-wide">
		● {statusText}
	</span>

	<span class="text-term-text opacity-60">|</span>

	<span class="text-term-text">
		Son güncelleme: <span class="text-term-blue">{timeLabel}</span>
	</span>

	<span class="text-term-text opacity-60">|</span>

	<span class="text-term-text">
		akış: <span class="{feedColor}">{feedLabel}</span>
	</span>
</div>
