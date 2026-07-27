import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

// Kısa viewport: PriceList kendi içinde kaydırılır (overflow-y-auto). Alt satırda popover
// açılınca anchor.top ekranın alt sınırına yakın olur — bu, popover'ın sabit "320px yükseklik"
// varsayımından uzun içerikle taşıp AL/SAT'ı ekran dışına ittiği hatayı reprodükler.
test.use({ viewport: { width: 1280, height: 650 } });

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('masaüstü popover: dar viewportta alt satırda açılınca AL/SAT tamamen görünür kalır', async ({ page }) => {
  await enterOffline(page);

  // Euro (fx), CATEGORY_ORDER'da son grup ve fixture'daki tek fx satırı — listeyi sonuna
  // kaydırınca en alttaki satır budur.
  const row = page.getByText('Euro').first();
  await row.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await row.hover();

  const dialog = page.getByRole('dialog');
  const alBtn = dialog.getByRole('button', { name: 'AL', exact: true });
  const satBtn = dialog.getByRole('button', { name: 'SAT', exact: true });
  await expect(alBtn).toBeVisible({ timeout: 5_000 }); // hover 1sn gecikmeli açılır

  await expect(alBtn).toBeInViewport({ ratio: 1 });
  await expect(satBtn).toBeInViewport({ ratio: 1 });
});
