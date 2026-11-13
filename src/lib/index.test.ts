import { describe, expect, it } from 'vitest';
import { presetRange } from './index.js';

describe('presetRange', () => {
	const at = new Date(Date.UTC(2025, 3, 16, 13, 47));

	it('returns the calendar period around an instant', () => {
		const { from, to } = presetRange('month', { at, timeZone: 'UTC' });
		expect([from.toISOString(), to.toISOString()]).toEqual([
			'2025-04-01T00:00:00.000Z',
			'2025-05-01T00:00:00.000Z'
		]);
	});

	it('uses the time zone and first day of the week', () => {
		const { from, to } = presetRange('week', { at, timeZone: 'Europe/Berlin', weekStartsOn: 0 });
		expect([from.toISOString(), to.toISOString()]).toEqual([
			'2025-04-12T22:00:00.000Z',
			'2025-04-19T22:00:00.000Z'
		]);
	});

	it('defaults to now', () => {
		const { from, to } = presetRange('day', { timeZone: 'UTC' });
		expect(from.getTime()).toBeLessThanOrEqual(Date.now());
		expect(to.getTime()).toBeGreaterThan(Date.now());
	});
});
