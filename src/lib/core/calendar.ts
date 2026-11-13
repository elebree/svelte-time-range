/**
 * Calendar arithmetic on top of {@link Zone}: aligning instants to calendar boundaries,
 * stepping between boundaries and computing preset periods (hour, day, week, month, quarter, year).
 */
import { DAY, HOUR, MINUTE, MONTH, WEEK, YEAR, type Zone } from './time.js';

export type TimeUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** A calendar interval such as "15 minutes", "1 week" or "3 months". */
export interface Interval {
	readonly unit: TimeUnit;
	/**
	 * Multiple of the unit. Must be 1 for `week`. `day` steps count from the 1st of each month,
	 * and a short remainder at the end of a month joins the previous step.
	 */
	readonly step: number;
}

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A calendar period that can be selected with one click. Quarters are Jan–Mar, Apr–Jun, … */
export type Preset = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export const PRESETS: readonly Preset[] = ['hour', 'day', 'week', 'month', 'quarter', 'year'];

/** Approximate unit lengths, for estimates only. */
export const UNIT_MS: Readonly<Record<TimeUnit, number>> = {
	minute: MINUTE,
	hour: HOUR,
	day: DAY,
	week: WEEK,
	month: MONTH,
	year: YEAR
};

export const intervalMs = (interval: Interval): number => UNIT_MS[interval.unit] * interval.step;

const mod = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;

function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The latest boundary of `interval` at or before `time`. */
export function floorTime(
	zone: Zone,
	time: number,
	interval: Interval,
	weekStartsOn: Weekday = 1
): number {
	const { unit, step } = interval;
	if (unit === 'minute' || unit === 'hour') {
		// Fast and exact (also inside repeated DST hours) unless a transition lies in between.
		const size = UNIT_MS[unit] * step;
		const aligned = time - mod(time + zone.offset(time), size);
		const p = zone.parts(aligned);
		const isBoundary =
			unit === 'minute' ? p.minute % step === 0 : p.hour % step === 0 && p.minute === 0;
		if (isBoundary) return aligned;
	}
	const p = zone.parts(time);
	switch (unit) {
		case 'minute':
			return zone.instant(p.year, p.month, p.day, p.hour, p.minute - (p.minute % step));
		case 'hour':
			return zone.instant(p.year, p.month, p.day, p.hour - (p.hour % step));
		case 'day': {
			let day = p.day - ((p.day - 1) % step);
			// A short remainder at the end of the month joins the previous step, so step 7 gives
			// the 1st, 8th, 15th and 22nd, and step 15 the 1st and 16th (not the 29th or 31st).
			if (day > 1 && daysInMonth(p.year, p.month) - day + 1 < step / 2) day -= step;
			return zone.instant(p.year, p.month, day);
		}
		case 'week':
			return zone.instant(p.year, p.month, p.day - mod(p.weekday - weekStartsOn, 7));
		case 'month':
			return zone.instant(p.year, p.month - (p.month % step), 1);
		case 'year':
			return zone.instant(p.year - mod(p.year, step), 0, 1);
	}
}

/** Whether `time` is the start of a calendar unit (a day, a month …). */
export const isBoundary = (
	zone: Zone,
	time: number,
	unit: TimeUnit,
	weekStartsOn: Weekday = 1
): boolean => floorTime(zone, time, { unit, step: 1 }, weekStartsOn) === time;

/** Adds `amount` units to `time`: elapsed time for minutes/hours, wall-clock time for the rest. */
export function addUnits(zone: Zone, time: number, unit: TimeUnit, amount: number): number {
	if (unit === 'minute') return time + amount * MINUTE;
	if (unit === 'hour') return time + amount * HOUR;
	const p = zone.parts(time);
	switch (unit) {
		case 'day':
			return zone.instant(p.year, p.month, p.day + amount, p.hour, p.minute);
		case 'week':
			return zone.instant(p.year, p.month, p.day + 7 * amount, p.hour, p.minute);
		case 'month': {
			const day = Math.min(p.day, daysInMonth(p.year, p.month + amount));
			return zone.instant(p.year, p.month + amount, day, p.hour, p.minute);
		}
		case 'year': {
			const day = Math.min(p.day, daysInMonth(p.year + amount, p.month));
			return zone.instant(p.year + amount, p.month, day, p.hour, p.minute);
		}
	}
}

/** The first boundary of `interval` strictly after `boundary`. */
export function nextBoundary(
	zone: Zone,
	boundary: number,
	interval: Interval,
	weekStartsOn: Weekday = 1
): number {
	// Usually k = 1. Larger k only matters when a DST shift pulls the result back onto `boundary`.
	for (let k = 1; k <= 4; k++) {
		const next = floorTime(
			zone,
			addUnits(zone, boundary, interval.unit, interval.step * k),
			interval,
			weekStartsOn
		);
		if (next > boundary) return next;
	}
	return boundary + intervalMs(interval);
}

