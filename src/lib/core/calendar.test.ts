import { describe, expect, it } from 'vitest';
import {
	adjacentRange,
	boundariesAround,
	floorTime,
	isBoundary,
	matchPreset,
	nearestBoundary,
	nextBoundary,
	periodAt,
	snapTime,
	stepBoundary,
	type Interval
} from './calendar.js';
import { DAY, HOUR, MINUTE, getZone } from './time.js';

const utc = getZone('UTC');
const berlin = getZone('Europe/Berlin');
const iso = (time: number) => new Date(time).toISOString();
const hour: Interval = { unit: 'hour', step: 1 };
const day: Interval = { unit: 'day', step: 1 };

describe('floorTime', () => {
	const time = Date.UTC(2025, 3, 16, 13, 47, 12); // Wednesday

	it.each([
		[{ unit: 'minute', step: 1 }, '2025-04-16T13:47:00.000Z'],
		[{ unit: 'minute', step: 15 }, '2025-04-16T13:45:00.000Z'],
		[{ unit: 'hour', step: 1 }, '2025-04-16T13:00:00.000Z'],
		[{ unit: 'hour', step: 6 }, '2025-04-16T12:00:00.000Z'],
		[{ unit: 'day', step: 1 }, '2025-04-16T00:00:00.000Z'],
		[{ unit: 'week', step: 1 }, '2025-04-14T00:00:00.000Z'],
		[{ unit: 'month', step: 1 }, '2025-04-01T00:00:00.000Z'],
		[{ unit: 'month', step: 3 }, '2025-04-01T00:00:00.000Z'],
		[{ unit: 'month', step: 6 }, '2025-01-01T00:00:00.000Z'],
		[{ unit: 'year', step: 1 }, '2025-01-01T00:00:00.000Z'],
		[{ unit: 'year', step: 10 }, '2020-01-01T00:00:00.000Z']
	] as const)('floors to %o', (interval, expected) => {
		expect(iso(floorTime(utc, time, interval))).toBe(expected);
	});

	it('respects the first day of the week', () => {
		const week: Interval = { unit: 'week', step: 1 };
		expect(iso(floorTime(utc, time, week, 0))).toBe('2025-04-13T00:00:00.000Z');
		expect(iso(floorTime(utc, time, week, 6))).toBe('2025-04-12T00:00:00.000Z');
	});

	it('returns boundaries unchanged', () => {
		const boundary = Date.UTC(2025, 3, 1);
		expect(floorTime(utc, boundary, { unit: 'month', step: 1 })).toBe(boundary);
	});

	it('uses the wall clock of the zone', () => {
		// 23:30 UTC on April 30 is already May 1 in Berlin.
		expect(iso(floorTime(berlin, Date.UTC(2025, 3, 30, 23, 30), day))).toBe(
			'2025-04-30T22:00:00.000Z'
		);
	});

	it('floors to the correct occurrence of a repeated hour', () => {
		const secondTwoThirty = Date.UTC(2025, 9, 26, 1, 30); // 02:30 CET
		expect(iso(floorTime(berlin, secondTwoThirty, hour))).toBe('2025-10-26T01:00:00.000Z');
	});

	it('aligns hours to half-hour offsets', () => {
		const kolkata = getZone('Asia/Kolkata');
		expect(iso(floorTime(kolkata, Date.UTC(2025, 0, 1, 10, 10), hour))).toBe(
			'2025-01-01T09:30:00.000Z'
		);
	});
});

