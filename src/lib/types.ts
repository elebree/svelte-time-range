import type { HTMLAttributes } from 'svelte/elements';
import type { Preset, Weekday } from './core/calendar.js';
import type { ChartAggregate, ChartPoint } from './core/chart.js';

export type { ChartAggregate, ChartPoint };

export type { Preset, Weekday };

/**
 * When the ruler (and chart) shows:
 * - `'always'`: always.
 * - `'popover'`: only after the range text is pressed; Escape, a press outside or the range
 *   text again hides it.
 * - `'toggle'`: the range text shows and hides it, Escape hides it; it stays open while the
 *   user works elsewhere, e.g. pans the map under it.
 */
export type RulerMode = 'always' | 'popover' | 'toggle';

/** A half-open time range: `from` is included, `to` is not. */
export interface TimeRange {
	from: Date;
	to: Date;
}

export interface TimeRangeChange extends TimeRange {
	/** The preset whose calendar period matches the range exactly, otherwise `null`. */
	preset: Preset | null;
}

/** UI strings. Dates and times are localized through `Intl` using the `locale` prop. */
export interface TimeRangeSliderLabels {
	presets: Record<Preset, string>;
	/** Accessible name of the preset button group. */
	presetGroup: string;
	/** Accessible name of the zoom button group. */
	zoomGroup: string;
	zoomIn: string;
	zoomOut: string;
	/**
	 * The button that moves the selection to the current period, labelled by the kind of the
	 * selected range ("Today", "This week" …); `range` is used for other ranges ("Now").
	 */
	current: Record<Preset | 'range', string>;
	/**
	 * The button that selects the window of the same kind ending now: "Last hour", "Last 24 hours",
	 * "Last 7 days", "Last 30 days", "Last 90 days", "Last 12 months"; `range` keeps the length
	 * of other ranges ("Up to now").
	 */
	rolling: Record<Preset | 'range', string>;
	/** Group label of the "this …" options in the period dropdown (narrow layouts). */
	currentGroup: string;
	/** Group label of the "last …" options in the period dropdown (narrow layouts). */
	rollingGroup: string;
	/**
	 * Range text for one calendar quarter. `{quarter}` becomes 1–4, `{quarterRoman}` I–IV and
	 * `{year}` the localized year: `'Q{quarter} {year}'` → "Q1 2025",
	 * `'{year}第{quarter}四半期'` → "2025年第1四半期".
	 */
	quarterFormat: string;
	/** Shown in the period dropdown (narrow layouts) when the range is not a calendar period. */
	customPreset: string;
	/** Accessible name of the timeline. */
	timeline: string;
	/** Tooltip of the range text when it opens the ruler (`ruler` other than `'always'`). */
	showTimeline: string;
	/** Tooltip of the range text when it closes the ruler (`ruler` other than `'always'`). */
	hideTimeline: string;
	/** Accessible name of the start handle. */
	start: string;
	/** Accessible name of the end handle. */
	end: string;
	/** Accessible name of the selected range, which can be moved with the arrow keys. */
	range: string;
}

export type TimeRangeSliderLabelOverrides = Partial<
	Omit<TimeRangeSliderLabels, 'presets' | 'current' | 'rolling'>
> & {
	presets?: Partial<Record<Preset, string>>;
	current?: Partial<Record<Preset | 'range', string>>;
	rolling?: Partial<Record<Preset | 'range', string>>;
};

export interface TimeRangeSliderProps extends Omit<
	HTMLAttributes<HTMLDivElement>,
	'children' | 'onchange' | 'oninput'
> {
	/** Start of the range, inclusive. Bindable. Defaults to the start of the current month. */
	from?: Date;
	/** End of the range, exclusive. Bindable. Defaults to the start of the next month. */
	to?: Date;
	/** IANA time zone for calendar math and labels, e.g. `Europe/Berlin`. Default: the runtime's zone. */
	timeZone?: string;
	/**
	 * BCP 47 locale(s) for dates, numbers, the UI language and the first day of the week,
	 * e.g. `'de-DE'`. Default: the runtime's locale.
	 */
	locale?: string | string[];
	/**
	 * First day of the week, 0 = Sunday … 6 = Saturday. Default: from the locale — Monday in
	 * most of Europe and in China, Sunday in the US, Canada, Japan, Brazil …
	 */
	weekStartsOn?: Weekday;
	/** Preset buttons to show, in order. Default: hour, day, week, month, quarter, year. */
	presets?: readonly Preset[];
	/** Show the toolbar (presets, "current" and zoom buttons, range text). Default `true`. */
	toolbar?: boolean;
	/**
	 * When a drag ends, a dragged edge within this many px of a tick (major or minor) snaps to it.
	 * Default `10`; `0` turns snapping off.
	 */
	snapThreshold?: number;
	/** Dragged edges are rounded to multiples of this many ms. Default 1 minute. */
	step?: number;
	/** Shortest allowed range in ms. Default 1 minute. */
	minDuration?: number;
	/** Start of the timeline: it cannot be scrolled or zoomed out past this, nor the range moved before it. */
	min?: Date;
	/** End of the timeline: it cannot be scrolled or zoomed out past this, nor the range moved after it. */
	max?: Date;
	/** Shortest visible duration in ms (zoom-in limit). Default 30 minutes. */
	minViewSpan?: number;
	/** Longest visible duration in ms (zoom-out limit). Default 50 years. */
	maxViewSpan?: number;
	disabled?: boolean;
	/**
	 * UI strings. Default: the built-in translation for `locale` (17 languages, otherwise
	 * English). Entries given here replace single strings of it.
	 */
	labels?: TimeRangeSliderLabelOverrides;
	/** Replaces the default range text in the toolbar. */
	formatRange?: (from: Date, to: Date) => string;
	/**
	 * Values over time, drawn as a chart on the ruler (which grows to make room). The points
	 * need not be sorted; they are aggregated per calendar bucket whose size follows the zoom.
	 * Without `value`, a point counts as 1, so plain event times make a histogram.
	 */
	data?: readonly ChartPoint[];
	/** The chart form. Default `'bar'`. */
	chart?: 'bar' | 'line';
	/** How the values in one bucket are combined. Default `'sum'`. */
	aggregate?: ChartAggregate;
	/** What the values are, shown after them in the tooltip and to screen readers, e.g. "events". */
	valueLabel?: string;
	/**
	 * When the ruler (and chart) shows; see {@link RulerMode}. Other than `'always'`, the slider
	 * is a compact card with just the toolbar (shown even with `toolbar={false}`), and the ruler
	 * opens above it. Meant for small screens with the control over a map or image: anchor it
	 * at the bottom so it grows upwards. Default `'always'`.
	 */
	ruler?: RulerMode;
	/** With `ruler` `'popover'` or `'toggle'`: the ruler is open. Bindable. Default `false`. */
	expanded?: boolean;
	/** Formats chart values. Default: `Intl.NumberFormat` in the `locale`. */
	formatValue?: (value: number) => string;
	/**
	 * Called after the user finishes a change: drag released, click on the timeline, key press,
	 * preset, double-click. It gets the final (snapped) value at once, without waiting for the
	 * animation to end.
	 */
	onchange?: (change: TimeRangeChange) => void;
	/**
	 * Called for every intermediate value while dragging, and for every committed change. Animations
	 * (snapping, a click on the timeline) only move the picture: the value jumps to where they end.
	 */
	oninput?: (change: TimeRangeChange) => void;
}
