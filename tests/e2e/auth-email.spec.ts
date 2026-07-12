import { test, expect } from '@playwright/test';
import { mockMarketData, waitForLivePrice } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';
import { waitForAuthLink } from './helpers/mailpit';
import { seedConfirmedUser } from './helpers/supabase-admin';

const PASSWORD = 'e2e-Sifre-123';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

test('kayıt (doğrulamasız) → anında oyun → al/sat → buluta yazılır', async ({ page }) => {
  const email = uniqueEmail('signup');
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'Kayıt', exact: true }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(PASSWORD);
  await page.getByRole('button', { name: 'KAYIT OL' }).click();

  // enable_confirmations=false → signUp anında oturum döndürür → handleEmailSignUp
  // session dalı → enterGame() → phase='playing'. Mail YOK, "Mail gönderildi" atlanır.
  await expect(page.getByRole('button', { name: 'Günün Kartı' })).toBeVisible();

  // Oturumlu kullanıcı al/sat yapar (BTC 7/24 açık — market-saat flake'i yok)
  await page.getByText('Bitcoin').first().click();
  await waitForLivePrice(page, 'BTC');
  await page.locator('#trade-units-BTC').fill('1');
  // AccountPanel'de de "AL" (takma ad) var — #trade-panel'e scope
  await page.locator('#trade-panel').getByRole('button', { name: 'AL', exact: true }).click();
  await expect(page.getByText(/✓ BTC ALINDI/)).toBeVisible();

  // Kanıt: oturumlu → trade buluta push edilir. Debounce'u visibilitychange flush'ıyla tetikle.
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

test('kayıt: zayıf şifre → dürüst hata, form kilitlenmez', async ({ page }) => {
  // Lokal Supabase "12345678"i KABUL eder (min_length=6, pwned koruması yok) — prod'daki
  // weak_password reddini deterministik üretmek için signup yanıtını gerçek 422 gövdesiyle
  // taklit ediyoruz. Şekil lokal GoTrue'dan hasat edildi (code/error_code/msg/weak_password);
  // reason'ı prod senaryosuna ('pwned') sabitledik — kod yolu yalnız error_code'a bakar.
  await page.route(/\/auth\/v1\/signup(\?|$)/, (route) =>
    route.fulfill({
      status: 422,
      json: {
        code: 422,
        error_code: 'weak_password',
        msg: 'Password is known to be weak and easy to guess, please choose a different one.',
        weak_password: { reasons: ['pwned'] },
      },
    }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'Kayıt', exact: true }).click();
  await page.getByPlaceholder('e-posta').fill(uniqueEmail('weak'));
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill('12345678');
  await page.getByRole('button', { name: 'KAYIT OL' }).click();

  // weak_password → authErrorMessage → dürüst mesaj (eski yanıltıcı "8 karakter" DEĞİL)
  await expect(page.getByText('Şifre çok zayıf — daha güçlü bir şifre seç')).toBeVisible();
  // Kayıt hata-yolu: busy kilidi çözüldü, form yeniden denenebilir (handleEmailSignUp hata dalı)
  await expect(page.getByRole('button', { name: 'KAYIT OL' })).toBeEnabled();
});

test('doğrulanmış kullanıcı e-posta+şifreyle girer → intro', async ({ page }) => {
  const { email, password } = await seedConfirmedUser();
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(password);
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  // handleEmailSignIn başarıda location.reload() yapar → boot → oturum var → intro
  await expect(page.getByRole('button', { name: 'BAŞLA ▶' })).toBeVisible();
});

test('yanlış şifre Türkçe hata gösterir, form kilitlenmez', async ({ page }) => {
  const { email } = await seedConfirmedUser();
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill('yanlis-sifre-99');
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  // authErrors.ts: invalid_credentials → sabit Türkçe mesaj
  await expect(page.getByText('E-posta ya da şifre hatalı')).toBeVisible();
  // Form hâlâ etkileşimli (busy kilidi çözülmüş)
  await expect(page.getByRole('button', { name: 'GİRİŞ', exact: true })).toBeEnabled();
});

test('şifre sıfırlama: mail → overlay → yeni şifreyle giriş', async ({ page }) => {
  const { email } = await seedConfirmedUser();
  const newPassword = 'yeni-e2e-Sifre-456';

  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'şifremi unuttum' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByRole('button', { name: 'SIFIRLAMA MAİLİ GÖNDER' }).click();
  await expect(page.getByText(/Mail gönderildi/)).toBeVisible();

  const link = await waitForAuthLink(email, 'recovery');
  await page.goto(link);
  // verifyOtp(recovery) oturum açar → /?pw_reset=1 → overlay
  await expect(page.getByText('Yeni şifre belirle')).toBeVisible();
  await page.getByPlaceholder('yeni şifre (en az 8 karakter)').fill(newPassword);
  await page.getByRole('button', { name: 'KAYDET' }).click();
  await expect(page.getByText('Şifre güncellendi')).toBeVisible();

  // Kanıt: yeni şifre gerçekten çalışıyor — oturumu at, sıfırdan gir
  await page.context().clearCookies();
  await page.reload();
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByPlaceholder('e-posta').fill(email);
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(newPassword);
  await page.getByRole('button', { name: 'GİRİŞ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'BAŞLA ▶' })).toBeVisible();
});
