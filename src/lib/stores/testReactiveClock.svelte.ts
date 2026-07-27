/** SADECE TEST amaçlı yardımcı — üretim kodu bunu İTHAL ETMEZ.
 *  `*.test.ts` dosyaları rune KULLANAMAZ (yalnız `.svelte`/`.svelte.js`/`.svelte.ts` derleniyor,
 *  bkz. vite.config.ts `sveltekit()` plugin'i). `+page.svelte`'nin `nowMs` gibi BAŞKA bir modülde
 *  yaşayan bir $state'in, `liveGameStore.svelte.ts` içindeki bir $derived tarafından (o $state'i
 *  okuyan bir closure — `isLeagueActive` — üzerinden dolaylı olarak) reaktif şekilde izlendiğini
 *  kanıtlamak için gerçek bir $state kutusuna ihtiyaç var; plain bir `let` değişkeni bu testi
 *  SESSİZCE anlamsızlaştırır (Svelte'in bağımlılık takibi yalnız sinyal okumalarını görür). */
export function createTestClock(initialMs: number) {
  let ms = $state(initialMs);
  return {
    get ms(): number {
      return ms;
    },
    set(next: number): void {
      ms = next;
    },
  };
}
