<script lang="ts">
	let {
		busy,
		errorMsg,
		sentMode,
		onSignIn,
		onSignUp,
		onForgot,
		onBack,
	}: {
		busy: boolean;
		errorMsg: string | null;
		sentMode: boolean;
		onSignIn: (email: string, password: string) => void;
		onSignUp: (email: string, password: string) => void;
		onForgot: (email: string) => void;
		onBack: () => void;
	} = $props();

	let view = $state<'signin' | 'signup' | 'forgot'>('signin');
	let email = $state('');
	let password = $state('');

	const emailOk = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
	const passwordOk = $derived(password.length >= 8);
	const canSubmit = $derived(
		!busy && emailOk && (view === 'forgot' ? true : passwordOk),
	);

	function submit() {
		if (!canSubmit) return;
		const e = email.trim();
		if (view === 'signin') onSignIn(e, password);
		else if (view === 'signup') onSignUp(e, password);
		else onForgot(e);
	}
</script>

<div class="space-y-3">
	{#if sentMode}
		<p class="text-term-green text-xs text-center">
			Mail gönderildi — gelen kutunu (ve spam'i) kontrol et. Zaten kayıtlıysan GİRİŞ yap.
		</p>
		<button type="button" onclick={onBack} class="w-full text-[10px] text-term-text opacity-50 underline">
			← geri
		</button>
	{:else}
		<div class="flex text-[10px] uppercase tracking-widest">
			<button
				type="button"
				class="flex-1 py-1 border border-term-border {view === 'signin' ? 'text-term-green' : 'text-term-text opacity-50'}"
				onclick={() => (view = 'signin')}>Giriş</button
			>
			<button
				type="button"
				class="flex-1 py-1 border border-l-0 border-term-border {view === 'signup' ? 'text-term-green' : 'text-term-text opacity-50'}"
				onclick={() => (view = 'signup')}>Kayıt</button
			>
		</div>

		<input
			type="email"
			placeholder="e-posta"
			bind:value={email}
			class="w-full border border-term-border bg-transparent px-2 py-1.5 text-sm"
			autocomplete="email"
		/>
		{#if view !== 'forgot'}
			<input
				type="password"
				placeholder="şifre (en az 8 karakter)"
				bind:value={password}
				class="w-full border border-term-border bg-transparent px-2 py-1.5 text-sm"
				autocomplete={view === 'signup' ? 'new-password' : 'current-password'}
			/>
		{/if}

		<button
			type="button"
			onclick={submit}
			disabled={!canSubmit}
			class="w-full py-2.5 bg-term-bg border border-term-green text-term-green font-bold
			       text-sm tracking-widest uppercase hover:bg-term-panelLight transition-colors
			       disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{busy ? 'İŞLENİYOR…' : view === 'signin' ? 'GİRİŞ' : view === 'signup' ? 'KAYIT OL' : 'SIFIRLAMA MAİLİ GÖNDER'}
		</button>

		<div class="flex justify-between text-[10px]">
			{#if view === 'forgot'}
				<button type="button" class="text-term-text opacity-50 underline" onclick={() => (view = 'signin')}>
					← girişe dön
				</button>
			{:else}
				<button type="button" class="text-term-text opacity-50 underline" onclick={() => (view = 'forgot')}>
					şifremi unuttum
				</button>
			{/if}
			<button type="button" class="text-term-text opacity-50 underline" onclick={onBack}>← geri</button>
		</div>
	{/if}

	{#if errorMsg}
		<p class="text-term-amber text-xs text-center">{errorMsg}</p>
	{/if}
</div>
