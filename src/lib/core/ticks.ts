/**
 * Axis ticks: picks a calendar interval whose labels fit the available width, calendar-aligned
 * minor ticks below it, and localized labels.
 */
import {
	boundariesAround,
	intervalMs,
	type Interval,
	type TimeUnit,
	type Weekday
} from './calendar.js';
import { dateFormat, type Locale } from './format.js';
import type { WallClock, Zone } from './time.js';

export interface TickInterval extends Interval {
	/**
	 * Labels name the period after each tick (a day, a month, a year) and sit between the
	 * ticks. Otherwise they name the instant of the tick and sit on it.
	 */
	readonly between: boolean;
	/** Candidate minor intervals, finest first. Their boundaries include the major ones. */
	readonly minor: readonly Interval[];
}

export interface Tick {
	/** Epoch ms of the tick. */
	readonly time: number;
	readonly label: string;
	/** Shorter label when `label` does not fit, e.g. "2025" for "Jan 2025" (between-tick labels). */
	readonly compactLabel?: string;
	/** Shortest label, e.g. "J", used for all periods when compact labels do not fit everywhere. */
	readonly narrowLabel?: string;
	/** The tick starts a larger unit (a new day, month or year); its label shows that unit. */
	readonly emphasis: boolean;
}

export interface Axis {
	readonly interval: TickInterval;
	readonly ticks: readonly Tick[];
	/** The minor interval in use, or `null` if minor ticks would be too dense. */
	readonly minor: Interval | null;
	/** Minor tick instants, excluding those that coincide with major ticks. */
	readonly minorTicks: readonly number[];
}

function tickInterval(
	unit: TimeUnit,
	step: number,
	minor: [TimeUnit, number][] = []
): TickInterval {
	return {
		unit,
		step,
		between: (unit === 'day' || unit === 'month' || unit === 'year') && step === 1,
		minor: minor.map(([unit, step]) => ({ unit, step }))
	};
}

/** Candidate intervals, finest first. */
export const TICK_INTERVALS: readonly TickInterval[] = [
	tickInterval('minute', 1),
	tickInterval('minute', 5, [['minute', 1]]),
	tickInterval('minute', 15, [
		['minute', 1],
		['minute', 5]
	]),
	tickInterval('minute', 30, [
		['minute', 5],
		['minute', 10]
	]),
	tickInterval('hour', 1, [
		['minute', 10],
		['minute', 15],
		['minute', 30]
	]),
	tickInterval('hour', 3, [
		['minute', 30],
		['hour', 1]
	]),
	tickInterval('hour', 6, [
		['hour', 1],
		['hour', 3]
	]),
	tickInterval('hour', 12, [
		['hour', 1],
		['hour', 3],
		['hour', 6]
	]),
	tickInterval('day', 1, [
		['hour', 1],
		['hour', 3],
		['hour', 6]
	]),
	tickInterval('week', 1, [['day', 1]]),
	// Day steps restart every month: step 7 → 1st, 8th, 15th, 22nd; step 15 → 1st, 16th.
	tickInterval('month', 1, [
		['day', 1],
		['day', 7],
		['day', 15]
	]),
	tickInterval('year', 1, [
		['month', 1],
		['month', 3]
	]),
	tickInterval('year', 2, [
		['month', 3],
		['month', 6],
		['year', 1]
	]),
	tickInterval('year', 5, [['year', 1]]),
	tickInterval('year', 10, [
		['year', 1],
		['year', 5]
	]),
	tickInterval('year', 25, [
		['year', 1],
		['year', 5]
	]),
	tickInterval('year', 50, [
		['year', 5],
		['year', 10]
	]),
	tickInterval('year', 100, [
		['year', 10],
		['year', 50]
	])
];

type LabelStyle =
	| 'time'
	| 'dayOfMonth'
	| 'dayMonth'
	| 'dayMonthYear'
	| 'month'
	| 'narrowMonth'
	| 'monthYear'
	| 'year';

const STYLE_OPTIONS: Readonly<Record<LabelStyle, Intl.DateTimeFormatOptions>> = {
	time: { timeStyle: 'short' },
	dayOfMonth: { day: 'numeric' },
	dayMonth: { day: 'numeric', month: 'short' },
	dayMonthYear: { day: 'numeric', month: 'short', year: 'numeric' },
	month: { month: 'short' },
	narrowMonth: { month: 'narrow' },
	monthYear: { month: 'short', year: 'numeric' },
	year: { year: 'numeric' }
};

/**
 * Label styles that must fit for a unit; used to estimate label width. The fallbacks of
 * between-tick labels ("Jan 2025" → "2025" → "J", "Jan 1, 2025" → "Jan 1" → "Jan") are not
 * included: they apply when there is less room.
 */
const UNIT_STYLES: Readonly<Record<TimeUnit, readonly LabelStyle[]>> = {
	minute: ['time', 'dayMonth'],
	hour: ['time', 'dayMonth'],
	// Days need room for day numbers only: full labels ("Apr 14") are used where they fit.
	day: ['dayOfMonth'],
	week: ['dayMonth'],
	month: ['month'],
	year: ['year']
};

interface LabelChoice {
	style: LabelStyle;
	emphasis: boolean;
	compact?: LabelStyle;
	narrow?: LabelStyle;
}

