/**
 * Takma ad kurallari (spec §4): 3-20 karakter, [A-Za-z0-9_ + Turkce harfler],
 * bosluk yok, kufur blocklist'i substring olarak taranir (TR normalize ile).
 * Ayni kural DB'de nickname_format CHECK'i olarak da var — bu modul kullanici
 * dostu mesaj uretir, DB son savunma hattidir.
 */
export type NicknameVerdict = { ok: true; value: string } | { ok: false; reason: string };

const FORMAT = /^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]{3,20}$/;

// Kucuk cekirdek liste — SP2'de sikayet butonuyla desteklenecek. Normalize edilmis halde tut.
const BLOCKLIST = [
  'amk', 'amcik', 'sik', 'siktir', 'yarrak', 'orospu', 'pic', 'ibne', 'gavat',
  'salak', 'gerizekali', 'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'hitler',
];

function normalizeTr(s: string): string {
  return s
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o')
    .replace(/ş/g, 's').replace(/ü/g, 'u');
}

export function validateNickname(raw: string): NicknameVerdict {
  const value = raw.trim();
  if (value.length < 3 || value.length > 20) {
    return { ok: false, reason: 'Takma ad 3-20 karakter olmalı' };
  }
  if (!FORMAT.test(value)) {
    return { ok: false, reason: 'Yalnız harf, rakam ve alt çizgi kullanılabilir' };
  }
  const normalized = normalizeTr(value);
  if (BLOCKLIST.some((w) => normalized.includes(w))) {
    return { ok: false, reason: 'Takma ad uygunsuz ifade içeriyor' };
  }
  return { ok: true, value };
}
