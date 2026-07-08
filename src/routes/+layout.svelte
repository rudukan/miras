<script lang="ts">
	import '../app.css';
	import { invalidate } from '$app/navigation';

	let { data, children } = $props();

	$effect(() => {
		const {
			data: { subscription },
		} = data.supabase.auth.onAuthStateChange((event) => {
			// INITIAL_SESSION her yeni client olusumunda fırlar (Supabase auth-js dokumantasyonu);
			// bunu da invalidate edersek load() yeni bir client yaratir, o da INITIAL_SESSION firlatir —
			// sonsuz dongu. Yalniz gercek degisikliklerde invalidate et.
			if (event === 'INITIAL_SESSION') return;
			invalidate('supabase:auth');
		});
		return () => subscription.unsubscribe();
	});
</script>

{@render children()}
