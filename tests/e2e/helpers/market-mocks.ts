import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { FX_FIXTURE, CRYPTO_FIXTURE, SERIES_FIXTURE } from '../fixtures/market';

/** Tüm piyasa kaynaklarını fixture'lara bağlar — dış dünyaya sıfır istek.
 *  Supabase'e DOKUNMAZ (auth/cloud testleri gerçek lokal stack'e gider). */
export async function mockMarketData(page: Page): Promise<void> {
  // Glob string'ler yerine RegExp: Vite dev'de aynı "api/<isim>" öneki src/lib/api/<isim>Source.ts
  // gibi kaynak modüllerini de servis ediyor — sondaki `*` glob'u o dosya adını da yutup JS yerine
  // JSON döndürüyor, hydration'ı kırıyordu (bkz. commit notu). RegExp uç noktayı tam sınırlıyor.
  await page.route(/\/api\/yahoo(\?|$)/, (route) =>
    route.fulfill({ json: { ...FX_FIXTURE, asOf: Date.now() } }),
  );
  await page.route(/\/api\/crypto(\?|$)/, (route) =>
    route.fulfill({ json: { ...CRYPTO_FIXTURE, asOf: Date.now() } }),
  );
  // Aşağıdaki üçü kapsanan akışlarda çağrılmayabilir — savunma amaçlı sabitlenir.
  await page.route(/\/api\/series\?/, (route) =>
    route.fulfill({ json: { value: SERIES_FIXTURE, asOf: Date.now(), stale: false } }),
  );
  await page.route(/\/api\/usSearch\?/, (route) => route.fulfill({ json: { results: [] } }));
  await page.route(/\/api\/telemetry$/, (route) => route.fulfill({ status: 204 }));

  // Binance combined stream taklidi: bağlantı anında her sembole bir trade frame'i.
  // Mesaj şekli src/lib/api/binance.ts onmessage parser'ıyla birebir: {data:{s,p}}.
  await page.routeWebSocket(/stream\.binance\.com/, (ws) => {
    const frame = (s: string, p: number) => JSON.stringify({ data: { s, p: String(p) } });
    for (const [sym, price] of Object.entries(CRYPTO_FIXTURE.value.prices)) {
      ws.send(frame(`${sym}USDT`, price));
    }
    ws.send(frame('USDTTRY', FX_FIXTURE.value.usdTry));
  });
}

/** Seçili varlığın oracle fiyatı store'a düşene kadar bekler. WS frame'i bağlantı anında
 *  gönderiliyor ama store'a işlenmesi bir tık gecikebilir — TradeForm.assetUsd tanımsızken
 *  `store.buy` "No live price" ile reddediyor (PriceList'in REST snapshot'ı bu gecikmeyi
 *  yansıtmaz, o yüzden fiyat orada göründü diye burada da hazır sayılamaz).
 *  MAX butonu assetUsd tanımsızken '0' yazar — bunu koşul olarak kullanıp bekliyoruz. */
export async function waitForLivePrice(page: Page, assetId: string): Promise<void> {
  const input = page.locator(`#trade-units-${assetId}`);
  const maxBtn = page.getByRole('button', { name: 'MAX' });
  await expect(async () => {
    await maxBtn.click();
    await expect(input).not.toHaveValue('0');
  }).toPass({ timeout: 10_000 });
  await input.fill('');
}
