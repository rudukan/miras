import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('grafik overlay: popover → ⤢ BÜYÜT → dialog + etiketler + TradeForm; Escape kapatır', async ({ page }) => {
  await enterOffline(page);

  // Masaüstünde popover 1 sn hover ile açılır (PriceRow.handleEnter'daki kasıtlı gecikme).
  await page.getByText('Bitcoin').first().hover();
  const expandBtn = page.getByRole('button', { name: '⤢ BÜYÜT' });
  await expect(expandBtn).toBeVisible({ timeout: 5_000 });
  await expandBtn.click();

  const dialog = page.getByRole('dialog', { name: 'Bitcoin grafiği' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('canvas')).toBeVisible();
  // Min fiyat etiketi — SERIES_FIXTURE min'i tam 62000, kaynak crypto → USD biçimi.
  await expect(dialog.getByText('$62,000.00').first()).toBeVisible();
  // TradeForm overlay içinde (ana panel/popover'la olası id çakışmasına karşı dialog'a scope).
  await expect(dialog.getByRole('button', { name: 'AL', exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
