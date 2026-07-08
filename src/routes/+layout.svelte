<script lang="ts">
	import '../app.css';
	import { invalidate } from '$app/navigation';

	let { data, children } = $props();

	$effect(() => {
		const {
			data: { subscription },
		} = data.supabase.auth.onAuthStateChange(() => {
			invalidate('supabase:auth');
		});
		return () => subscription.unsubscribe();
	});
</script>

{@render children()}
