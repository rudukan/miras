import { defineConfig } from '@playwright/test';
import { supabaseEnv, SUPABASE_URL, BASE_URL, PORT } from './tests/e2e/helpers/stack';

const keys = supabaseEnv();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // Tek paylaşımlı dev server + tek paylaşımlı lokal Supabase (izole worker'lar yok) —
  // paralel worker'lar --repeat-each=3 taramasında gerçek/tutarlı flake üretti (5/30 FAIL);
  // workers:1 ile aynı tarama 30/30 PASS. Hız yerine CI'da bloklayıcı olma güvenilirliği öncelikli.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // $env/static/* dev-server başlangıcında inline edilir — E2E env'i BURADAN verilir,
    // .env.local'ı process env önceliğiyle ezer (Vite kuralı).
    env: {
      PUBLIC_SUPABASE_URL: SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.anonKey,
      SUPABASE_SECRET_KEY: keys.serviceRoleKey,
      // Stub (helpers/turnstile-stub.ts) script'i hiç yüklemez; bu değer yalnız
      // $env/static/public importunun boş kalmaması için.
      PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000BB',
    },
  },
});
