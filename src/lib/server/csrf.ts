/** Same-origin kontrolü (güvenlik denetimi B4 — CSRF defense-in-depth).
 *  Tarayıcı, fetch POST'larında same-origin'de bile `Origin` header'ı gönderir;
 *  header yoksa veya app origin'iyle uyuşmuyorsa isteği yıkıcı endpoint'lerde reddet.
 *  SvelteKit'in dahili csrf.checkOrigin'i yalnız form content-type'larını kapsadığı için
 *  bodysiz/JSON POST'lar bu ek katmanla korunur. */
export function isSameOrigin(originHeader: string | null, appOrigin: string): boolean {
  return originHeader !== null && originHeader === appOrigin;
}
