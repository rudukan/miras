import type { Page } from '@playwright/test';

/** window.turnstile'ı sayfa yüklenmeden stub'lar — Cloudflare script'i HİÇ yüklenmez
 *  (src/lib/api/turnstile.ts loadScript önce window.turnstile'a bakar).
 *  render() sözleşmesi turnstile.ts'tekiyle birebir: {sitekey, callback, 'error-callback'}.
 *  Lokal Supabase'de captcha doğrulaması kapalı — token içeriği önemsiz. */
export async function stubTurnstile(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: (_el: unknown, opts: { callback: (token: string) => void }) => {
        setTimeout(() => opts.callback('e2e-dummy-token'), 0);
        return 'e2e-widget';
      },
      remove: () => {},
    };
  });
}
