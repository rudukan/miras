import { describe, it, expect } from 'vitest';
import { isSameOrigin } from './csrf';

describe('isSameOrigin', () => {
  it('origin app origin ile birebir eşleşirse true', () => {
    expect(isSameOrigin('https://miras.app', 'https://miras.app')).toBe(true);
  });

  it('farklı origin → false (cross-site CSRF)', () => {
    expect(isSameOrigin('https://evil.example', 'https://miras.app')).toBe(false);
  });

  it('origin header yoksa (null) → false', () => {
    expect(isSameOrigin(null, 'https://miras.app')).toBe(false);
  });
});
