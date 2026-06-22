<script lang="ts">
	interface Props {
		message: string | null;
	}

	let { message }: Props = $props();
</script>

{#if message}
	<div
		class="fixed top-4 right-4 z-50 bg-term-panel border border-term-green text-term-green
		       font-mono text-xs px-3 py-2 glow-border-green shadow-lg"
	>
		{message}
	</div>
{/if}
