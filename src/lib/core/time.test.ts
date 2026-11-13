import { describe, expect, it } from 'vitest';
import { DAY, HOUR, getZone, localTimeZone } from './time.js';

const iso = (time: number) => new Date(time).toISOString();

describe('getZone', () => {
	it('caches zones per identifier', () => {
		expect(getZone('Europe/Berlin')).toBe(getZone('Europe/Berlin'));
	});

	it('throws a RangeError for unknown time zones', () => {
		expect(() => getZone('Mars/Olympus_Mons')).toThrow(RangeError);
	});

	it('resolves the local time zone to a usable identifier', () => {
		expect(() => getZone(localTimeZone())).not.toThrow();
	});
});

describe('UTC zone', () => {
	const utc = getZone('UTC');

	it('has no offset', () => {
		expect(utc.offset(Date.UTC(2025, 6, 1))).toBe(0);
	});

	it('returns wall-clock parts', () => {
		expect(utc.parts(Date.UTC(2025, 3, 14, 10, 30))).toEqual({
			year: 2025,
			month: 3,
			day: 14,
			hour: 10,
			minute: 30,
			weekday: 1
		});
	});

	it('normalises overflowing fields like Date.UTC', () => {
		expect(utc.instant(2025, 12, 1)).toBe(Date.UTC(2026, 0, 1));
		expect(utc.instant(2025, 2, 0)).toBe(Date.UTC(2025, 1, 28));
	});
});

describe('Europe/Berlin', () => {
	const berlin = getZone('Europe/Berlin');

	it('knows standard and daylight saving offsets', () => {
		expect(berlin.offset(Date.UTC(2025, 0, 15))).toBe(HOUR);
		expect(berlin.offset(Date.UTC(2025, 6, 15))).toBe(2 * HOUR);
	});

	it('switches offset exactly at the transition', () => {
		const springForward = Date.UTC(2025, 2, 30, 1);
		expect(berlin.offset(springForward - 1)).toBe(HOUR);
		expect(berlin.offset(springForward)).toBe(2 * HOUR);
	});

	it('converts wall-clock time to instants', () => {
		expect(iso(berlin.instant(2025, 3, 1))).toBe('2025-03-31T22:00:00.000Z');
		expect(iso(berlin.instant(2025, 0, 1))).toBe('2024-12-31T23:00:00.000Z');
	});

	it('round-trips through parts', () => {
		const time = Date.UTC(2025, 6, 4, 13, 45);
		const p = berlin.parts(time);
		expect(berlin.instant(p.year, p.month, p.day, p.hour, p.minute)).toBe(time);
	});

	it('moves wall times inside the spring-forward gap forward', () => {
		// 02:30 does not exist on 2025-03-30; it becomes 03:30 CEST.
		expect(iso(berlin.instant(2025, 2, 30, 2, 30))).toBe('2025-03-30T01:30:00.000Z');
		expect(iso(berlin.instant(2025, 2, 30, 3))).toBe('2025-03-30T01:00:00.000Z');
	});

	it('resolves repeated wall times in the fall-back overlap to the earlier instant', () => {
		// 02:30 happens twice on 2025-10-26: first in CEST (00:30Z), then in CET (01:30Z).
		expect(iso(berlin.instant(2025, 9, 26, 2, 30))).toBe('2025-10-26T00:30:00.000Z');
		expect(iso(berlin.instant(2025, 9, 26, 3))).toBe('2025-10-26T02:00:00.000Z');
	});

	it('reports parts on both sides of the overlap', () => {
		expect(berlin.parts(Date.UTC(2025, 9, 26, 0, 30)).hour).toBe(2);
		expect(berlin.parts(Date.UTC(2025, 9, 26, 1, 30)).hour).toBe(2);
	});
});

describe('zones with non-hour offsets', () => {
	it('handles Asia/Kolkata (+05:30)', () => {
		const kolkata = getZone('Asia/Kolkata');
		expect(kolkata.offset(Date.UTC(2025, 0, 1))).toBe(5.5 * HOUR);
		expect(iso(kolkata.instant(2025, 0, 1))).toBe('2024-12-31T18:30:00.000Z');
	});

	it('handles America/St_Johns (-03:30 / -02:30)', () => {
		const stJohns = getZone('America/St_Johns');
		expect(stJohns.offset(Date.UTC(2025, 0, 1))).toBe(-3.5 * HOUR);
		expect(stJohns.offset(Date.UTC(2025, 6, 1))).toBe(-2.5 * HOUR);
		const start = stJohns.instant(2025, 6, 1);
		expect(stJohns.instant(2025, 6, 2) - start).toBe(DAY);
	});
});
