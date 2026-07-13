/** Proxy amplifikasyon savunması (güvenlik denetimi P1-2): `/api/yahoo` ve `/api/crypto`
 *  kimliksiz olarak kullanıcı sembol listesini upstream'e `Promise.all` ile fan-out ediyor.
 *  Liste uzunluğu üst sınıra kırpılır ki tek gelen istek sınırsız upstream çağrısına patlamasın. */
export const MAX_SYMBOLS = 50;

/** Virgüllü sembol parametresini normalize eder: böl → trim → büyük harf → boşları at → MAX_SYMBOLS'e kırp.
 *  null/boş → []. */
export function parseSymbolList(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);
}
