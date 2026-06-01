import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBinanceFeed, fetchCryptoSnapshot } from './binance';
import type { Cached, CryptoValue } from './types';

/** Test çift'i: gerçek WebSocket arayüzünün minimal taklidi. */
class FakeWS {
  static instances: FakeWS[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  constructor(url: string) { this.url = url; FakeWS.instances.push(this); }
  close() { this.closed = true; this.onclose?.(); }
  emitOpen() { this.onopen?.(); }
  emitTrade(coin: string, price: number) {
    this.onmessage?.({
      data: JSON.stringify({ stream: `${coin.toLowerCase()}usdt@trade`, data: { s: `${coin}USDT`, p: String(price) } }),
    });
  }
  emitError() { this.onerror?.(undefined); }
}

beforeEach(() => { FakeWS.instances = []; });
afterEach(() => { vi.useRealTimers(); });

describe('createBinanceFeed', () => {
  it('combined stream URL kurar (semboller @trade)', () => {
    createBinanceFeed({ symbols: ['BTC', 'ETH'], onPrice() {}, WebSocketImpl: FakeWS as any });
    expect(FakeWS.instances[0].url).toContain('btcusdt@trade');
    expect(FakeWS.instances[0].url).toContain('ethusdt@trade');
  });
  it('WS açılınca onStatus("live")', () => {
    const st: string[] = [];
    createBinanceFeed({ symbols: ['BTC'], onPrice() {}, onStatus: (s) => st.push(s), WebSocketImpl: FakeWS as any });
    FakeWS.instances[0].emitOpen();
    expect(st).toEqual(['live']);
  });
  it('trade mesajında onPrice(coin, usd) — USDT eki soyulur', () => {
    const got: Array<[string, number]> = [];
    createBinanceFeed({ symbols: ['BTC'], onPrice: (c, p) => got.push([c, p]), WebSocketImpl: FakeWS as any });
    FakeWS.instances[0].emitTrade('BTC', 95000.5);
    expect(got).toEqual([['BTC', 95000.5]]);
  });
  it('kapanışta onStatus("stale") + reconnect zamanlar', () => {
    vi.useFakeTimers();
    const st: string[] = [];
    createBinanceFeed({ symbols: ['BTC'], onPrice() {}, onStatus: (s) => st.push(s), WebSocketImpl: FakeWS as any, reconnectMs: 3000 });
    const before = FakeWS.instances.length;
    FakeWS.instances[before - 1].close();
    expect(st).toContain('stale');
    vi.advanceTimersByTime(3000);
    expect(FakeWS.instances.length).toBe(before + 1); // yeni socket
    vi.useRealTimers();
  });
  it('onerror -> close zinciri stale + reconnect tetikler (ağ kopması)', () => {
    vi.useFakeTimers();
    const st: string[] = [];
    createBinanceFeed({ symbols: ['BTC'], onPrice() {}, onStatus: (s) => st.push(s), WebSocketImpl: FakeWS as any, reconnectMs: 3000 });
    const before = FakeWS.instances.length;
    FakeWS.instances[before - 1].emitError(); // onerror -> ws.close() -> onclose
    expect(st).toContain('stale');
    vi.advanceTimersByTime(3000);
    expect(FakeWS.instances.length).toBe(before + 1); // reconnect yeni socket açtı
  });

  it('bozuk JSON frame yutulur (onPrice çağrılmaz, çökmez)', () => {
    const got: Array<[string, number]> = [];
    createBinanceFeed({ symbols: ['BTC'], onPrice: (c, p) => got.push([c, p]), WebSocketImpl: FakeWS as any });
    expect(() => FakeWS.instances[0].onmessage?.({ data: 'bozuk-json{' })).not.toThrow();
    expect(got).toEqual([]);
  });

  it('stop() reconnect etmez', () => {
    vi.useFakeTimers();
    const feed = createBinanceFeed({ symbols: ['BTC'], onPrice() {}, WebSocketImpl: FakeWS as any });
    const before = FakeWS.instances.length;
    feed.stop();
    vi.advanceTimersByTime(10000);
    expect(FakeWS.instances.length).toBe(before); // yeni socket YOK
    vi.useRealTimers();
  });
});

describe('fetchCryptoSnapshot', () => {
  const sample: Cached<CryptoValue> = { value: { prices: { BTC: 95000 } }, asOf: 1, stale: false };
  it('varsayılan sette /api/crypto çağırır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: true, json: async () => sample } as Response)) as unknown as typeof fetch;
    const r = await fetchCryptoSnapshot({ fetchFn: f });
    expect(f).toHaveBeenCalledWith('/api/crypto');
    expect(r.value.prices.BTC).toBe(95000);
  });
  it('coins verilince query string ekler', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: true, json: async () => sample } as Response)) as unknown as typeof fetch;
    await fetchCryptoSnapshot({ coins: ['BTC', 'SOL'], fetchFn: f });
    expect(f).toHaveBeenLastCalledWith('/api/crypto?coins=BTC,SOL');
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    await expect(fetchCryptoSnapshot({ fetchFn: f })).rejects.toThrow('500');
  });
});
