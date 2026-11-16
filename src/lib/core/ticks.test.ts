import { describe, expect, it } from 'vitest';
import { intervalMs } from './calendar.js';
import {
	MIN_MINOR_SPACING,
	TICK_INTERVALS,
	chooseInterval,
	chooseMinor,
	computeAxis,
	requiredSpacing
} from './ticks.js';
import { DAY, HOUR, YEAR, getZone } from './time.js';

const utc = getZone('UTC');
const berlin = getZone('Europe/Berlin');
const center = Date.UTC(2025, 6, 2, 12);
/** Intl uses thin and narrow no-break spaces; compare with plain spaces. */
const plain = (text: string) => text.replace(/\s/g, ' ');

function axisFor(span: number, locale = 'en-US', zone = utc, width = 900) {
	return computeAxis({ zone, start: center - span / 2, end: center + span / 2, width, locale });
}

describe('chooseInterval', () => {
	it.each([
		[8 * HOUR, 'hour', 1],
		[7 * DAY, 'day', 1],
		[35 * DAY, 'week', 1],
		[124 * DAY, 'month', 1],
		[380 * DAY, 'month', 1],
		[3 * YEAR, 'year', 1],
		[50 * YEAR, 'year', 5]
	] as const)('picks readable ticks for a span of %d ms', (span, unit, step) => {
		expect(chooseInterval(span / 900, 'en-US', 11)).toMatchObject({ unit, step });
	});

	it('leaves room for every label', () => {
		for (const msPerPx of [1e3, 1e5, 1e7, 1e9]) {
			const interval = chooseInterval(msPerPx, 'de-DE', 11);
			expect(intervalMs(interval) / msPerPx).toBeGreaterThanOrEqual(
				requiredSpacing(interval, 'de-DE', 11)
			);
		}
	});

	it('falls back to the coarsest interval', () => {
		expect(chooseInterval(1e15, 'en-US', 11)).toBe(TICK_INTERVALS.at(-1));
	});

	it('puts day, month and year labels between ticks', () => {
		const between = TICK_INTERVALS.filter((interval) => interval.between);
		expect(between).toMatchObject([
			{ unit: 'day', step: 1 },
			{ unit: 'month', step: 1 },
			{ unit: 'year', step: 1 }
		]);
	});
});

describe('minor ticks', () => {
	it('picks the finest calendar-aligned minor interval that is not too dense', () => {
		const month = TICK_INTERVALS.find((interval) => interval.unit === 'month')!;
		expect(chooseMinor(month, (124 * DAY) / 900)).toEqual({ unit: 'day', step: 1 });
		expect(chooseMinor(month, (380 * DAY) / 900)).toEqual({ unit: 'day', step: 7 });
		expect(chooseMinor(month, (20 * YEAR) / 900)).toBeNull();
	});

	it('are calendar boundaries between the major ticks', () => {
		const axis = axisFor(35 * DAY);
		expect(axis.minor).toEqual({ unit: 'day', step: 1 });
		const majors = new Set(axis.ticks.map((tick) => tick.time));
		expect(axis.minorTicks.length).toBeGreaterThan(20);
		for (const time of axis.minorTicks) {
			expect(time % DAY).toBe(0);
			expect(majors.has(time)).toBe(false);
		}
	});

	it('keep their minimum spacing', () => {
		for (const span of [HOUR, DAY, 30 * DAY, YEAR, 10 * YEAR]) {
			const { minorTicks } = axisFor(span);
			const msPerPx = span / 900;
			for (let i = 1; i < minorTicks.length; i++) {
				expect((minorTicks[i]! - minorTicks[i - 1]!) / msPerPx).toBeGreaterThan(
					MIN_MINOR_SPACING / 2
				);
			}
		}
	});
});

