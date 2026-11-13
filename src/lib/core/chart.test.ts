import { describe, expect, it } from 'vitest';
import {
	aggregateRange,
	binSeries,
	chooseBinInterval,
	niceCeiling,
	prepareSeries,
	MIN_BIN_WIDTH
} from './chart.js';
import { intervalMs } from './calendar.js';
import { DAY, HOUR, getZone } from './time.js';

const utc = getZone('UTC');
const berlin = getZone('Europe/Berlin');
const at = (day: number, hour = 0) => Date.UTC(2025, 3, day, hour);

describe('prepareSeries', () => {
	it('sorts points, counts points without a value as 1 and drops invalid ones', () => {
		const series = prepareSeries([
			{ time: at(3), value: 5 },
			{ time: new Date(at(1)) },
			{ time: new Date(Number.NaN), value: 1 },
			{ time: at(2), value: Number.NaN },
			{ time: at(2), value: -2 }
		]);
		expect([...series.times]).toEqual([at(1), at(2), at(3)]);
		expect([...series.values]).toEqual([1, -2, 5]);
	});
});

describe('aggregateRange', () => {
	const series = prepareSeries([
		{ time: at(1, 1), value: 2 },
		{ time: at(1, 5), value: 6 },
		{ time: at(3, 0), value: 4 }
	]);

	it.each([
		['sum', 8],
		['mean', 4],
		['min', 2],
		['max', 6]
	] as const)('combines values with %s', (aggregate, expected) => {
		expect(aggregateRange(series, at(1), at(2), aggregate)).toBe(expected);
	});

	it('includes the start and excludes the end', () => {
		expect(aggregateRange(series, at(3), at(4), 'sum')).toBe(4);
		expect(aggregateRange(series, at(2), at(3), 'sum')).toBe(0);
	});

	it('reports gaps inside the data as zero for sums and as no data otherwise', () => {
		expect(aggregateRange(series, at(2), at(3), 'sum')).toBe(0);
		expect(aggregateRange(series, at(2), at(3), 'mean')).toBeNull();
	});

	it('has no value outside the time span of the data', () => {
		expect(aggregateRange(series, at(10), at(11), 'sum')).toBeNull();
		expect(aggregateRange(prepareSeries([]), at(1), at(2), 'sum')).toBeNull();
	});
});

describe('chooseBinInterval', () => {
	it('picks the finest bucket that is wide enough', () => {
		// 7 days on 900 px: an hour is 5.4 px, too narrow; 3 hours are 16 px.
		expect(chooseBinInterval((7 * DAY) / 900)).toEqual({ unit: 'hour', step: 3 });
		expect(chooseBinInterval((4 * DAY) / 900)).toEqual({ unit: 'hour', step: 1 });
		expect(chooseBinInterval((380 * DAY) / 900)).toEqual({ unit: 'week', step: 1 });
		expect(chooseBinInterval((4 * 365 * DAY) / 900)).toEqual({ unit: 'month', step: 1 });
	});

	it('never makes buckets narrower than the minimum', () => {
		for (const msPerPx of [1e3, 1e5, 1e7, 1e9]) {
			expect(intervalMs(chooseBinInterval(msPerPx)) / msPerPx).toBeGreaterThanOrEqual(
				MIN_BIN_WIDTH
			);
		}
	});
});

describe('binSeries', () => {
	it('sums points per calendar bucket', () => {
		const series = prepareSeries([
			{ time: at(1, 2) },
			{ time: at(1, 20) },
			{ time: at(2, 9) },
			{ time: at(4, 9), value: 3 }
		]);
		// Buckets cover [Apr 1, Apr 6): one per day.
		const bins = binSeries(series, utc, at(1), at(6), { unit: 'day', step: 1 }, 'sum');
		expect(bins.map(({ start, value }) => [new Date(start).getUTCDate(), value])).toEqual([
			[1, 2],
			[2, 1],
			[3, 0],
			[4, 3],
			[5, null] // after the last point: no data
		]);
	});

	it('follows the calendar of the zone, including 23-hour days', () => {
		const springForward = Date.UTC(2025, 2, 30, 12);
		const hourly = prepareSeries(
			Array.from({ length: 48 }, (_, i) => ({ time: springForward - 24 * HOUR + i * HOUR }))
		);
		const bins = binSeries(
			hourly,
			berlin,
			springForward - 12 * HOUR,
			springForward + 12 * HOUR,
			{ unit: 'day', step: 1 },
			'sum'
		);
		const day = bins.find((bin) => bin.start <= springForward && springForward < bin.end)!;
		expect(day.end - day.start).toBe(23 * HOUR);
		expect(day.value).toBe(23);
	});
});

describe('niceCeiling', () => {
	it.each([
		[0, 1],
		[1, 1],
		[1047, 1200],
		[1600, 2000],
		[2600, 3000],
		[7, 8],
		[0.42, 0.5]
	])('rounds %d up to %d', (value, expected) => {
		expect(niceCeiling(value)).toBeCloseTo(expected, 9);
	});
});
