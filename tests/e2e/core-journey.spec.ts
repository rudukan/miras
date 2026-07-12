import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('offline giriş sonrası oyun açılır ve mock fiyatlar render olur', async ({ page }) => {
  await enterOffline(page);
  // Playing ekranı: üst bantta Günün Kartı butonu
  await expect(page.getByRole('button', { name: 'Günün Kartı' })).toBeVisible();
  // Fiyat listesinde çekirdek varlıklar (fixture'dan)
  await expect(page.getByText('Bitcoin')).toBeVisible();
  await expect(page.getByText('Ethereum')).toBeVisible();
  await expect(page.getByText('Gram Altın')).toBeVisible();
});
