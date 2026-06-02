import { describe, it, expect } from 'vitest';
import { CONTEXT_CARD } from './contextCard';

describe('CONTEXT_CARD', () => {
	it('boş olmayan, tek satır küratörlü bağlam', () => {
		expect(CONTEXT_CARD.trim().length).toBeGreaterThan(0);
		expect(CONTEXT_CARD).not.toContain('\n');
	});
});
