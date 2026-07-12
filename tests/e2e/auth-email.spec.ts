import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { waitForAuthLink } from './helpers/mailpit';

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
