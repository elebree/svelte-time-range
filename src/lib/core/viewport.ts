/**
 * The visible time window of the timeline and its mapping to pixels.
 */
import { periodAt, type Preset, type Weekday } from './calendar.js';
import { DAY, HOUR, YEAR, type Zone } from './time.js';

export interface ViewWindow {
	/** Instant at the horizontal center of the timeline (epoch ms). */
	readonly center: number;
	/** Visible duration in ms. */
	readonly span: number;
}

export interface ViewLimits {
	readonly minSpan: number;
	readonly maxSpan: number;
	/** Earliest instant the view may show (`-Infinity` for none). */
	readonly min: number;
	/** Latest instant the view may show (`Infinity` for none). */
	readonly max: number;
}

/**
 * Visible duration after picking a preset. Months and quarters are shown within their calendar
 * year instead (see `fitView`); their entries here are only approximations.
 */
export const PRESET_VIEW_SPAN: Readonly<Record<Preset, number>> = {
	hour: 8 * HOUR,
	day: 7 * DAY,
	week: 35 * DAY,
	month: YEAR,
	quarter: YEAR,
	year: 4 * YEAR
};

/** Space on each side of the calendar year shown for a month or quarter, as a share of the year. */
export const YEAR_VIEW_PADDING = 0.02;
/** A custom range takes this share of the view when it is fitted. */
const FIT_RATIO = 0.25;
/** Space kept between a revealed range and the edges of the view, as a share of the view. */
const REVEAL_MARGIN = 0.05;

export const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

export const timeAt = (view: ViewWindow, width: number, x: number): number =>
	view.center + (x / width - 0.5) * view.span;

export const xAt = (view: ViewWindow, width: number, time: number): number =>
	((time - view.center) / view.span) * width + width / 2;

/** The preset that matches the zoom level, used when double-clicking the timeline. */
export function zoomLevel(span: number): Preset {
	if (span <= 2 * DAY) return 'hour';
	if (span <= 18 * DAY) return 'day';
	if (span <= 75 * DAY) return 'week';
	if (span <= 750 * DAY) return 'month';
	return 'year';
}

/**
 * How far the view may extend past `min` / `max`, as a share of the view. Keeps handles at a
 * bound fully visible and shows where the timeline ends.
 */
export const BOUNDS_OVERSCROLL = 0.03;

/** Keeps the zoom within its limits and the view within `[min, max]` (plus a little overscroll). */
export function clampView(view: ViewWindow, limits: ViewLimits): ViewWindow {
	const bounded = (limits.max - limits.min) / (1 - 2 * BOUNDS_OVERSCROLL);
	const maxSpan = Math.max(limits.minSpan, Math.min(limits.maxSpan, bounded));
	const span = clamp(view.span, limits.minSpan, maxSpan);
	const lowest = limits.min + span * (0.5 - BOUNDS_OVERSCROLL);
	const highest = limits.max - span * (0.5 - BOUNDS_OVERSCROLL);
	const center =
		lowest <= highest ? clamp(view.center, lowest, highest) : (limits.min + limits.max) / 2;
	return { center, span };
}

/** Zooms by `factor` (< 1 zooms in) while keeping the instant under `anchorX` in place. */
export function zoomView(
	view: ViewWindow,
	width: number,
	factor: number,
	anchorX: number,
	limits: ViewLimits
): ViewWindow {
	const anchor = timeAt(view, width, anchorX);
	const span = clamp(view.span * factor, limits.minSpan, limits.maxSpan);
	return clampView({ center: anchor - (anchorX / width - 0.5) * span, span }, limits);
}

/**
 * The view for `[start, end)`: a month or quarter is shown within its calendar year, other
 * presets with their `PRESET_VIEW_SPAN`, custom ranges so they fill a quarter of the view.
 */
export function fitView(
	zone: Zone,
	start: number,
	end: number,
	preset: Preset | null,
	limits: ViewLimits,
	weekStartsOn: Weekday = 1
): ViewWindow {
	if (preset === 'month' || preset === 'quarter') {
		const [yearStart, yearEnd] = periodAt(zone, start, 'year', weekStartsOn);
		const span = (yearEnd - yearStart) * (1 + 2 * YEAR_VIEW_PADDING);
		return clampView({ center: (yearStart + yearEnd) / 2, span }, limits);
	}
	const span = preset ? PRESET_VIEW_SPAN[preset] : (end - start) / FIT_RATIO;
	return clampView({ center: (start + end) / 2, span }, limits);
}

/**
 * The smallest change to `view` that shows `[start, end)`: none if it is visible, a pan if it
 * is partly visible, a zoom-out if it does not fit, a refit if it is off-screen or tiny.
 */
export function revealRange(
	zone: Zone,
	view: ViewWindow,
	start: number,
	end: number,
	preset: Preset | null,
	limits: ViewLimits,
	weekStartsOn: Weekday = 1
): ViewWindow {
	const duration = end - start;
	const margin = view.span * REVEAL_MARGIN;
	const left = view.center - view.span / 2;
	const right = view.center + view.span / 2;
	if (end <= left || start >= right || duration < view.span / 500) {
		return fitView(zone, start, end, preset, limits, weekStartsOn);
	}
	if (duration > view.span - 2 * margin) {
		const span = duration / (1 - 2 * REVEAL_MARGIN);
		return clampView({ center: (start + end) / 2, span }, limits);
	}
	if (start >= left + margin && end <= right - margin) return view;
	const shift = start < left + margin ? start - (left + margin) : end - (right - margin);
	return clampView({ center: view.center + shift, span: view.span }, limits);
}
