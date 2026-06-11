import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendTelemetry, pingDailyVisit } from './telemetry';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendTelemetry', () => {
  it("sendBeacon yokken fetch ile /api/telemetry'e POST gönderir", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      sendTelemetry('p1', 'visit');
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/telemetry');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.playerId).toBe('p1');
      expect(body.event).toBe('visit');
      expect(typeof body.tsISO).toBe('string');
    } finally {
      globalThis.fetch = real;
    }
  });

  it('fetch reddederse sessizce yutulur (throw etmez)', () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network')));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      expect(() => sendTelemetry('p1', 'share_click')).not.toThrow();
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('pingDailyVisit', () => {
  it('ilk çağrıda gönderir ve tarihi kaydeder', () => {
    const storage = makeStorage();
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      pingDailyVisit(storage, 'p1', '2026-06-10');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(storage.getItem('miras.lastVisitPing')).toBe('2026-06-10');
    } finally {
      globalThis.fetch = real;
    }
  });

  it('aynı gün tekrar çağrılırsa göndermez', () => {
    const storage = makeStorage();
    storage.setItem('miras.lastVisitPing', '2026-06-10');
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      pingDailyVisit(storage, 'p1', '2026-06-10');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = real;
    }
  });

  it('yeni günde tekrar gönderir ve tarihi günceller', () => {
    const storage = makeStorage();
    storage.setItem('miras.lastVisitPing', '2026-06-09');
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    const real = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      pingDailyVisit(storage, 'p1', '2026-06-10');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(storage.getItem('miras.lastVisitPing')).toBe('2026-06-10');
    } finally {
      globalThis.fetch = real;
    }
  });
});
