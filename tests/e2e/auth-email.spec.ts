import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { waitForAuthLink } from './helpers/mailpit';
import { seedConfirmedUser } from './helpers/supabase-admin';

const PASSWORD = 'e2e-Sifre-123';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('kayıt → doğrulama maili → linke tıkla → oturumlu intro', async ({ page }) => {
  const email = uniqueEmail('signup');
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'Kayıt', exact: true }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(PASSWORD);
  await page.getByRole('button', { name: 'KAYIT OL' }).click();
  await expect(page.getByText(/Mail gönderildi/)).toBeVisible();

  const link = await waitForAuthLink(email, 'email');
  await page.goto(link);
  // /auth/confirm token'ı sunucuda takas eder → '/' → oturum VAR + local save YOK → intro
  await expect(page.getByRole('button', { name: 'BAŞLA ▶' })).toBeVisible();
});

test('doğrulanmış kullanıcı e-posta+şifreyle girer → intro', async ({ page }) => {
  const { email, password } = await seedConfirmedUser();
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(password);
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  // handleEmailSignIn başarıda location.reload() yapar → boot → oturum var → intro
  await expect(page.getByRole('button', { name: 'BAŞLA ▶' })).toBeVisible();
});

test('yanlış şifre Türkçe hata gösterir, form kilitlenmez', async ({ page }) => {
  const { email } = await seedConfirmedUser();
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill('yanlis-sifre-99');
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  // authErrors.ts: invalid_credentials → sabit Türkçe mesaj
  await expect(page.getByText('E-posta ya da şifre hatalı')).toBeVisible();
  // Form hâlâ etkileşimli (busy kilidi çözülmüş)
  await expect(page.getByRole('button', { name: 'GİRİŞ', exact: true })).toBeEnabled();
});

test('şifre sıfırlama: mail → overlay → yeni şifreyle giriş', async ({ page }) => {
  const { email } = await seedConfirmedUser();
  const newPassword = 'yeni-e2e-Sifre-456';

  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'şifremi unuttum' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByRole('button', { name: 'SIFIRLAMA MAİLİ GÖNDER' }).click();
  await expect(page.getByText(/Mail gönderildi/)).toBeVisible();

  const link = await waitForAuthLink(email, 'recovery');
  await page.goto(link);
  // verifyOtp(recovery) oturum açar → /?pw_reset=1 → overlay
  await expect(page.getByText('Yeni şifre belirle')).toBeVisible();
  await page.getByPlaceholder('yeni şifre (en az 8 karakter)').fill(newPassword);
  await page.getByRole('button', { name: 'KAYDET' }).click();
  await expect(page.getByText('Şifre güncellendi')).toBeVisible();

  // Kanıt: yeni şifre gerçekten çalışıyor — oturumu at, sıfırdan gir
  await page.context().clearCookies();
  await page.reload();
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(newPassword);
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'BAŞLA ▶' })).toBeVisible();
});
