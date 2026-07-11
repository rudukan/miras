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
      return 'Şifre en az 8 karakter olmalı';
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
