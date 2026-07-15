import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chooseSource, createCloudPush, createSavesPusher, type ChooseSourceInput } from './cloudSave';
import type { SaveEnvelopeV1 } from './savegame';

const env = { v: 1, game: {} as never, activeBist: [] } as unknown as SaveEnvelopeV1;

function inp(over: Partial<ChooseSourceInput>): ChooseSourceInput {
  return {
    localTouchedAt: null, localCreatedAt: null,
    cloudUpdatedAt: null, cloudCreatedAt: null,
    resetAt: null, localOwnerId: null, sessionUserId: null,
    ...over,
  };
}
const T0 = Date.parse('2026-07-04T10:00:00Z');

describe('chooseSource v2', () => {
  it('ikisi de yoksa none; tek taraf varsa o', () => {
    expect(chooseSource(inp({}))).toBe('none');
    expect(chooseSource(inp({ localCreatedAt: T0, localTouchedAt: T0 }))).toBe('local');
    expect(chooseSource(inp({ cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z' }))).toBe('cloud');
  });

  it('tombstone: resetAt öncesi kurulan bulut oyunu diskalifiye (eşitlik dahil)', () => {
    expect(chooseSource(inp({ cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-05T10:00:00Z', resetAt: T0 }))).toBe('none');
    expect(chooseSource(inp({ cloudCreatedAt: T0 + 1, cloudUpdatedAt: '2026-07-05T10:00:00Z', resetAt: T0 }))).toBe('cloud');
  });

  it('jenerasyon: yeni kurulan oyun, eski oyunun daha taze kaydını yener', () => {
    // local yeni oyun (dün kuruldu), cloud eski oyun (geçen ay) ama updated_at daha taze:
    expect(chooseSource(inp({
      localCreatedAt: T0 + 86_400_000, localTouchedAt: T0 + 86_400_000,
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-06T10:00:00Z',
    }))).toBe('local');
    // tersi: cloud yeni oyun → cloud
    expect(chooseSource(inp({
      localCreatedAt: T0, localTouchedAt: T0 + 999_999_999,
      cloudCreatedAt: T0 + 86_400_000, cloudUpdatedAt: '2026-07-05T10:00:00Z',
    }))).toBe('cloud');
  });

  it('aynı jenerasyonda eski kural: updated_at > touchedAt → cloud, eşitlikte local', () => {
    expect(chooseSource(inp({
      localCreatedAt: T0, localTouchedAt: T0 + 5000,
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z',
    }))).toBe('local');
    expect(chooseSource(inp({
      localCreatedAt: T0, localTouchedAt: T0 - 5000,
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z',
    }))).toBe('cloud');
  });

  it('yabancı local: bulut varsa bulut sessizce kazanır (K5), yoksa local-adopt', () => {
    const yabanci = { localCreatedAt: T0 + 86_400_000, localTouchedAt: T0 + 86_400_000,
      localOwnerId: 'user-X', sessionUserId: 'user-Y' };
    expect(chooseSource(inp({ ...yabanci, cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z' }))).toBe('cloud');
    expect(chooseSource(inp(yabanci))).toBe('local-adopt');
  });

  it('ownerId null (legacy kayıt) yabancı SAYILMAZ — normal kurallar işler', () => {
    expect(chooseSource(inp({
      localCreatedAt: T0 + 86_400_000, localTouchedAt: T0 + 86_400_000,
      localOwnerId: null, sessionUserId: 'user-Y',
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-06T10:00:00Z',
    }))).toBe('local');
  });

  it('local envelope yokken touchedAt tek başına local seçtiremez', () => {
    expect(chooseSource(inp({ localTouchedAt: T0 + 999,
      cloudCreatedAt: T0, cloudUpdatedAt: '2026-07-04T10:00:00Z' }))).toBe('cloud');
  });
});

describe('createCloudPush', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounce süresi dolunca son envelope ile push eder', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 30_000 });
    sync.enable();
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
    sync.enable();
    await sync.flush();
    expect(push).not.toHaveBeenCalled();
    sync.schedule(env);
    await sync.flush();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('push hatası yutulur (oyun localStorage ile devam eder), sonraki schedule yeniden dener', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.enable();
    sync.schedule(env);
    await vi.advanceTimersByTimeAsync(1000);
    sync.schedule(env);
    await vi.advanceTimersByTimeAsync(1000);
    expect(push).toHaveBeenCalledTimes(2);
  });
});

describe('createCloudPush v2 — kapı/cancel/flush', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enable() çağrılmadan schedule no-op (boot uzlaşması kapısı)', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.schedule(env);
    await vi.advanceTimersByTimeAsync(5000);
    expect(push).not.toHaveBeenCalled();
    expect(await sync.flush()).toBe(true); // bekleyen yok
  });

  it('cancel() bekleyen push ve timer\'ı iptal eder', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.enable();
    sync.schedule(env);
    sync.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(push).not.toHaveBeenCalled();
    expect(await sync.flush()).toBe(true);
  });

  it('flush başarıda true, push hatasında false döner', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const sync = createCloudPush(push, { debounceMs: 1000 });
    sync.enable();
    sync.schedule(env);
    expect(await sync.flush()).toBe(false); // ilk push patladı
    sync.schedule(env);
    expect(await sync.flush()).toBe(true);
  });
});

describe('createCloudPush v3 — başarısız push envelope\'u korur (P0 fix)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('başarısız flush envelope kaybetmez; ikinci flush AYNI envelope ile yeniden dener', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const sync = createCloudPush(push, { debounceMs: 1 });
    sync.enable();
    sync.schedule(env);
    expect(await sync.flush()).toBe(false);
    expect(await sync.flush()).toBe(true);       // YENİ: true (gerçek retry)
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenNthCalledWith(2, env); // aynı envelope
  });

  it('push hâlâ patlıyorsa ikinci flush da false döner', async () => {
    const push = vi.fn().mockRejectedValue(new Error('boom'));
    const sync = createCloudPush(push, { debounceMs: 1 });
    sync.enable();
    sync.schedule(env);
    expect(await sync.flush()).toBe(false);
    expect(await sync.flush()).toBe(false);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('uçuş sırasında schedule edilen YENİ envelope, başarısız eskiyi ezer', async () => {
    const newerEnv = { v: 1, game: { gold: 999 }, activeBist: [] } as unknown as SaveEnvelopeV1;
    let callCount = 0;
    const push = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // uçuş sırasında yeni envelope schedule et
        sync.schedule(newerEnv);
        throw new Error('boom');
      }
    });
    const sync = createCloudPush(push, { debounceMs: 1 });
    sync.enable();
    sync.schedule(env);
    expect(await sync.flush()).toBe(false); // ilk push patladı, ama uçuşta newerEnv scheduled
    expect(await sync.flush()).toBe(true);  // newerEnv gönderilir
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenNthCalledWith(2, newerEnv); // yeni env gönderildi
  });
});

describe('createCloudPush v4 — cancel() uçuştaki push ile yarışır (review bulgusu)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cancel() uçuştaki push başarısız olursa envelope diriltilmez', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const sync = createCloudPush(push, { debounceMs: 1 });
    sync.enable();
    sync.schedule(env);
    const flushPromise = sync.flush(); // push başladı (uçuşta), henüz reject olmadı
    sync.cancel(); // handleResetSave senaryosu: uçuş sırasında iptal
    expect(await flushPromise).toBe(false); // push başarısız oldu
    expect(push).toHaveBeenCalledTimes(1);
    expect(await sync.flush()).toBe(true); // bekleyen yok: envelope DİRİLTİLMEDİ
    expect(push).toHaveBeenCalledTimes(1); // push tekrar ÇAĞRILMADI (resurrection yok)
  });

  it('cancel() sonrası yeni schedule() cancelled bayrağını sıfırlar (sonraki retry normal çalışır)', async () => {
    const push = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const sync = createCloudPush(push, { debounceMs: 1 });
    sync.enable();
    sync.schedule(env);
    sync.cancel(); // hiçbir push uçuşta değilken iptal
    sync.schedule(env); // yeni, meşru kayıt — cancelled sıfırlanmalı
    expect(await sync.flush()).toBe(false); // push başarısız
    expect(await sync.flush()).toBe(true);  // retry normal çalışır, envelope dirilir
    expect(push).toHaveBeenCalledTimes(2);
  });
});

