import { describe, expect, it } from 'vitest';
import { dateFormat, formatDateTime, formatRangeText } from './format.js';
import { getZone } from './time.js';

const utc = getZone('UTC');
const berlin = getZone('Europe/Berlin');
/** Intl uses thin and narrow no-break spaces; compare with plain spaces. */
const plain = (text: string) => text.replace(/\s/g, ' ');
const range = (start: number, end: number, locale = 'en-US', zone = utc) =>
	plain(formatRangeText(zone, start, end, locale));

describe('formatRangeText', () => {
	it('shows a whole month as month and year', () => {
		expect(range(Date.UTC(2025, 8, 1), Date.UTC(2025, 9, 1))).toBe('Sep 2025');
		expect(range(Date.UTC(2025, 8, 1), Date.UTC(2025, 9, 1), 'de-DE')).toBe('Sept. 2025');
		expect(range(Date.UTC(2025, 8, 1), Date.UTC(2025, 9, 1), 'ru-RU')).toBe('сент. 2025 г.');
	});

	it('shows several whole months as a month range', () => {
		expect(range(Date.UTC(2025, 8, 1), Date.UTC(2025, 11, 1))).toBe('Sep – Nov 2025');
		expect(range(Date.UTC(2024, 11, 1), Date.UTC(2025, 2, 1))).toBe('Dec 2024 – Feb 2025');
		// Two quarters are not one quarter.
		expect(range(Date.UTC(2025, 0, 1), Date.UTC(2025, 6, 1))).toBe('Jan – Jun 2025');
	});

	it('shows a calendar quarter with the quarter format', () => {
		expect(range(Date.UTC(2025, 0, 1), Date.UTC(2025, 3, 1))).toBe('Q1 2025');
		expect(range(Date.UTC(2025, 9, 1), Date.UTC(2026, 0, 1))).toBe('Q4 2025');
		const ru = formatRangeText(
			utc,
			Date.UTC(2025, 3, 1),
			Date.UTC(2025, 6, 1),
			'ru-RU',
			'{quarter} кв. {year} г.'
		);
		expect(plain(ru)).toBe('2 кв. 2025 г.');
	});

	it('shows whole years as years', () => {
		expect(range(Date.UTC(2025, 0, 1), Date.UTC(2026, 0, 1))).toBe('2025');
		expect(range(Date.UTC(2024, 0, 1), Date.UTC(2026, 0, 1))).toBe('2024 – 2025');
	});

	it('shows other whole days as dates with an inclusive last day', () => {
		expect(range(Date.UTC(2025, 3, 14), Date.UTC(2025, 3, 21))).toBe('Apr 14 – 20, 2025');
		expect(range(Date.UTC(2025, 3, 14), Date.UTC(2025, 3, 15))).toBe('Apr 14, 2025');
	});

	it('shows times when an edge is not at midnight', () => {
		expect(range(Date.UTC(2025, 3, 14, 10), Date.UTC(2025, 3, 14, 11))).toBe(
			'Apr 14, 2025, 10:00 – 11:00 AM'
		);
	});

	it('uses the calendar of the zone', () => {
		// April in Berlin starts at 22:00 UTC on March 31.
		const start = Date.UTC(2025, 2, 31, 22);
		const end = Date.UTC(2025, 3, 30, 22);
		expect(range(start, end, 'de-DE', berlin)).toBe('Apr. 2025');
		expect(range(start, end, 'en-US', utc)).toContain('10:00 PM');
	});
});

describe('formatDateTime', () => {
	it('formats date and time', () => {
		expect(plain(formatDateTime(utc, Date.UTC(2025, 3, 14, 10), 'en-US'))).toBe(
			'Apr 14, 2025, 10:00 AM'
		);
		expect(formatDateTime(berlin, Date.UTC(2025, 3, 14, 10), 'de-DE')).toBe('14.04.2025, 12:00');
	});
});

describe('dateFormat', () => {
	it('caches formatters', () => {
		const options = { month: 'long' } as const;
		expect(dateFormat('en-US', 'UTC', options)).toBe(dateFormat('en-US', 'UTC', options));
	});
});
