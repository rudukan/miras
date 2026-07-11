import { describe, it, expect } from 'vitest';
import { initialPhase } from './bootPhase';

describe('initialPhase (spec §4.A)', () => {
  it('local kayıt varsa oturumdan bağımsız intro (flash yok)', () => {
    expect(initialPhase(true, undefined)).toBe('intro');
    expect(initialPhase(true, true)).toBe('intro');
    expect(initialPhase(true, false)).toBe('intro');
  });
  it('kayıt yok + oturum bilinmiyor → boot (BAĞLANIYOR…)', () => {
    expect(initialPhase(false, undefined)).toBe('boot');
  });
  it('kayıt yok + oturum var → intro (hidrasyon boot ekranında beklenir)', () => {
    expect(initialPhase(false, true)).toBe('intro');
  });
  it('kayıt yok + oturum yok → welcome', () => {
    expect(initialPhase(false, false)).toBe('welcome');
  });
});