describe('createSavesPusher', () => {
  it('upsert {error} dönerse throw eder', async () => {
    const push = createSavesPusher({
      getUser: async () => ({ id: 'u1' }),
      upsertSave: async () => ({ error: { message: 'permission denied' } }),
      getOwnerId: () => 'u1',
    });
    await expect(push(env)).rejects.toThrow('permission denied');
  });
  it('oturum yoksa throw eder (teslim edilemedi)', async () => {
    const push = createSavesPusher({ getUser: async () => null, upsertSave: async () => ({ error: null }), getOwnerId: () => 'u1' });
    await expect(push(env)).rejects.toThrow();
  });
  it('yabancı ownerId: upsert ÇAĞRILMADAN sessiz başarı', async () => {
    const upsertSave = vi.fn(async () => ({ error: null }));
    const push = createSavesPusher({ getUser: async () => ({ id: 'u1' }), upsertSave, getOwnerId: () => 'BAŞKASI' });
    await expect(push(env)).resolves.toBeUndefined();
    expect(upsertSave).not.toHaveBeenCalled();
  });
  it('başarıda upsert doğru argümanlarla çağrılır', async () => {
    const upsertSave = vi.fn(async () => ({ error: null }));
    const push = createSavesPusher({ getUser: async () => ({ id: 'u1' }), upsertSave, getOwnerId: () => 'u1' });
    await push(env);
    expect(upsertSave).toHaveBeenCalledWith('u1', env);
  });
});
