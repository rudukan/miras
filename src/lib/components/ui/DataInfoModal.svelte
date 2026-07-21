<!-- src/lib/components/ui/DataInfoModal.svelte — "Veri Hakkında" notu (Faz 1 veri dili) -->
<script lang="ts">
	interface Props {
		onClose: () => void;
	}
	let { onClose }: Props = $props();

	let closeBtn: HTMLButtonElement | null = $state(null);
	$effect(() => {
		closeBtn?.focus();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<button type="button" class="fixed inset-0 bg-black/70 z-[60]" aria-label="Kapat" onclick={onClose}></button>

<div
	class="fixed z-[70] bg-term-panel border border-term-borderGlow font-mono text-xs
	       inset-0 overflow-y-auto p-3 space-y-3
	       md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2
	       md:w-[min(90vw,32rem)] md:max-h-[85vh] md:shadow-lg md:p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Veri hakkında"
>
	<div class="flex items-start justify-between gap-2 border-b border-term-border pb-2">
		<div class="text-term-text font-bold text-sm">VERİ HAKKINDA</div>
		<button
			bind:this={closeBtn}
			type="button"
			onclick={onClose}
			class="shrink-0 text-term-text opacity-50 hover:opacity-100 px-1"
			aria-label="Kapat"
		>✕</button>
	</div>

	<div class="space-y-2.5 text-term-text opacity-90 leading-relaxed">
		<p><span class="text-term-green font-bold">Kripto:</span> WebSocket ile canlı (500 ms güncelleme); 24 saatlik yüzde değişim 20 saniyede bir yenilenen ayrı bir kaynaktan gelir. Bağlantı koparsa 3 saniyede bir yeniden denenir, o sırada son bilinen fiyat gösterilmeye devam eder.</p>
		<p><span class="text-term-green font-bold">BIST hisseleri:</span> ~15 dakika gecikmeli (ücretsiz veri kaynağı). İstemci 20 saniyede bir tazeler.</p>
		<p><span class="text-term-green font-bold">Altın/gümüş:</span> ons cinsinden vadeli fiyattan grama ve TL'ye çevrilir — anlık spot fiyat değil, türetilmiş bir değerdir.</p>
		<p><span class="text-term-green font-bold">Döviz:</span> piyasa parite verisinden gelir.</p>
		<p><span class="text-term-green font-bold">Günlük kur:</span> işlemlerde kullanılan operatif kur her gün bir kez mühürlenir; kur gün içinde mühürden belirgin sapınca (%0.75'ten fazla) aynı gün yeniden mühürlenir. Anlık piyasa kuru Binance'teki USDT/TRY (dolar karşılığı stablecoin) işlem fiyatından gelir — TL'nin resmi USD paritesi değil, ona yakın bir piyasa göstergesidir; cüzdan panelinde mühürlü kurla birlikte ayrıca gösterilir.</p>
		<p><span class="text-term-green font-bold">Kapalı piyasa:</span> Seans kapalıyken gösterilen fiyat son KAPANIŞ fiyatıdır. Kapalıyken verilen emirler, açılışı izleyen ilk taze fiyatta otomatik gerçekleşir; açılışta bakiye yetmezse emir iptal edilir.</p>
		<p class="text-term-amber">Bu oyun bir simülasyondur. Hiçbir bilgi yatırım tavsiyesi değildir.</p>
	</div>
</div>
