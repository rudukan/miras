/** Supabase AuthApiError.code → Türkçe UI mesajı. Bilinmeyen kod nötr mesaja düşer —
 *  kayıtlı e-posta bilgisi SIZDIRILMAZ (spec §4.J enumerasyon-nötr kuralı). */
export function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'invalid_credentials':
      return 'E-posta ya da şifre hatalı';
    case 'user_already_exists':
    case 'email_exists':
      return 'Bu e-posta zaten kayıtlı — GİRİŞ yap';
    case 'weak_password':
      // weak_password = sızmış/yaygın (pwned) VEYA karmaşıklık VEYA uzunluk — hepsini kapsar.
      // "8 karakter" demek yanıltıcıydı: uzunluğu tutan ama yaygın şifre (12345678) girenler şaşırıyordu.
      return 'Şifre çok zayıf — daha güçlü bir şifre seç';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Çok sık denendi — biraz bekleyip tekrar dene';
    case 'email_not_confirmed':
      return 'E-postanı doğrulaman gerekiyor — gelen kutunu kontrol et';
    case 'same_password':
      return 'Yeni şifre eskisiyle aynı olamaz';
    default:
      return 'İşlem tamamlanamadı — tekrar dene';
  }
}
