import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** `.env.local`'den tek bir değişkeni okur. `npm run e2e` çıplak `playwright test`'tir —
 *  test-runner süreci (bu dosyanın çalıştığı süreç) `.env.local`'i OTOMATİK yüklemez, proje
 *  `dotenv` de bağımlılık değil. `playwright.config.ts`'teki `webServer.env` bloğu FARKLI bir
 *  şeyi çözer: Vite'a spawn edilen SvelteKit dev server süreci için env verir — bu fonksiyonun
 *  okuduğu ayrı (parent) test-runner sürecine hiç dokunmaz.
 *  `stack.ts`'in `supabaseEnv()`'iyle aynı stil: dış kütüphane yerine dosyayı doğrudan regex
 *  ile ayrıştır. `npx playwright test` her zaman repo kökünden çalıştırılır (`stack.ts`'in
 *  `npx supabase status`'u da aynı varsayıma dayanır) — yol CWD'ye göreceli. */
export function readLocalEnv(name: string): string {
  const path = resolve(process.cwd(), '.env.local');
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`.env.local okunamadı (${path}) — ${name} için yerel dosya gerekli.`);
  }
  const m = contents.match(new RegExp(`^${name}="?([^"\r\n]+)"?`, 'm'));
  if (!m) throw new Error(`.env.local içinde ${name} tanımlı değil.`);
  return m[1];
}
