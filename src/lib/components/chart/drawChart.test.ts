import { describe, it, expect } from 'vitest';
import { withAlpha } from './drawChart';

describe('withAlpha', () => {
	it('#rrggbb → rgba', () => {
		expect(withAlpha('#00ff66', 0.18)).toBe('rgba(0,255,102,0.18)');
		expect(withAlpha('#a3b8cc', 0.35)).toBe('rgba(163,184,204,0.35)');
	});
	it('boşluk toleransı + büyük harf', () => {
		expect(withAlpha(' #FF3366 ', 1)).toBe('rgba(255,51,102,1)');
	});
	it('tanınmayan biçim olduğu gibi döner (rgb(...), kısa hex vb.)', () => {
		expect(withAlpha('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)');
		expect(withAlpha('#0f6', 0.5)).toBe('#0f6');
	});
});
