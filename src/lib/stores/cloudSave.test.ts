import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chooseSource, createCloudPush } from './cloudSave';
import type { SaveEnvelopeV1 } from './savegame';

const env = { v: 1, game: {} as never, activeBist: [] } as unknown as SaveEnvelopeV1;

describe('chooseSource', () => {
  it('ikisi de yoksa none', () => {
    expect(chooseSource(null, null)).toBe('none');
  });
  it('yalnız local varsa local, yalnız cloud varsa cloud', () => {
    expect(chooseSource(1000, null)).toBe('local');
    expect(chooseSource(null, '2026-07-04T10:00:00Z')).toBe('cloud');
  });
  it('ikisi de varsa yeni olan kazanır', () => {
    const t = Date.parse('2026-07-04T10:00:00Z');
    expect(chooseSource(t + 5000, '2026-07-04T10:00:00Z')).toBe('local');
    expect(chooseSource(t - 5000, '2026-07-04T10:00:00Z')).toBe('cloud');
  });
  it('eşitlikte local kazanır (gereksiz reload yok)', () => {
    const t = Date.parse('2026-07-04T10:00:00Z');
    expect(chooseSource(t, '2026-07-04T10:00:00Z')).toBe('local');
  });
});

describe('createCloudPush', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounce süresi dolunca son envelope ile push eder', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 30_000 });
    sync.schedule(env);
    sync.schedule(env); // üst üste çağrı tek push'a düşer
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(env);
  });

  it('flush bekleyen push varsa hemen gönderir, yoksa hiçbir şey yapmaz', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 30_000 });
    await sync.flush();
    expect(push).not.toHaveBeenCalled();
    sync.schedule(env);
    await sync.flush();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('push hatası yutulur (oyun localStorage ile devam eder), sonraki schedule yeniden dener', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.schedule(env);
    await vi.advanceTimersByTimeAsync(1000);
    sync.schedule(env);
    await vi.advanceTimersByTimeAsync(1000);
    expect(push).toHaveBeenCalledTimes(2);
  });
});