describe('computeAxis', () => {
	it('labels days with fallbacks', () => {
		const newYear = Date.UTC(2026, 0, 1);
		const { interval, ticks } = computeAxis({
			zone: utc,
			start: newYear - 3 * DAY,
			end: newYear + 4 * DAY,
			width: 900,
			locale: 'en-US'
		});
		expect(interval).toMatchObject({ unit: 'day', step: 1, between: true });
		const label = (time: number) => ticks.find((tick) => tick.time === time);
		expect(label(newYear)).toMatchObject({
			label: 'Jan 1, 2026',
			compactLabel: 'Jan 1',
			narrowLabel: 'Jan',
			emphasis: true
		});
		expect(label(newYear + DAY)).toMatchObject({
			label: 'Jan 2',
			narrowLabel: '2',
			emphasis: false
		});
	});

	it('labels months with fallbacks for January', () => {
		const { ticks } = axisFor(380 * DAY);
		const january = ticks.find((tick) => tick.time === Date.UTC(2025, 0, 1));
		expect(january).toMatchObject({
			label: 'Jan 2025',
			compactLabel: '2025',
			shortLabel: 'Jan',
			narrowLabel: 'J',
			emphasis: true
		});
		const may = ticks.find((tick) => tick.time === Date.UTC(2025, 4, 1));
		expect(may).toMatchObject({ label: 'May', narrowLabel: 'M', emphasis: false });
	});

	it.each([
		['en-GB', 'Sept', 'Sep'],
		['fr-FR', 'juil.', 'juil'],
		['ru-RU', 'нояб.', 'ноя'],
		['en-US', 'May', 'May']
	])('trims month names in %s to stay distinct', (locale, label, short) => {
		const { ticks } = computeAxis({
			zone: utc,
			start: Date.UTC(2025, 0, 1),
			end: Date.UTC(2026, 0, 1),
			width: 900,
			locale
		});
		const month = { 'en-GB': 8, 'fr-FR': 6, 'ru-RU': 10, 'en-US': 4 }[locale]!;
		expect(ticks.find((tick) => tick.time === Date.UTC(2025, month, 1))).toMatchObject({
			label,
			shortLabel: short
		});
	});

	it('labels midnight with the date when showing hours', () => {
		const midnight = Date.UTC(2025, 6, 3);
		const { ticks } = computeAxis({
			zone: utc,
			start: midnight - 4 * HOUR,
			end: midnight + 4 * HOUR,
			width: 900,
			locale: 'en-US'
		});
		expect(ticks.find((tick) => tick.time === midnight)).toMatchObject({
			label: 'Jul 3',
			emphasis: true
		});
		expect(plain(ticks.find((tick) => tick.time === midnight + HOUR)!.label)).toBe('1:00 AM');
	});

	it('labels every 3 hours of a whole day on a phone', () => {
		const midnight = Date.UTC(2025, 6, 3);
		const pad = DAY * 0.02;
		const { interval, ticks } = computeAxis({
			zone: utc,
			start: midnight - pad,
			end: midnight + DAY + pad,
			width: 370,
			locale: 'en-GB'
		});
		expect(interval).toMatchObject({ unit: 'hour', step: 3 });
		expect(ticks.find((tick) => tick.time === midnight + 3 * HOUR)!.label).toBe('03:00');
	});

	it('covers the visible range', () => {
		const span = 35 * DAY;
		const { ticks } = axisFor(span);
		expect(ticks[0]!.time).toBeLessThanOrEqual(center - span / 2);
		expect(ticks.at(-1)!.time).toBeGreaterThanOrEqual(center + span / 2);
	});

	it('produces strictly increasing ticks across DST changes', () => {
		const fallBack = Date.UTC(2025, 9, 26, 1);
		const { ticks, minorTicks } = computeAxis({
			zone: berlin,
			start: fallBack - 12 * HOUR,
			end: fallBack + 12 * HOUR,
			width: 1200,
			locale: 'de-DE'
		});
		for (const list of [ticks.map((tick) => tick.time), minorTicks]) {
			for (let i = 1; i < list.length; i++) expect(list[i]!).toBeGreaterThan(list[i - 1]!);
		}
	});

	it('localizes labels', () => {
		const { ticks } = axisFor(124 * DAY, 'ru-RU');
		expect(ticks.map((tick) => tick.label)).toContain('авг.');
	});
});
