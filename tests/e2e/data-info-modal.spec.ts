import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('veri hakkında modalı: info butonu → dialog açılır, içerik görünür; Escape kapatır', async ({ page }) => {
  await enterOffline(page);

  await page.getByRole('button', { name: 'Veri hakkında' }).click();

  const dialog = page.getByRole('dialog', { name: 'Veri hakkında' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('VERİ HAKKINDA')).toBeVisible();
  await expect(dialog.getByText(/USDT\/TRY/)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
