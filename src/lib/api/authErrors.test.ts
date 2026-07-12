import { describe, it, expect } from 'vitest';
import { authErrorMessage } from './authErrors';

describe('authErrorMessage', () => {
  it('bilinen kodları Türkçe mesaja çevirir', () => {
    expect(authErrorMessage('invalid_credentials')).toBe('E-posta ya da şifre hatalı');
    expect(authErrorMessage('user_already_exists')).toBe('Bu e-posta zaten kayıtlı — GİRİŞ yap');
    expect(authErrorMessage('email_exists')).toBe('Bu e-posta zaten kayıtlı — GİRİŞ yap');
    expect(authErrorMessage('weak_password')).toBe('Şifre çok zayıf — daha güçlü bir şifre seç');
    expect(authErrorMessage('over_email_send_rate_limit')).toBe('Çok sık denendi — biraz bekleyip tekrar dene');
    expect(authErrorMessage('email_not_confirmed')).toBe('E-postanı doğrulaman gerekiyor — gelen kutunu kontrol et');
  });
  it('bilinmeyen/boş kod nötr mesaja düşer (enumerasyon sızdırmaz)', () => {
    expect(authErrorMessage('weird_code')).toBe('İşlem tamamlanamadı — tekrar dene');
    expect(authErrorMessage(undefined)).toBe('İşlem tamamlanamadı — tekrar dene');
  });
});
