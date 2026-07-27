import { test, expect } from '@playwright/test';
import { mockMarketData, waitForLivePrice } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { readLocalEnv } from './helpers/localEnv';

const PASSWORD = 'e2e-Sifre-123';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

// Lig yolu iki iddiayı doğrular: (1) kayıtlı kullanıcı lige katılabiliyor,
// (2) katıldıktan sonra AL isteği /api/trade'e gidiyor (fiyat sunucuda damgalanıyor).
test('lige katılan kullanıcının işlemi /api/trade üzerinden damgalanır', async ({ page }) => {
  test.setTimeout(45_000);

  // 1) Hafta satırını aç — prod'da cron yapar, testte endpoint elle tetiklenir.
  // process.env.CRON_SECRET KULLANILMAZ: Playwright test-runner süreci .env.local'i
  // otomatik yüklemez (bkz. helpers/localEnv.ts) — dosyadan doğrudan okunur.
  const tick = await page.request.post('/api/league/tick', {
    headers: { 'x-cron-secret': readLocalEnv('CRON_SECRET') },
    data: {},
  });
  expect(tick.ok()).toBeTruthy();

  // 2) Kayıt (yerel stack'te enable_confirmations=false → anında oturum).
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'Kayıt', exact: true }).click();
  await page.getByPlaceholder('e-posta').fill(uniqueEmail('league'));
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(PASSWORD);
  await page.getByRole('button', { name: 'KAYIT OL' }).click();
  await expect(page.getByRole('button', { name: 'Günün Kartı' })).toBeVisible();

  // 3) Lige katıl → store lig moduna geçer (rozet görünür).
  await page.getByRole('button', { name: 'LİGE KATIL' }).click();
  await expect(page.getByText(/LİG HAFTASI/)).toBeVisible({ timeout: 15_000 });

  // 4) BTC 1 adet AL (BTC 7/24 açık — market-saat flake'i yok).
  await page.getByText('Bitcoin').first().click();
  await waitForLivePrice(page, 'BTC');
  await page.locator('#trade-units-BTC').fill('1');

  const tradeRequest = page.waitForRequest(
    (req) => req.url().includes('/api/trade') && req.method() === 'POST',
  );
  // AccountPanel'de de "AL" var — #trade-panel'e scope zorunlu.
  await page.locator('#trade-panel').getByRole('button', { name: 'AL', exact: true }).click();

  const body = (await tradeRequest).postDataJSON() as Record<string, unknown>;
  expect(body.assetId).toBe('BTC');
  expect(body.side).toBe('buy');
  expect(body.units).toBe(1);
  expect(body.clientOrderId).toBeTruthy();
  // İstemci FİYAT GÖNDERMEZ — hile korumasının gözlemlenebilir kanıtı.
  expect(body.priceUsd).toBeUndefined();
});
