/** Proxy amplifikasyon savunması (güvenlik denetimi P1-2): `/api/yahoo` ve `/api/crypto`
 *  kimliksiz olarak kullanıcı sembol listesini upstream'e `Promise.all` ile fan-out ediyor.
 *  Liste uzunluğu üst sınıra kırpılır ki tek gelen istek sınırsız upstream çağrısına patlamasın. */
export const MAX_SYMBOLS = 50;

/** Güvenli sembol biçimi: yalnız büyük harf + rakam (güvenlik denetimi B3).
 *  Upstream URL'ine `.IS`/`USDT` ekiyle gömülmeden önce URL-anlamlı karakterleri eler. */
const VALID_SYMBOL_RE = /^[A-Z0-9]{1,12}$/;

/** Virgüllü sembol parametresini normalize eder: böl → trim → büyük harf → whitelist filtrele → MAX_SYMBOLS'e kırp.
 *  null/boş → []. */
export function parseSymbolList(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => VALID_SYMBOL_RE.test(s))
    .slice(0, MAX_SYMBOLS);
}
