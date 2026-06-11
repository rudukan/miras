import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// fra1 ZORUNLU: Binance ABD bölgelerine (vercel varsayılanı iad1) HTTP 451 döner,
		// bu /api/crypto'yu kırar. Tarayıcı WS'i (kullanıcı TR IP) bu ayardan etkilenmez.
		adapter: adapter({
			runtime: 'nodejs20.x',
			regions: ['fra1']
		})
	}
};

export default config;
