<script lang="ts">
	import type { ClosingCardModel } from './closingCard';
	import { buildCardLayout, drawCard } from '../share/cardImage';
	import { sharePng, type ShareResult } from '../share/share';

	interface Props {
		model: ClosingCardModel;
		/** PAYLAŞ'a tıklanınca hemen çağrılır (telemetri: share_click). */
		onShareClick?: () => void;
		/** PNG paylaşımı tamamlandığında sonuçla çağrılır (telemetri: share_done). */
		onShare?: (result: ShareResult) => void;
		onClose: () => void;
	}

	let { model, onShareClick, onShare, onClose }: Props = $props();
	let sharing = $state(false);

	async function handleShareClick() {
		if (sharing) return;
		sharing = true;
		onShareClick?.();
		try {
			const canvas = document.createElement('canvas');
			await drawCard(canvas, buildCardLayout(model));
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
			if (blob === null) return;
			const result = await sharePng(blob);
			onShare?.(result);
		} finally {
			sharing = false;
		}
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-term-bg/80 backdrop-blur-sm p-4">
	<div
		class="w-full max-w-sm bg-term-panel border border-term-green glow-border-green font-mono"
		role="dialog"
		aria-modal="true"
		aria-label="Günlük kapanış kartı"
		tabindex="-1"
	>
		<!-- Başlık -->
		<div class="px-4 py-2 border-b border-term-border flex items-center justify-between">
			<span class="text-term-blue text-[10px] uppercase tracking-widest font-bold">
				{model.dayLabel} · KAPANIŞ
			</span>
			<button
				type="button"
				onclick={onClose}
				class="text-term-text opacity-50 hover:opacity-100 text-xs leading-none"
				aria-label="Kapat"
			>
				✕
			</button>
		</div>

		<!-- Tek vurgu -->
		<div class="px-4 py-5 text-center space-y-1">
			<div class="text-[10px] text-term-text opacity-50 uppercase tracking-widest">
				{model.headlineLabel}
			</div>
			<div class="text-3xl font-bold {model.headlineClass} glow-text-green">
				{model.headlineValue}
			</div>
		</div>

		<!-- Dolar tutsaydın -->
		<div class="px-4 pb-4 text-center">
			<div class="text-[10px] text-term-text opacity-50 uppercase tracking-widest mb-1">
				DOLAR TUTSAYDIN
			</div>
			<div class="text-sm font-bold {model.vsUsdHoldClass}">
				{model.vsUsdHoldValue}
			</div>
		</div>

		<!-- Dağılım barı + rozet -->
		{#if model.segments.length > 0}
			<div class="px-4 pb-4 space-y-2">
				<div class="flex h-3 w-full overflow-hidden border border-term-border">
					{#each model.segments as seg (seg.key)}
						<div
							class={seg.colorClass}
							style="width: {seg.pct}%"
							title="{seg.label} {seg.pct.toFixed(1)}%"
						></div>
					{/each}
				</div>
				<div class="flex items-center justify-between gap-2 text-[10px]">
					<div class="flex flex-wrap gap-2">
						{#each model.segments as seg (seg.key)}
							<span class="flex items-center gap-1 text-term-text opacity-70">
								<span class="inline-block w-2 h-2 {seg.colorClass}"></span>
								{seg.label} {seg.pct.toFixed(0)}%
							</span>
						{/each}
					</div>
					<span class="text-term-green font-bold uppercase whitespace-nowrap">
						{model.badge}
					</span>
				</div>
			</div>
		{/if}

		<!-- Aksiyonlar -->
		<div class="px-4 pb-4 grid grid-cols-2 gap-2">
			<button
				type="button"
				onclick={handleShareClick}
				disabled={sharing}
				class="py-2 bg-term-bg border border-term-green text-term-green font-bold
				       text-xs tracking-widest uppercase hover:bg-term-panelLight
				       glow-border-green transition-colors disabled:opacity-50"
			>
				{sharing ? '...' : 'PAYLAŞ'}
			</button>
			<button
				type="button"
				onclick={onClose}
				class="py-2 bg-term-bg border border-term-border text-term-text font-bold
				       text-xs tracking-widest uppercase hover:bg-term-panelLight
				       transition-colors"
			>
				KAPAT
			</button>
		</div>

		<!-- Hukuk şartı — her zaman tam görünür -->
		<div class="px-4 py-2 border-t border-term-border text-[9px] text-term-amber text-center uppercase tracking-wider">
			{model.disclaimer}
		</div>
	</div>
</div>
