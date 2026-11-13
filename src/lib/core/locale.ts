/**
 * Locale facts that `Intl` formatting does not cover: the default locale and the first day of
 * the week.
 */
import type { Locale } from './format.js';
import type { Weekday } from './calendar.js';

/** The runtime's default locale, e.g. "de-DE"; "en-US" if it cannot be determined. */
export function defaultLocale(): string {
	try {
		return new Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
	} catch {
		return 'en-US';
	}
}

/** The locale tags to try, in order of preference. */
export function localeTags(locale: Locale): readonly string[] {
	if (locale === undefined) return [defaultLocale()];
	return typeof locale === 'string' ? [locale] : locale;
}

// Regions whose week does not start on Monday, from CLDR 48 (via ICU's week data). Used when
// the runtime has no `Intl.Locale#getWeekInfo`.
const SUNDAY = new Set(
	(
		'AG AS BD BR BS BT BU BW BZ CA CO DM DO ET GT GU HK HN ID IL IN IS JM JP KE KH KR LA ' +
		'MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY RH SA SG SV TH TT TW UM US VE VI WS YD YE ZA ZW'
	).split(' ')
);
const SATURDAY = new Set('AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' '));
const FRIDAY = new Set(['MV']);

interface WeekInfo {
	firstDay: number;
}

/** `Intl.Locale#getWeekInfo()` (or the older `weekInfo` getter) where the runtime has it. */
function weekInfo(locale: Intl.Locale): WeekInfo | undefined {
	const withWeek = locale as Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };
	return withWeek.getWeekInfo?.() ?? withWeek.weekInfo;
}

/**
 * The first day of the week in a locale (0 = Sunday … 6 = Saturday): Monday in most of Europe
 * and China, Sunday in the US, Canada, Japan, Brazil …, Saturday in much of the Middle East.
 */
export function weekStartOf(locale: Locale): Weekday {
	for (const tag of localeTags(locale)) {
		try {
			const parsed = new Intl.Locale(tag);
			const firstDay = weekInfo(parsed)?.firstDay; // 1 = Monday … 7 = Sunday
			if (firstDay) return (firstDay % 7) as Weekday;
			const region = parsed.maximize().region ?? '';
			if (SUNDAY.has(region)) return 0;
			if (SATURDAY.has(region)) return 6;
			if (FRIDAY.has(region)) return 5;
			return 1;
		} catch {
			// Not a valid tag: try the next one.
		}
	}
	return 1;
}
