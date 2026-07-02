<script lang="ts">
	import type { LiveGameStore } from '$lib/stores/liveGameStore.svelte';
	import TradeForm from './TradeForm.svelte';

	interface Props {
		store: LiveGameStore;
		selectedAssetId: string | null;
		onTradeSuccess?: (message: string) => void;
	}
	let { store, selectedAssetId, onTradeSuccess }: Props = $props();
</script>

<div class="bg-term-panel border border-term-border p-3 font-mono text-xs space-y-4">
	<div class="text-term-blue tracking-widest uppercase text-[10px] font-bold border-b border-term-border pb-1">
		İŞLEM PANELİ
	</div>

	<div class="space-y-2">
		<div class="text-term-text opacity-60 text-[10px] uppercase tracking-wider">Al / Sat</div>
		<div class="text-term-amber text-[10px] leading-relaxed">
			Tüm işlemler USD nakitten yapılır. BIST/altın/gümüş alımında kur otomatik takas edilir.
		</div>
		<TradeForm {store} assetId={selectedAssetId} emptyText="Soldan bir varlık seç" {onTradeSuccess} />
	</div>
</div>
