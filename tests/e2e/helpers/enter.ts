import type { Page } from '@playwright/test';

/** Offline giriş: welcome'daki offline linki ancak misafir DENEMESİ hata verince görünür
 *  (WelcomeScreen {#if errorMsg}). Auth bloke edilir → misafir dener → hata → offline linki. */
export async function enterOffline(page: Page): Promise<void> {
  await page.route('**/auth/v1/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'MİSAFİR OLARAK OYNA' }).click();
  await page
    .getByRole('button', { name: 'yine de çevrimdışı oyna (kayıt yalnız bu cihazda)' })
    .click();
}
