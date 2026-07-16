import { test, expect } from '@playwright/test';
import { mockMarketData, waitForLivePrice } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { getSaveRow } from './helpers/supabase-admin';

const PASSWORD = 'e2e-Sifre-123';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('çıkışta bulut kalıcılığı — saves satırı + geri giriş doğrulaması', async ({ page }) => {
  // Bu test üç ayrı reload zinciri içeriyor (çıkış + iki adımlı bulut hidrasyonu girişte) —
  // varsayılan 30s global sınır diğer testlere göre daha az paya sahip, biraz nefes payı ver.
  test.setTimeout(45_000);

  const email = uniqueEmail('signout');

  // 1) Kayıt (doğrulamasız yerel stack → anında oturum) — auth-email.spec.ts kalıbı.
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'Kayıt', exact: true }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(PASSWORD);

  // signUp yanıtından user.id'yi yakala — DB kanıtını (adım 4) bu id ile okuyacağız.
  const signupResponse = page.waitForResponse(
    (res) => /\/auth\/v1\/signup(\?|$)/.test(res.url()) && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'KAYIT OL' }).click();
  const { user } = (await (await signupResponse).json()) as { user: { id: string } };
  const userId = user.id;

  // enable_confirmations=false → signUp anında oturum döndürür → handleEmailSignUp session
  // dalı → enterGame() → phase='playing'. Mail YOK, "Mail gönderildi" atlanır.
  await expect(page.getByRole('button', { name: 'Günün Kartı' })).toBeVisible();

  // 2) BTC 1 adet AL (core-journey.spec.ts kalıbı; BTC 7/24 açık — market-saat flake'i yok).
  await page.getByText('Bitcoin').first().click();
  await waitForLivePrice(page, 'BTC');
  await page.locator('#trade-units-BTC').fill('1');
  // AccountPanel'de de "AL" (takma ad) var — #trade-panel'e scope.
  await page.locator('#trade-panel').getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI/)).toBeVisible();

  // 3) AccountPanel'den çıkış — buton İKİ TIKLAMA gerektiriyor: "ÇIKIŞ YAP" → "EMİN MİSİN?".
  await page.getByRole('button', { name: 'ÇIKIŞ YAP' }).click();
  await page
    .getByRole('button', { name: 'EMİN MİSİN? (kaydın bulutta — girince kaldığın yerden)' })
    .click();
  // handleSignOut: cloudPush.flush() (upsert'i BEKLER) → auth.signOut() → local temizlik → reload.
  // Welcome ekranının geri gelmesi, push dahil TÜM zincirin bittiğinin kanıtı (arbitrary wait yok).
  await expect(page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' })).toBeVisible({
    timeout: 15_000,
  });

  // 4) DB kanıtı: "request gitti" değil "veri GERÇEKTEN yazıldı" — service-role ile fresh select.
  const row = await getSaveRow(userId);
  const holdings = (row.payload as { game: { holdings: { assetId: string; units: number }[] } })
    .game.holdings;
  expect(holdings).toContainEqual(expect.objectContaining({ assetId: 'BTC', units: 1 }));

  // 5) Aynı e-posta ile tekrar giriş → oyun geri geldi (BTC pozisyonu UI'da görünür).
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(PASSWORD);
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  // handleEmailSignIn → reload → boot hidrasyonu buluttan local'e kopyalar → otomatik 2. reload
  // → local kayıt var → senkron intro (bootPhase.initialPhase, boot flaşı yok).
  await expect(page.getByText('Kayıtlı oyun bulundu')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'DEVAM ET ▶' }).click();
  await page.getByText('Bitcoin').first().click();
  // Not: PriceList'te de aynı isimde bir filtre chip'i var — #trade-panel'e scope edilir.
  await expect(page.locator('#trade-panel').getByRole('button', { name: 'TÜMÜ' })).toBeVisible();
});