/**
 * All boundaries needed to cover `[start, end]`: from the last boundary at or before `start`
 * to the first boundary at or after `end`. Capped at `limit` entries.
 */
export function boundariesAround(
	zone: Zone,
	start: number,
	end: number,
	interval: Interval,
	weekStartsOn: Weekday = 1,
	limit = 1000
): number[] {
	const list: number[] = [];
	let time = floorTime(zone, start, interval, weekStartsOn);
	while (list.length < limit) {
		list.push(time);
		if (time >= end) break;
		time = nextBoundary(zone, time, interval, weekStartsOn);
	}
	return list;
}

/** The boundary of `interval` closest to `time` (the earlier one on a tie). */
export function nearestBoundary(
	zone: Zone,
	time: number,
	interval: Interval,
	weekStartsOn: Weekday = 1
): number {
	const before = floorTime(zone, time, interval, weekStartsOn);
	if (before === time) return time;
	const after = nextBoundary(zone, before, interval, weekStartsOn);
	return time - before <= after - time ? before : after;
}

/** The next boundary after `time` (direction 1) or the previous one before it (direction -1). */
export function stepBoundary(
	zone: Zone,
	time: number,
	interval: Interval,
	direction: 1 | -1,
	weekStartsOn: Weekday = 1
): number {
	const before = floorTime(zone, time, interval, weekStartsOn);
	if (direction > 0) return nextBoundary(zone, before, interval, weekStartsOn);
	return before < time ? before : floorTime(zone, time - 1, interval, weekStartsOn);
}

/** Snaps `time` to the nearest boundary if it is within `threshold` ms, otherwise returns `null`. */
export function snapTime(
	zone: Zone,
	time: number,
	interval: Interval,
	threshold: number,
	weekStartsOn: Weekday = 1
): number | null {
	const boundary = nearestBoundary(zone, time, interval, weekStartsOn);
	return boundary !== time && Math.abs(boundary - time) <= threshold ? boundary : null;
}

/** The calendar interval of a preset; a quarter is three months starting in Jan, Apr, Jul or Oct. */
export const presetInterval = (preset: Preset): Interval =>
	preset === 'quarter' ? { unit: 'month', step: 3 } : { unit: preset, step: 1 };

/** The calendar period of the given kind that contains `time`, as `[start, end)`. */
export function periodAt(
	zone: Zone,
	time: number,
	preset: Preset,
	weekStartsOn: Weekday = 1
): [start: number, end: number] {
	const interval = presetInterval(preset);
	const start = floorTime(zone, time, interval, weekStartsOn);
	return [start, nextBoundary(zone, start, interval, weekStartsOn)];
}

/** The preset whose calendar period is exactly `[start, end)`, if any. */
export function matchPreset(
	zone: Zone,
	start: number,
	end: number,
	weekStartsOn: Weekday = 1
): Preset | null {
	for (const preset of PRESETS) {
		const [a, b] = periodAt(zone, start, preset, weekStartsOn);
		if (a === start && b === end) return preset;
	}
	return null;
}

/**
 * The adjacent range before (direction -1) or after (direction 1) `[start, end)`. Calendar
 * periods move by one period (April → May); other ranges move by their own duration.
 */
export function adjacentRange(
	zone: Zone,
	start: number,
	end: number,
	direction: 1 | -1,
	weekStartsOn: Weekday = 1
): [start: number, end: number] {
	const preset = matchPreset(zone, start, end, weekStartsOn);
	if (preset) return periodAt(zone, direction > 0 ? end : start - 1, preset, weekStartsOn);
	const duration = end - start;
	return [start + direction * duration, end + direction * duration];
}

/**
 * The "last …" window matching each period, ending now: an hour, 24 hours, 7 days, 30 days,
 * 90 days, 12 months. Days and months are calendar days and months (DST-safe).
 */
export const ROLLING_WINDOWS: Readonly<Record<Preset, Interval>> = {
	hour: { unit: 'hour', step: 1 },
	day: { unit: 'hour', step: 24 },
	week: { unit: 'day', step: 7 },
	month: { unit: 'day', step: 30 },
	quarter: { unit: 'day', step: 90 },
	year: { unit: 'month', step: 12 }
};

/** The "last …" window of `preset`'s kind ending at `end`, as `[start, end)`. */
export function rollingRange(
	zone: Zone,
	end: number,
	preset: Preset
): [start: number, end: number] {
	const { unit, step } = ROLLING_WINDOWS[preset];
	return [addUnits(zone, end, unit, -step), end];
}

/** The kind of "last …" window that `[start, end)` is, if any. */
export function matchRolling(zone: Zone, start: number, end: number): Preset | null {
	for (const preset of PRESETS) {
		if (rollingRange(zone, end, preset)[0] === start) return preset;
	}
	return null;
}
