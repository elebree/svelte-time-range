/**
 * Values over time for the chart on the ruler: preparation, bucket size and aggregation.
 *
 * Raw points go in; the chart shows them aggregated per calendar bucket (an hour, a day, a
 * week …) whose size follows the zoom, so the same data reads well at every scale.
 */
import { boundariesAround, intervalMs, type Interval, type Weekday } from './calendar.js';
import type { Zone } from './time.js';

/** One value at one instant. Without `value`, a point counts as 1 (events, records …). */
export interface ChartPoint {
	time: Date | number;
	value?: number;
}

/** How the values in one bucket are combined. */
export type ChartAggregate = 'sum' | 'mean' | 'min' | 'max';

/** Valid points sorted by time, as parallel arrays. */
export interface Series {
	readonly times: Float64Array;
	readonly values: Float64Array;
}

/** One bucket of the chart: `[start, end)` and its value, `null` where there is no data. */
export interface Bin {
	readonly start: number;
	readonly end: number;
	readonly value: number | null;
}

/** Drops points without a valid time or value and sorts the rest by time. */
export function prepareSeries(points: readonly ChartPoint[]): Series {
	const valid: [number, number][] = [];
	for (const point of points) {
		const time = typeof point.time === 'number' ? point.time : point.time?.getTime?.();
		const value = point.value ?? 1;
		if (Number.isFinite(time) && Number.isFinite(value)) valid.push([time!, value]);
	}
	valid.sort((a, b) => a[0] - b[0]);
	const times = new Float64Array(valid.length);
	const values = new Float64Array(valid.length);
	valid.forEach(([time, value], i) => {
		times[i] = time;
		values[i] = value;
	});
	return { times, values };
}

/** Bucket sizes, finest first. Only near-uniform units: no quarter-months or half-months. */
export const BIN_INTERVALS: readonly Interval[] = [
	{ unit: 'minute', step: 1 },
	{ unit: 'minute', step: 5 },
	{ unit: 'minute', step: 15 },
	{ unit: 'minute', step: 30 },
	{ unit: 'hour', step: 1 },
	{ unit: 'hour', step: 3 },
	{ unit: 'hour', step: 6 },
	{ unit: 'hour', step: 12 },
	{ unit: 'day', step: 1 },
	{ unit: 'week', step: 1 },
	{ unit: 'month', step: 1 },
	{ unit: 'month', step: 3 },
	{ unit: 'year', step: 1 },
	{ unit: 'year', step: 5 },
	{ unit: 'year', step: 10 }
];

/** A bucket needs at least this many px: a 4px bar plus the 2px gap to its neighbour. */
export const MIN_BIN_WIDTH = 6;

/** The finest bucket size that is at least `MIN_BIN_WIDTH` px wide at this zoom. */
export function chooseBinInterval(msPerPx: number): Interval {
	return (
		BIN_INTERVALS.find((interval) => intervalMs(interval) / msPerPx >= MIN_BIN_WIDTH) ??
		BIN_INTERVALS[BIN_INTERVALS.length - 1]!
	);
}

/** Index of the first point at or after `time`. */
function firstIndexAtOrAfter(times: Float64Array, time: number): number {
	let low = 0;
	let high = times.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (times[middle]! < time) low = middle + 1;
		else high = middle;
	}
	return low;
}

/**
 * Combines the values of `series` within `[start, end)`. Returns `null` when nothing falls in
 * the range, except for sums, which are 0 inside the data's time span.
 */
export function aggregateRange(
	series: Series,
	start: number,
	end: number,
	aggregate: ChartAggregate
): number | null {
	const { times, values } = series;
	if (times.length === 0 || end <= times[0]! || start > times[times.length - 1]!) return null;
	let count = 0;
	let sum = 0;
	let min = Infinity;
	let max = -Infinity;
	for (let i = firstIndexAtOrAfter(times, start); i < times.length && times[i]! < end; i++) {
		const value = values[i]!;
		count++;
		sum += value;
		if (value < min) min = value;
		if (value > max) max = value;
	}
	if (count === 0) return aggregate === 'sum' ? 0 : null;
	switch (aggregate) {
		case 'sum':
			return sum;
		case 'mean':
			return sum / count;
		case 'min':
			return min;
		case 'max':
			return max;
	}
}

/**
 * Buckets covering `[start, end]` (one boundary beyond each edge) with their aggregated values.
 * Buckets outside the data's time span have no value, so the chart shows "no data" there
 * rather than zeros.
 */
export function binSeries(
	series: Series,
	zone: Zone,
	start: number,
	end: number,
	interval: Interval,
	aggregate: ChartAggregate,
	weekStartsOn: Weekday = 1
): Bin[] {
	const edges = boundariesAround(zone, start, end, interval, weekStartsOn, 2000);
	const bins: Bin[] = [];
	for (let i = 0; i + 1 < edges.length; i++) {
		const binStart = edges[i]!;
		const binEnd = edges[i + 1]!;
		bins.push({
			start: binStart,
			end: binEnd,
			value: aggregateRange(series, binStart, binEnd, aggregate)
		});
	}
	return bins;
}

/** Clean scale tops; finely stepped so the tallest mark fills at least ~80 % of the plot. */
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** The smallest clean number (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10ⁿ) at or above `value`. */
export function niceCeiling(value: number): number {
	if (!(value > 0)) return 1;
	const magnitude = 10 ** Math.floor(Math.log10(value));
	const nice = NICE_STEPS.find((step) => step * magnitude >= value * (1 - 1e-9))!;
	return nice * magnitude;
}
