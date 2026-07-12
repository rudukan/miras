import { defineConfig } from '@playwright/test';
import { supabaseEnv, SUPABASE_URL, BASE_URL, PORT } from './tests/e2e/helpers/stack';

const keys = supabaseEnv();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
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
