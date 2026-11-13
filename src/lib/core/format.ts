/**
 * Cached `Intl.DateTimeFormat` instances and the default range / date texts.
 */
import { isBoundary, matchPreset } from './calendar.js';
import type { Zone } from './time.js';

export type Locale = string | readonly string[] | undefined;

const MAX_CACHED_FORMATS = 256;
const formats = new Map<string, Intl.DateTimeFormat>();

/** A cached formatter; creating `Intl.DateTimeFormat` instances is comparatively expensive. */
export function dateFormat(
	locale: Locale,
	timeZone: string,
	options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
	const key = `${String(locale ?? '')}|${timeZone}|${JSON.stringify(options)}`;
	let format = formats.get(key);
	if (!format) {
		format = new Intl.DateTimeFormat(locale as string | string[] | undefined, {
			...options,
			timeZone
		});
		if (formats.size >= MAX_CACHED_FORMATS) formats.clear();
		formats.set(key, format);
	}
	return format;
}

const YEARS: Intl.DateTimeFormatOptions = { year: 'numeric' };
const MONTHS: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
const DATE: Intl.DateTimeFormatOptions = { dateStyle: 'medium' };
const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

function formatRange(format: Intl.DateTimeFormat, start: number, end: number): string {
	return typeof format.formatRange === 'function'
		? format.formatRange(start, end)
		: `${format.format(start)} – ${format.format(end)}`;
}

const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * Fills a quarter template: `{quarter}` → 1–4 in the locale's digits, `{quarterRoman}` → I–IV,
 * `{year}` → the localized year ("2025", "2025年").
 */
export function formatQuarter(
	template: string,
	quarter: number,
	{ year, number }: { year: string; number: (value: number) => string }
): string {
	return template
		.replaceAll('{quarterRoman}', ROMAN[quarter - 1]!)
		.replaceAll('{quarter}', number(quarter))
		.replaceAll('{year}', year);
}

/**
 * Human-readable text for `[start, end)`, as coarse as the range allows: whole years ("2025"),
 * a calendar quarter ("Q1 2025", from `quarterFormat`), whole months ("Sep 2025",
 * "Sep – Nov 2025"), whole days with an inclusive last day ("Apr 14 – 20, 2025"), otherwise
 * dates with times.
 */
export function formatRangeText(
	zone: Zone,
	start: number,
	end: number,
	locale: Locale,
	quarterFormat = 'Q{quarter} {year}'
): string {
	const whole = (unit: 'year' | 'month' | 'day') =>
		isBoundary(zone, start, unit) && isBoundary(zone, end, unit);
	// Whole units are shown inclusively: the last day of the range is the day before `end`.
	if (whole('year')) return formatRange(dateFormat(locale, zone.id, YEARS), start, end - 1);
	if (matchPreset(zone, start, end) === 'quarter') {
		return formatQuarter(quarterFormat, Math.floor(zone.parts(start).month / 3) + 1, {
			year: dateFormat(locale, zone.id, YEARS).format(start),
			number: (value) =>
				new Intl.NumberFormat(locale as string | string[] | undefined).format(value)
		});
	}
	if (whole('month')) return formatRange(dateFormat(locale, zone.id, MONTHS), start, end - 1);
	if (whole('day')) return formatRange(dateFormat(locale, zone.id, DATE), start, end - 1);
	return formatRange(dateFormat(locale, zone.id, DATE_TIME), start, end);
}

/** Date and time of a single instant, e.g. for `aria-valuetext`. */
export function formatDateTime(zone: Zone, time: number, locale: Locale): string {
	return dateFormat(locale, zone.id, DATE_TIME).format(time);
}
