import { describe, it, expect, vi } from 'vitest';
import { fetchFxSnapshot } from './fx';
import type { Cached, FxValue } from './types';

const sample: Cached<FxValue> = {
  value: { usdTry: 40, prices: { THYAO: 300, XAUGRAM: 4000 } },
  asOf: 123,
  stale: false,
};
function okJson(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

describe('fetchFxSnapshot', () => {
  it('varsayılan sette /api/yahoo çağırır ve zarfı döner', async () => {
    const f = vi.fn(() => okJson(sample)) as unknown as typeof fetch;
    const r = await fetchFxSnapshot({ fetchFn: f });
    expect(f).toHaveBeenCalledWith('/api/yahoo');
    expect(r.value.prices.THYAO).toBe(300);
    expect(r.stale).toBe(false);
  });
  it('bist verilince query string ekler', async () => {
    const f = vi.fn(() => okJson(sample)) as unknown as typeof fetch;
    await fetchFxSnapshot({ bist: ['EREGL', 'ASELS'], fetchFn: f });
    expect(f).toHaveBeenLastCalledWith('/api/yahoo?bist=EREGL,ASELS');
  });
  it('HTTP hatasında fırlatır', async () => {
    const f = vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    await expect(fetchFxSnapshot({ fetchFn: f })).rejects.toThrow('500');
  });
});
