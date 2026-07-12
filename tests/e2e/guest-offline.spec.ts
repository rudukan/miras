import { test, expect } from '@playwright/test';
import { mockMarketData, waitForLivePrice } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('misafir girişi: anonim oturum + save buluta yazılır', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'MİSAFİR OLARAK OYNA' }).click();
  // Misafir intro'suz doğrudan oyuna girer (handleGuest → enterGame)
  await expect(page.getByRole('button', { name: 'Günün Kartı' })).toBeVisible();

  // State değişikliği üret → persist + cloudPush.schedule (debounce 30 sn)
  await page.getByText('Bitcoin').first().click();
  await waitForLivePrice(page, 'BTC');
  await page.locator('#trade-units-BTC').fill('1');
  // Not: misafir/oturumlu AccountPanel'de takma ad "AL" butonu da var — #trade-panel'e scope edilir
  await page.locator('#trade-panel').getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI/)).toBeVisible();

  // Debounce'u bekleme: visibilitychange flush'ı tetikle (+page.svelte flushOnHide)
  const savePush = page.waitForRequest(
    (req) => req.url().includes('/rest/v1/saves') && req.method() === 'POST',
    { timeout: 10_000 },
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await savePush;
});

test('offline oyun: oyun çalışır, buluta TEK istek gitmez', async ({ page }) => {
  const restCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/')) restCalls.push(req.url());
  });

  await enterOffline(page);
  await page.getByText('Bitcoin').first().click();
  await waitForLivePrice(page, 'BTC');
  await page.locator('#trade-units-BTC').fill('1');
  // Not: misafir/oturumlu AccountPanel'de takma ad "AL" butonu da var — #trade-panel'e scope edilir
  await page.locator('#trade-panel').getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI/)).toBeVisible();

  // cloudPush hiç enable edilmedi → /rest/v1'e sıfır istek (spec §4.B fail-safe)
  expect(restCalls).toEqual([]);
});
