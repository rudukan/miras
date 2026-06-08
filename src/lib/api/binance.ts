import type { Cached, CryptoValue } from './types';

/** Minimal WebSocket sözleşmesi (enjekte edilebilir — test'te FakeWebSocket). */
interface WsLike {
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  close(): void;
}
interface WsCtor { new (url: string): WsLike; }

export interface BinanceFeedOptions {
  symbols: string[];                               // ['BTC','ETH'] — coin sembolleri (USDT eki eklenir)
  onPrice: (coin: string, usd: number) => void;    // her trade push'ta
  fxPairs?: string[];                              // ham çiftler ['USDTTRY'] → `${s}@trade`
  onFxRate?: (pair: string, rate: number) => void; // fx çifti trade push'ında
  onStatus?: (status: 'live' | 'stale') => void;   // bağlantı durumu (UI "canlı/eski" rozeti)
  WebSocketImpl?: WsCtor;                           // enjekte (test); yoksa global WebSocket
  url?: string;                                     // base WS URL (test/override)
  reconnectMs?: number;                             // kapanınca yeniden bağlanma gecikmesi (default 3000)
}

export interface BinanceFeed {
  stop(): void;
}

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream';

/** Binance combined trade stream'inden canlı kripto fiyatı (USD) push'lar.
 *  Kapanışta `onStatus('stale')` + otomatik reconnect. `stop()` reconnect'i iptal eder. */
export function createBinanceFeed(opts: BinanceFeedOptions): BinanceFeed {
  const WS: WsCtor = opts.WebSocketImpl ?? ((globalThis as { WebSocket?: WsCtor }).WebSocket as WsCtor);
  const base = opts.url ?? BINANCE_WS_BASE;
  const reconnectMs = opts.reconnectMs ?? 3000;
  const cryptoStreams = opts.symbols.map((s) => `${s.toLowerCase()}usdt@trade`);
  const fxStreams = (opts.fxPairs ?? []).map((s) => `${s.toLowerCase()}@trade`);
  const streams = [...cryptoStreams, ...fxStreams].join('/');
  const fxSet = new Set((opts.fxPairs ?? []).map((s) => s.toUpperCase()));

  let ws: WsLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function connect(): void {
    ws = new WS(`${base}?streams=${streams}`);

    ws.onopen = () => opts.onStatus?.('live');

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { data?: { s?: string; p?: string } };
        const d = msg?.data;
        if (d?.s && d?.p !== undefined) {
          const sym = String(d.s);
          if (fxSet.has(sym)) {
            opts.onFxRate?.(sym, Number(d.p));
          } else {
            // USDT eki soyularak saf coin sembolü (BTC, ETH...) iletilir
            opts.onPrice(sym.replace(/USDT$/, ''), Number(d.p));
          }
        }
      } catch {
        /* bozuk frame yutulur (canlı akışta tek frame kaybı kritik değil) */
      }
    };

    ws.onclose = () => {
      opts.onStatus?.('stale');
      // stopped bayrağı set edilmişse (stop() çağrıldıysa) reconnect zamanlanmaz
      if (!stopped) {
        timer = setTimeout(connect, reconnectMs);
      }
    };

    ws.onerror = () => {
      // Hata durumunda socket kapatılır; onclose üzerinden reconnect mantığı devreye girer
      try { ws?.close(); } catch { /* yut */ }
    };
  }

  connect();

  return {
    stop() {
      stopped = true;
      // Bekleyen reconnect timer'ı iptal et
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      // Mevcut socket'ı kapat; onclose tetiklenecek ama stopped===true olduğundan reconnect olmaz
      try { ws?.close(); } catch { /* yut */ }
    },
  };
}

export interface CryptoSnapshotOptions {
  coins?: string[];
  fetchFn?: typeof fetch;
}

/** `/api/crypto`'dan kripto USD anlık görüntüsü (WS fallback / ilk yükleme). */
export async function fetchCryptoSnapshot(opts: CryptoSnapshotOptions = {}): Promise<Cached<CryptoValue>> {
  const fetchFn = opts.fetchFn ?? fetch;
  const qs = opts.coins?.length ? `?coins=${opts.coins.join(',')}` : '';
  const res = await fetchFn(`/api/crypto${qs}`);
  if (!res.ok) throw new Error(`/api/crypto: HTTP ${res.status}`);
  return (await res.json()) as Cached<CryptoValue>;
}
