import { periodAt, type Preset, type Weekday } from './core/calendar.js';
import { weekStartOf } from './core/locale.js';
import { getZone, localTimeZone } from './core/time.js';
import type { TimeRange } from './types.js';

export { default as TimeRangeSlider } from './TimeRangeSlider.svelte';
export { PRESETS } from './core/calendar.js';
export { weekStartOf } from './core/locale.js';
export {
	LABELS,
	labelsCs,
	labelsDe,
	labelsEn,
	labelsEs,
	labelsFor,
	labelsFr,
	labelsIt,
	labelsJa,
	labelsKo,
	labelsNl,
	labelsPl,
	labelsPt,
	labelsRu,
	labelsSv,
	labelsTr,
	labelsUk,
	labelsZhHans,
	labelsZhHant
} from './locales/index.js';
export type {
	ChartAggregate,
	ChartPoint,
	Preset,
	TimeRange,
	TimeRangeChange,
	TimeRangeSliderLabelOverrides,
	TimeRangeSliderLabels,
	TimeRangeSliderProps,
	Weekday
} from './types.js';

export interface PresetRangeOptions {
	/** An instant inside the period. Default: now. */
	at?: Date;
	/** IANA time zone. Default: the runtime's zone. */
	timeZone?: string;
	/** BCP 47 locale, for the first day of the week. Default: the runtime's locale. */
	locale?: string | string[];
	/** First day of the week, 0 = Sunday … 6 = Saturday. Default: from `locale`. */
	weekStartsOn?: Weekday;
}

/**
 * The calendar period (hour, day, week, month, quarter, year) containing `at`, as a half-open
 * range. Use it to initialise the slider with the same calendar, e.g.
 * `presetRange('week', { timeZone: 'Europe/Berlin', locale: 'de-DE' })`.
 */
export function presetRange(preset: Preset, options: PresetRangeOptions = {}): TimeRange {
	const zone = getZone(options.timeZone ?? localTimeZone());
	const [from, to] = periodAt(
		zone,
		(options.at ?? new Date()).getTime(),
		preset,
		options.weekStartsOn ?? weekStartOf(options.locale)
	);
	return { from: new Date(from), to: new Date(to) };
}
