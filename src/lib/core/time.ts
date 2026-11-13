/**
 * Time constants and a small, dependency-free time-zone layer built on `Intl.DateTimeFormat`.
 *
 * All instants are epoch milliseconds (UTC). Calendar arithmetic goes through a {@link Zone},
 * which converts between instants and wall-clock time in an IANA time zone and handles
 * daylight-saving transitions.
 */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
/** Average Gregorian month. Only for estimates (tick density, zoom levels), never for calendar math. */
export const MONTH = 30.436875 * DAY;
/** Average Gregorian year. Only for estimates (tick density, zoom levels), never for calendar math. */
export const YEAR = 365.2425 * DAY;

/** Wall-clock fields of an instant in a particular time zone. */
export interface WallClock {
	year: number;
	/** 0 = January … 11 = December (same as `Date`). */
	month: number;
	/** Day of month, 1–31. */
	day: number;
	hour: number;
	minute: number;
	/** 0 = Sunday … 6 = Saturday (same as `Date#getDay`). */
	weekday: number;
}

export interface Zone {
	/** The IANA identifier the zone was created with. */
	readonly id: string;
	/** UTC offset in milliseconds at the given instant (positive east of Greenwich). */
	offset(time: number): number;
	/** Wall-clock fields of the instant in this zone. */
	parts(time: number): WallClock;
	/**
	 * The instant of a wall-clock time in this zone. Fields may overflow like `Date.UTC`
	 * (month 12 is January of the next year, day 0 is the last day of the previous month).
	 *
	 * Wall times skipped by a DST gap move forward by the length of the gap; wall times that
	 * occur twice resolve to the earlier instant (like `Temporal`'s "compatible" disambiguation).
	 */
	instant(year: number, month: number, day?: number, hour?: number, minute?: number): number;
}

const UTC_ALIASES = new Set([
	'UTC',
	'ETC/UTC',
	'GMT',
	'ETC/GMT',
	'UCT',
	'ETC/UCT',
	'UNIVERSAL',
	'ETC/UNIVERSAL',
	'ZULU',
	'ETC/ZULU'
]);

const zones = new Map<string, Zone>();

/**
 * Returns the zone for an IANA time-zone identifier, e.g. `Europe/Berlin` or `UTC`.
 * Zones are cached. Throws a `RangeError` for unknown identifiers.
 */
export function getZone(id: string): Zone {
	let zone = zones.get(id);
	if (!zone) {
		zone = UTC_ALIASES.has(id.toUpperCase()) ? createUtcZone(id) : createIntlZone(id);
		zones.set(id, zone);
	}
	return zone;
}

/** The runtime's default time zone, or `UTC` when it cannot be determined. */
export function localTimeZone(): string {
	try {
		return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

function wallClockOf(local: number): WallClock {
	const date = new Date(local);
	return {
		year: date.getUTCFullYear(),
		month: date.getUTCMonth(),
		day: date.getUTCDate(),
		hour: date.getUTCHours(),
		minute: date.getUTCMinutes(),
		weekday: date.getUTCDay()
	};
}

function createUtcZone(id: string): Zone {
	return {
		id,
		offset: () => 0,
		parts: (time) => wallClockOf(time),
		instant: (year, month, day = 1, hour = 0, minute = 0) =>
			Date.UTC(year, month, day, hour, minute)
	};
}

/**
 * Offsets are cached per 15-minute bucket: modern time-zone transitions happen on
 * quarter-hour boundaries in UTC, so every instant in a bucket shares one offset.
 */
const OFFSET_BUCKET = 15 * MINUTE;
const MAX_CACHED_OFFSETS = 4096;
/** Longer than any DST shift; used to find the offset in effect before a transition. */
const TRANSITION_LOOKBACK = 3 * HOUR;

type OffsetField = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

function createIntlZone(id: string): Zone {
	// Throws a RangeError for an unknown time zone, which is what we want.
	const format = new Intl.DateTimeFormat('en-US', {
		timeZone: id,
		hourCycle: 'h23',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric'
	});
	const cache = new Map<number, number>();

	function computeOffset(time: number): number {
		const fields: Record<OffsetField, number> = {
			year: 1970,
			month: 1,
			day: 1,
			hour: 0,
			minute: 0,
			second: 0
		};
		for (const part of format.formatToParts(time)) {
			if (part.type in fields) fields[part.type as OffsetField] = Number(part.value);
		}
		const local = Date.UTC(
			fields.year,
			fields.month - 1,
			fields.day,
			fields.hour % 24,
			fields.minute,
			fields.second
		);
		return local - time;
	}

	function offset(time: number): number {
		if (!Number.isFinite(time)) return 0;
		const bucket = Math.floor(time / OFFSET_BUCKET);
		let value = cache.get(bucket);
		if (value === undefined) {
			value = computeOffset(bucket * OFFSET_BUCKET);
			if (cache.size >= MAX_CACHED_OFFSETS) cache.clear();
			cache.set(bucket, value);
		}
		return value;
	}

	function instant(year: number, month: number, day = 1, hour = 0, minute = 0): number {
		const local = Date.UTC(year, month, day, hour, minute);
		const guess = offset(local);
		let time = local - guess;
		let actual = offset(time);
		if (actual !== guess) {
			time = local - actual;
			const retry = offset(time);
			// Neither offset maps back to this wall time: it falls into a DST gap.
			if (retry !== actual) return local - Math.min(actual, retry);
			actual = retry;
		}
		// The same wall time may also exist with the offset in effect before a transition.
		const before = offset(time - TRANSITION_LOOKBACK);
		if (before !== actual) {
			const earlier = local - before;
			if (earlier < time && offset(earlier) === before) return earlier;
		}
		return time;
	}

	return {
		id,
		offset,
		parts: (time) => wallClockOf(time + offset(time)),
		instant
	};
}
