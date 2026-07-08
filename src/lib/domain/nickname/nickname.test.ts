import { describe, it, expect } from 'vitest';
import { validateNickname } from './nickname';

describe('validateNickname', () => {
  it('geçerli adı trim edip kabul eder', () => {
    expect(validateNickname('  MirasBaronu42 ')).toEqual({ ok: true, value: 'MirasBaronu42' });
  });
  it('Türkçe karakterlere izin verir', () => {
    expect(validateNickname('Ağaoğlu_Şükrü').ok).toBe(true);
  });
  it('3 karakterden kısayı reddeder', () => {
    expect(validateNickname('ab')).toEqual({ ok: false, reason: 'Takma ad 3-20 karakter olmalı' });
  });
  it('20 karakterden uzunu reddeder', () => {
    expect(validateNickname('a'.repeat(21)).ok).toBe(false);
  });
  it('boşluk ve özel karakterleri reddeder', () => {
    expect(validateNickname('miras baronu').ok).toBe(false);
    expect(validateNickname('baron<script>').ok).toBe(false);
  });
  it('küfür içeren adı reddeder (büyük/küçük ve İ/ı normalize)', () => {
    expect(validateNickname('AmKoyan42')).toEqual({ ok: false, reason: 'Takma ad uygunsuz ifade içeriyor' });
    expect(validateNickname('sIkTIrGit')).toEqual({ ok: false, reason: 'Takma ad uygunsuz ifade içeriyor' });
  });
  it('blocklist kelimesini başka kelimenin içinde de yakalar', () => {
    expect(validateNickname('XsalakX').ok).toBe(false);
  });
});
