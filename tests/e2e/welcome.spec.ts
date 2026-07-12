import { test, expect } from '@playwright/test';

test('oturumsuz ilk ziyaret welcome ekranını gösterir', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('[ MİRAS — CANLI ÇEKİRDEK ]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'GOOGLE İLE GİRİŞ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MİSAFİR OLARAK OYNA' })).toBeVisible();
});
