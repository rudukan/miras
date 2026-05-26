/**
 * Deterministik pseudo-random: aynı (seed, day) -> aynı sonuç.
 * Akümülatif DEĞİL — her gün bağımsız hesaplanır (random walk yok).
 * Tam sayı seed beklenir.
 * @returns [0, 1) aralığında değer
 */
export function pseudoRandom(seed: number, day: number): number {
  let h = (Math.imul(seed, 374761393) + Math.imul(day, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * İşaretli gürültü: [-1, 1) aralığında, deterministik.
 * @param salt farklı seriler (örn. her hisse) için ofset; varsayılan 0
 */
export function signedNoise(seed: number, day: number, salt = 0): number {
  return pseudoRandom(seed + salt, day) * 2 - 1;
}

/** String'i deterministik tam-sayı seed'e çevirir (ticker -> salt). FNV-1a. */
export function stringSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}
