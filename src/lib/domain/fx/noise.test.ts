import { describe, it, expect } from 'vitest';
import { pseudoRandom, signedNoise, stringSeed } from './noise';

describe('pseudoRandom', () => {
  it('is deterministic: same (seed, day) -> same value', () => {
    expect(pseudoRandom(42, 100)).toBe(pseudoRandom(42, 100));
  });
  it('returns a value in [0, 1)', () => {
    for (let day = 0; day < 500; day++) {
      const v = pseudoRandom(7, day);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('differs across days (not constant)', () => {
    const values = new Set([0, 1, 2, 3, 4].map((d) => pseudoRandom(7, d)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('signedNoise', () => {
  it('is deterministic', () => {
    expect(signedNoise(42, 100)).toBe(signedNoise(42, 100));
  });
  it('returns a value in [-1, 1)', () => {
    for (let day = 0; day < 500; day++) {
      const v = signedNoise(7, day);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });
  it('salt produces an independent series', () => {
    // Aynı gün, farklı salt -> (neredeyse her zaman) farklı değer
    expect(signedNoise(7, 50, 0)).not.toBe(signedNoise(7, 50, 12345));
  });
});

describe('stringSeed', () => {
  it('is deterministic', () => {
    expect(stringSeed('THYAO')).toBe(stringSeed('THYAO'));
  });
  it('differs for different strings', () => {
    expect(stringSeed('THYAO')).not.toBe(stringSeed('EREGL'));
  });
});