describe('periodAt', () => {
	it.each([
		['hour', '2025-04-16T13:00:00.000Z', '2025-04-16T14:00:00.000Z'],
		['day', '2025-04-16T00:00:00.000Z', '2025-04-17T00:00:00.000Z'],
		['week', '2025-04-14T00:00:00.000Z', '2025-04-21T00:00:00.000Z'],
		['month', '2025-04-01T00:00:00.000Z', '2025-05-01T00:00:00.000Z'],
		['quarter', '2025-04-01T00:00:00.000Z', '2025-07-01T00:00:00.000Z'],
		['year', '2025-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
	] as const)('returns the %s around a time', (preset, start, end) => {
		const [a, b] = periodAt(utc, Date.UTC(2025, 3, 16, 13, 47), preset);
		expect([iso(a), iso(b)]).toEqual([start, end]);
	});

	it('produces 23 and 25 hour days at DST transitions', () => {
		const [springStart, springEnd] = periodAt(berlin, Date.UTC(2025, 2, 30, 12), 'day');
		expect(springEnd - springStart).toBe(23 * HOUR);
		const [fallStart, fallEnd] = periodAt(berlin, Date.UTC(2025, 9, 26, 12), 'day');
		expect(fallEnd - fallStart).toBe(25 * HOUR);
	});

	it('handles February in leap years', () => {
		const [a, b] = periodAt(utc, Date.UTC(2024, 1, 10), 'month');
		expect(b - a).toBe(29 * DAY);
	});
});

describe('nextBoundary / boundariesAround', () => {
	it('lists every hour of the fall-back day, including the repeated one', () => {
		const [dayStart, dayEnd] = periodAt(berlin, Date.UTC(2025, 9, 26, 12), 'day');
		const hours = boundariesAround(berlin, dayStart, dayEnd, hour);
		expect(hours).toHaveLength(26); // 25 hours + the closing boundary
		for (let i = 1; i < hours.length; i++) expect(hours[i]! - hours[i - 1]!).toBe(HOUR);
	});

	it('keeps 3-hour steps on wall-clock multiples of 3 across spring-forward', () => {
		const interval: Interval = { unit: 'hour', step: 3 };
		const [dayStart, dayEnd] = periodAt(berlin, Date.UTC(2025, 2, 30, 12), 'day');
		const labels = boundariesAround(berlin, dayStart, dayEnd, interval).map(
			(time) => berlin.parts(time).hour
		);
		expect(labels).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 0]);
	});

	it('keeps 3-hour steps strictly increasing across fall-back', () => {
		const interval: Interval = { unit: 'hour', step: 3 };
		const [dayStart, dayEnd] = periodAt(berlin, Date.UTC(2025, 9, 26, 12), 'day');
		const times = boundariesAround(berlin, dayStart, dayEnd, interval);
		for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
		expect(times.map((time) => berlin.parts(time).hour)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 0]);
	});

	it('covers the requested range with one boundary beyond each edge', () => {
		const start = Date.UTC(2025, 3, 10, 5);
		const end = Date.UTC(2025, 3, 12, 5);
		const days = boundariesAround(utc, start, end, day);
		expect(days[0]!).toBeLessThanOrEqual(start);
		expect(days.at(-1)!).toBeGreaterThanOrEqual(end);
		expect(days).toHaveLength(4);
	});

	it('steps months of different lengths', () => {
		const month: Interval = { unit: 'month', step: 1 };
		expect(iso(nextBoundary(utc, Date.UTC(2025, 0, 1), month))).toBe('2025-02-01T00:00:00.000Z');
		expect(iso(nextBoundary(utc, Date.UTC(2025, 1, 1), month))).toBe('2025-03-01T00:00:00.000Z');
	});

	it('respects the limit', () => {
		const minute: Interval = { unit: 'minute', step: 1 };
		expect(boundariesAround(utc, 0, DAY, minute, 1, 10)).toHaveLength(10);
	});
});

describe('nearestBoundary / stepBoundary / snapTime', () => {
	const april = Date.UTC(2025, 3, 1);

	it('finds the nearest boundary', () => {
		expect(nearestBoundary(utc, april + 10 * HOUR, day)).toBe(april);
		expect(nearestBoundary(utc, april + 14 * HOUR, day)).toBe(april + DAY);
		expect(nearestBoundary(utc, april + 12 * HOUR, day)).toBe(april);
	});

	it('steps to the next and previous boundary', () => {
		expect(stepBoundary(utc, april, day, 1)).toBe(april + DAY);
		expect(stepBoundary(utc, april, day, -1)).toBe(april - DAY);
		expect(stepBoundary(utc, april + HOUR, day, 1)).toBe(april + DAY);
		expect(stepBoundary(utc, april + HOUR, day, -1)).toBe(april);
	});

	it('snaps only within the threshold', () => {
		expect(snapTime(utc, april + 5 * MINUTE, hour, 10 * MINUTE)).toBe(april);
		expect(snapTime(utc, april + 15 * MINUTE, hour, 10 * MINUTE)).toBeNull();
		expect(snapTime(utc, april, hour, 10 * MINUTE)).toBeNull();
	});
});

