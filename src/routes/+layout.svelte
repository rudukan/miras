<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<div class="scanlines" aria-hidden="true"></div>
{@render children()}