function labelStyle(unit: TimeUnit, p: WallClock): LabelChoice {
	switch (unit) {
		case 'minute':
		case 'hour':
			return p.hour === 0 && p.minute === 0
				? { style: 'dayMonth', emphasis: true }
				: { style: 'time', emphasis: false };
		case 'day':
			// Narrow labels are day numbers, with the month name on the 1st: "Nov 2 3 4 …".
			if (p.day === 1 && p.month === 0) {
				return { style: 'dayMonthYear', emphasis: true, compact: 'dayMonth', narrow: 'month' };
			}
			return p.day === 1
				? { style: 'dayMonth', emphasis: true, narrow: 'month' }
				: { style: 'dayMonth', emphasis: false, narrow: 'dayOfMonth' };
		case 'week':
			return { style: 'dayMonth', emphasis: false };
		case 'month':
			return p.month === 0
				? { style: 'monthYear', emphasis: true, compact: 'year', narrow: 'narrowMonth' }
				: { style: 'month', emphasis: false, narrow: 'narrowMonth' };
		case 'year':
			return { style: 'year', emphasis: false };
	}
}

/** Average glyph width relative to the font size; slightly generous for proportional fonts. */
const GLYPH_WIDTH = 0.62;
/** Minimum free space between labels on ticks, in px. */
export const LABEL_GAP = 28;
/** Minimum free space around a label between ticks, in px. */
export const BETWEEN_LABEL_GAP = 6;
/** Minor ticks closer than this are not drawn, in px. */
export const MIN_MINOR_SPACING = 7;

/**
 * Chinese, Japanese and Korean characters (and full-width forms) take about a whole em:
 * U+1100–11FF, U+2E80–9FFF, U+AC00–D7AF, U+F900–FAFF, U+FF00–FFEF.
 */
const WIDE_GLYPH = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/;
const WIDE_GLYPH_WIDTH = 1;

/** Width of a text in ems, counting wide glyphs as wide. */
function textEms(text: string): number {
	let ems = 0;
	for (const char of text) ems += WIDE_GLYPH.test(char) ? WIDE_GLYPH_WIDTH : GLYPH_WIDTH;
	return ems;
}

/**
 * Estimated rendered width of a label in px. An estimate (not a DOM measurement) keeps tick
 * layout deterministic, synchronous and SSR-safe; the label gaps absorb the error.
 */
export const estimateTextWidth = (text: string, fontSize: number): number =>
	Math.ceil(textEms(text) * fontSize);

const labelEms = new Map<string, number>();

/** Width in ems of the widest label a unit can produce in the given locale. */
function maxLabelEms(unit: TimeUnit, locale: Locale): number {
	const key = `${String(locale ?? '')}|${unit}`;
	let ems = labelEms.get(key);
	if (ems === undefined) {
		ems = 0;
		for (const style of UNIT_STYLES[unit]) {
			const format = dateFormat(locale, 'UTC', STYLE_OPTIONS[style]);
			for (let month = 0; month < 12; month++) {
				ems = Math.max(ems, textEms(format.format(Date.UTC(2025, month, 28, 23, 59))));
			}
		}
		labelEms.set(key, ems);
	}
	return ems;
}

/** Estimated width in px of the widest label of a unit. */
export function labelWidth(unit: TimeUnit, locale: Locale, fontSize: number): number {
	return Math.ceil(maxLabelEms(unit, locale) * fontSize);
}

/** Distance in px two ticks of `interval` need so that their labels fit. */
export function requiredSpacing(interval: TickInterval, locale: Locale, fontSize: number): number {
	const gap = interval.between ? BETWEEN_LABEL_GAP : LABEL_GAP;
	return Math.max(
		MIN_SPACING[interval.unit] ?? 0,
		labelWidth(interval.unit, locale, fontSize) + gap
	);
}

/** Lower limits for the tick spacing, in px: below 32 px per day, weeks read better than days. */
const MIN_SPACING: Partial<Record<TimeUnit, number>> = { day: 32 };

/** The finest interval whose labels do not overlap at the given scale. */
export function chooseInterval(msPerPx: number, locale: Locale, fontSize: number): TickInterval {
	for (const interval of TICK_INTERVALS) {
		if (intervalMs(interval) / msPerPx >= requiredSpacing(interval, locale, fontSize)) {
			return interval;
		}
	}
	return TICK_INTERVALS[TICK_INTERVALS.length - 1]!;
}

/** The finest minor interval of `interval` that is not too dense, if any. */
export function chooseMinor(interval: TickInterval, msPerPx: number): Interval | null {
	return interval.minor.find((minor) => intervalMs(minor) / msPerPx >= MIN_MINOR_SPACING) ?? null;
}

export interface AxisOptions {
	zone: Zone;
	/** First visible instant. */
	start: number;
	/** Last visible instant. */
	end: number;
	/** Width of the timeline in px. */
	width: number;
	locale: Locale;
	weekStartsOn?: Weekday;
	/** Label font size in px, used to estimate label widths. */
	fontSize?: number;
}

/** Ticks covering `[start, end]`, including one boundary beyond each edge. */
export function computeAxis({
	zone,
	start,
	end,
	width,
	locale,
	weekStartsOn = 1,
	fontSize = 11
}: AxisOptions): Axis {
	const msPerPx = (end - start) / width;
	const interval = chooseInterval(msPerPx, locale, fontSize);
	const format = (time: number, style: LabelStyle) =>
		dateFormat(locale, zone.id, STYLE_OPTIONS[style]).format(time);

	const ticks = boundariesAround(zone, start, end, interval, weekStartsOn, 500).map((time) => {
		const { style, emphasis, compact, narrow } = labelStyle(interval.unit, zone.parts(time));
		const tick: Tick = { time, label: format(time, style), emphasis };
		return {
			...tick,
			...(compact && { compactLabel: format(time, compact) }),
			...(narrow && { narrowLabel: format(time, narrow) })
		};
	});

	const minor = chooseMinor(interval, msPerPx);
	const majors = new Set(ticks.map((tick) => tick.time));
	const minorTicks = minor
		? boundariesAround(zone, start, end, minor, weekStartsOn, 1000).filter((t) => !majors.has(t))
		: [];

	return { interval, ticks, minor, minorTicks };
}
