import { describe, it, expect } from 'vitest';
import { createBoundedRegistry } from './boundedRegistry';

describe('createBoundedRegistry', () => {
  it('aynı anahtar için factory yalnız bir kez çağrılır (cache davranışı)', () => {
    const reg = createBoundedRegistry<number>(3);
    let calls = 0;
    const f = () => ++calls;
    expect(reg.getOrCreate('a', f)).toBe(1);
    expect(reg.getOrCreate('a', f)).toBe(1);
    expect(calls).toBe(1);
  });

  it('maxSize aşılınca en eski giriş atılır (FIFO eviction) ve yeniden yaratılır', () => {
    const reg = createBoundedRegistry<string>(2);
    reg.getOrCreate('a', () => 'A');
    reg.getOrCreate('b', () => 'B');
    reg.getOrCreate('c', () => 'C'); // 'a' evict edilir
    expect(reg.size()).toBe(2);
    let recreated = false;
    reg.getOrCreate('a', () => {
      recreated = true;
      return 'A2';
    });
    expect(recreated).toBe(true);
  });

  it('boyut hiçbir zaman maxSize’ı aşmaz — bellek-DoS savunması', () => {
    const reg = createBoundedRegistry<number>(5);
    for (let i = 0; i < 100; i++) reg.getOrCreate(`k${i}`, () => i);
    expect(reg.size()).toBe(5);
  });
});
