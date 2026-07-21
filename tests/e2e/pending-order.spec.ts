import { test, expect } from '@playwright/test';
import { mockMarketData } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { enterOffline } from './helpers/enter';

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

// FX_FIXTURE (tests/e2e/fixtures/market.ts) hiçbir zaman priceAt alanı taşımaz → BIST sembolleri
// (THYAO) bu mock ortamında saat/piyasa durumundan bağımsız DAİMA tradeMode==='queued' çözer
// (bkz. liveGameStore.svelte.ts isAssetFresh: bist/us dalı fxCache.priceAt?.[assetId] şart koşar).
// Bu test o davranış farkını ASSERT ETMEZ — yalnızca AL/SAT'ın hiçbir zaman disabled olmadığını
// doğrular (Task 4: eski tradeBlockReason/disabled tamamen kaldırıldı, 'queued' bir red değil
// yönlendirmedir). Amber kuyruk-bilgi satırı opsiyonel polish olarak eklenir — bu fixture'da
// deterministik olduğu için flake riski yok.
test('kapalı/taze olmayan BIST varlığında AL ve SAT asla disabled değil', async ({ page }) => {
  await enterOffline(page);

  await page.getByText('Türk Hava Yolları').first().click();
  await expect(page.locator('#trade-units-THYAO')).toBeVisible();

  const panel = page.locator('#trade-panel');
  await expect(panel.getByRole('button', { name: 'AL', exact: true })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'SAT', exact: true })).toBeEnabled();

  // Opsiyonel polish: kuyruklu-mod bilgi satırı (Task 4, TradeForm.svelte) — bu fixture'da
  // THYAO daima 'queued' olduğu için deterministik.
  await expect(panel.getByText(/emir kuyruğa alınır/)).toBeVisible();
});
