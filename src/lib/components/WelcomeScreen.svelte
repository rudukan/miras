<script lang="ts">
	let {
		busy,
		errorMsg,
		onGoogle,
		onGuest,
		onOffline,
	}: {
		busy: boolean;
		errorMsg: string | null;
		onGoogle: () => void;
		onGuest: () => void;
		onOffline: () => void;
	} = $props();
</script>

<main class="min-h-[100dvh] flex items-center justify-center px-4">
	<div class="w-full max-w-sm space-y-6">
		<div class="text-center space-y-2">
			<div class="text-term-green text-xl font-bold glow-text-green tracking-widest">
				[ MİRAS — CANLI ÇEKİRDEK ]
			</div>
			<div class="text-term-blue text-xs tracking-widest uppercase">Mod: CANLI</div>
			<div class="text-term-text text-xs opacity-60">$1.000.000 USD · Gerçek piyasa verileri</div>
		</div>

		<div class="space-y-3">
			<button
				type="button"
				onclick={onGoogle}
				disabled={busy}
				class="w-full py-3 bg-term-bg border border-term-blue text-term-blue font-bold
				       text-sm tracking-widest uppercase hover:bg-term-panelLight transition-colors
				       disabled:opacity-40 disabled:cursor-not-allowed"
			>
				GOOGLE İLE GİRİŞ
			</button>

			<div>
				<button
					type="button"
					onclick={onGuest}
					disabled={busy}
					class="w-full py-3 bg-term-bg border border-term-green text-term-green font-bold
					       text-sm tracking-widest uppercase hover:bg-term-panelLight
					       glow-border-green transition-colors
					       disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{busy ? 'AÇILIYOR…' : 'MİSAFİR OLARAK OYNA'}
				</button>
				<p class="mt-1 text-center text-[10px] text-term-text opacity-40">
					Yeni bulut kimliği oluşturur
				</p>
			</div>
		</div>

		{#if errorMsg}
			<div class="text-center space-y-2">
				<p class="text-term-amber text-xs">{errorMsg}</p>
				<button
					type="button"
					onclick={onOffline}
					class="text-[10px] text-term-text opacity-50 underline hover:opacity-80 transition-opacity"
				>
					yine de çevrimdışı oyna (kayıt yalnız bu cihazda)
				</button>
			</div>
		{/if}
	</div>
</main>