describe('day steps within a month', () => {
	const days = (interval: Interval, year: number, month: number) =>
		boundariesAround(utc, Date.UTC(year, month, 1), Date.UTC(year, month + 1, 1), interval).map(
			(time) => new Date(time).getUTCDate()
		);

	it('splits months into quarters starting on the 1st, 8th, 15th and 22nd', () => {
		const quarters: Interval = { unit: 'day', step: 7 };
		expect(days(quarters, 2025, 0)).toEqual([1, 8, 15, 22, 1]); // 31 days
		expect(days(quarters, 2025, 1)).toEqual([1, 8, 15, 22, 1]); // 28 days
		expect(days(quarters, 2025, 3)).toEqual([1, 8, 15, 22, 1]); // 30 days
	});

	it('splits months into halves starting on the 1st and 16th', () => {
		const halves: Interval = { unit: 'day', step: 15 };
		expect(days(halves, 2025, 0)).toEqual([1, 16, 1]);
		expect(days(halves, 2024, 1)).toEqual([1, 16, 1]);
	});

	it('floors the end of a month into the last step', () => {
		const quarters: Interval = { unit: 'day', step: 7 };
		expect(iso(floorTime(utc, Date.UTC(2025, 0, 31, 12), quarters))).toBe(
			'2025-01-22T00:00:00.000Z'
		);
	});
});

describe('isBoundary', () => {
	it('tells whether an instant starts a unit', () => {
		expect(isBoundary(utc, Date.UTC(2025, 3, 1), 'month')).toBe(true);
		expect(isBoundary(utc, Date.UTC(2025, 3, 2), 'month')).toBe(false);
		expect(isBoundary(berlin, Date.UTC(2025, 2, 31, 22), 'month')).toBe(true);
	});
});

describe('matchPreset / adjacentRange', () => {
	it('recognises calendar periods', () => {
		expect(matchPreset(utc, Date.UTC(2025, 3, 1), Date.UTC(2025, 4, 1))).toBe('month');
		expect(matchPreset(utc, Date.UTC(2025, 3, 14), Date.UTC(2025, 3, 21))).toBe('week');
		expect(matchPreset(utc, Date.UTC(2025, 3, 15), Date.UTC(2025, 3, 22))).toBeNull();
		expect(matchPreset(utc, Date.UTC(2025, 0, 1), Date.UTC(2026, 0, 1))).toBe('year');
		expect(matchPreset(utc, Date.UTC(2025, 9, 1), Date.UTC(2026, 0, 1))).toBe('quarter');
		// Three months that are not a calendar quarter.
		expect(matchPreset(utc, Date.UTC(2025, 1, 1), Date.UTC(2025, 4, 1))).toBeNull();
	});

	it('moves quarters by one quarter, across years', () => {
		const [a, b] = adjacentRange(utc, Date.UTC(2025, 9, 1), Date.UTC(2026, 0, 1), 1);
		expect([iso(a), iso(b)]).toEqual(['2026-01-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z']);
		const [c, d] = adjacentRange(utc, Date.UTC(2025, 0, 1), Date.UTC(2025, 3, 1), -1);
		expect([iso(c), iso(d)]).toEqual(['2024-10-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z']);
	});

	it('finds quarters in the zone', () => {
		const [a, b] = periodAt(berlin, Date.UTC(2025, 4, 10), 'quarter');
		expect([iso(a), iso(b)]).toEqual(['2025-03-31T22:00:00.000Z', '2025-06-30T22:00:00.000Z']);
	});

	it('depends on the zone', () => {
		const start = Date.UTC(2025, 3, 1);
		const end = Date.UTC(2025, 4, 1);
		expect(matchPreset(berlin, start, end)).toBeNull();
	});

	it('moves calendar periods by one period', () => {
		const [a, b] = adjacentRange(utc, Date.UTC(2025, 3, 1), Date.UTC(2025, 4, 1), 1);
		expect([iso(a), iso(b)]).toEqual(['2025-05-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z']);
		const [c, d] = adjacentRange(utc, Date.UTC(2025, 2, 1), Date.UTC(2025, 3, 1), -1);
		expect([iso(c), iso(d)]).toEqual(['2025-02-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z']);
	});

	it('moves other ranges by their duration', () => {
		const start = Date.UTC(2025, 3, 3, 8);
		const [a, b] = adjacentRange(utc, start, start + 5 * HOUR, -1);
		expect([a, b]).toEqual([start - 5 * HOUR, start]);
	});
});
