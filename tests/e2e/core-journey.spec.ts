import { test, expect } from '@playwright/test';
import { mockMarketData, waitForLivePrice } from './helpers/market-mocks';
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

test('varlık al/sat — toast onayı ve TÜMÜ chip sinyali', async ({ page }) => {
  await enterOffline(page);
  // Kripto seç (BTC 7/24 açık — market-saat flake'i imkânsız)
  await page.getByText('Bitcoin').first().click();
  await expect(page.locator('#trade-units-BTC')).toBeVisible();
  await waitForLivePrice(page, 'BTC');
  await page.locator('#trade-units-BTC').fill('1');
  await page.getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI — 1\.0000 adet/)).toBeVisible();
  // Pozisyon var → TÜMÜ chip'i görünür (yalnız heldUnits > 0 iken render edilir)
  // Not: PriceList'te de aynı isimde bir filtre chip'i var — #trade-panel'e scope edilir
  await expect(page.locator('#trade-panel').getByRole('button', { name: 'TÜMÜ' })).toBeVisible();

  await page.locator('#trade-units-BTC').fill('1');
  await page.getByRole('button', { name: 'SAT', exact: true }).click();
  await expect(page.getByText(/✓ BTC SATILDI — 1\.0000 adet/)).toBeVisible();
});

test('sayfa yenilenince kayıt korunur — intro DEVAM ET yolu', async ({ page }) => {
  await enterOffline(page);
  await page.getByText('Bitcoin').first().click();
  await waitForLivePrice(page, 'BTC');
  await page.locator('#trade-units-BTC').fill('2');
  await page.getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI — 2\.0000 adet/)).toBeVisible();

  await page.reload();
  // Local save var → boot'suz senkron intro (bootPhase.initialPhase)
  await expect(page.getByText('Kayıtlı oyun bulundu')).toBeVisible();
  await page.getByRole('button', { name: 'DEVAM ET ▶' }).click();
  // Pozisyon yaşıyor mu: BTC seçince TÜMÜ chip'i hâlâ orada
  await page.getByText('Bitcoin').first().click();
  // Not: PriceList'te de aynı isimde bir filtre chip'i var — #trade-panel'e scope edilir
  await expect(page.locator('#trade-panel').getByRole('button', { name: 'TÜMÜ' })).toBeVisible();
});
