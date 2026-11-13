import { describe, expect, it } from 'vitest';
import { DAY, HOUR, YEAR, getZone } from './time.js';
import {
	BOUNDS_OVERSCROLL,
	PRESET_VIEW_SPAN,
	YEAR_VIEW_PADDING,
	clampView,
	fitView,
	revealRange,
	timeAt,
	xAt,
	zoomLevel,
	zoomView,
	type ViewLimits,
	type ViewWindow
} from './viewport.js';

const utc = getZone('UTC');
const limits: ViewLimits = { minSpan: HOUR / 2, maxSpan: 50 * YEAR, min: -Infinity, max: Infinity };
const view: ViewWindow = { center: Date.UTC(2025, 3, 16), span: 100 * DAY };
const width = 1000;
const edges = (v: ViewWindow) => [v.center - v.span / 2, v.center + v.span / 2];

describe('pixel mapping', () => {
	it('maps the center to the middle and the edges to 0 and width', () => {
		expect(xAt(view, width, view.center)).toBe(500);
		expect(xAt(view, width, view.center - 50 * DAY)).toBe(0);
		expect(timeAt(view, width, width)).toBe(view.center + 50 * DAY);
	});

	it('is invertible', () => {
		const time = view.center + 12_345_678;
		expect(timeAt(view, width, xAt(view, width, time))).toBeCloseTo(time, -1);
	});
});

describe('zoomView', () => {
	it('keeps the anchor in place', () => {
		const anchorX = 200;
		const anchor = timeAt(view, width, anchorX);
		const zoomed = zoomView(view, width, 0.5, anchorX, limits);
		expect(zoomed.span).toBe(50 * DAY);
		expect(timeAt(zoomed, width, anchorX)).toBeCloseTo(anchor, -1);
	});

	it('respects the zoom limits', () => {
		expect(zoomView(view, width, 1e-9, 500, limits).span).toBe(limits.minSpan);
		expect(zoomView(view, width, 1e9, 500, limits).span).toBe(limits.maxSpan);
	});
});

describe('clampView with min / max', () => {
	const min = Date.UTC(2024, 0, 1);
	const max = Date.UTC(2026, 0, 1);
	const bounded: ViewLimits = { ...limits, min, max };
	const overscroll = (span: number) => span * BOUNDS_OVERSCROLL;

	it('keeps the view inside the bounds, apart from a small overscroll', () => {
		const early = clampView({ center: Date.UTC(2020, 0, 1), span: 100 * DAY }, bounded);
		expect(edges(early)[0]).toBeCloseTo(min - overscroll(100 * DAY), -1);
		const late = clampView({ center: Date.UTC(2030, 0, 1), span: 100 * DAY }, bounded);
		expect(edges(late)[1]).toBeCloseTo(max + overscroll(100 * DAY), -1);
	});

	it('does not zoom out beyond the bounds', () => {
		const zoomed = zoomView(view, width, 1e6, 500, bounded);
		const [left, right] = edges(zoomed);
		expect(left).toBeCloseTo(min - overscroll(zoomed.span), -1);
		expect(right).toBeCloseTo(max + overscroll(zoomed.span), -1);
	});

	it('leaves views within the bounds alone', () => {
		const inside = { center: Date.UTC(2025, 0, 1), span: 30 * DAY };
		expect(clampView(inside, bounded)).toEqual(inside);
	});

	it('centers on the bounds when they are shorter than the shortest view', () => {
		const narrow = { ...limits, minSpan: DAY, min: 0, max: HOUR };
		expect(clampView({ center: 5 * DAY, span: DAY }, narrow)).toEqual({
			center: HOUR / 2,
			span: DAY
		});
	});
});

describe('fitView', () => {
	it('shows a month within its whole calendar year', () => {
		const fitted = fitView(utc, Date.UTC(2025, 3, 1), Date.UTC(2025, 4, 1), 'month', limits);
		const year = Date.UTC(2026, 0, 1) - Date.UTC(2025, 0, 1);
		expect(fitted.center).toBe((Date.UTC(2025, 0, 1) + Date.UTC(2026, 0, 1)) / 2);
		expect(fitted.span).toBeCloseTo(year * (1 + 2 * YEAR_VIEW_PADDING), -1);
	});

	it('shows a quarter within its whole calendar year', () => {
		const fitted = fitView(utc, Date.UTC(2025, 9, 1), Date.UTC(2026, 0, 1), 'quarter', limits);
		expect(fitted.center).toBe((Date.UTC(2025, 0, 1) + Date.UTC(2026, 0, 1)) / 2);
	});

	it('uses the preset span for other presets', () => {
		const fitted = fitView(utc, Date.UTC(2025, 3, 14), Date.UTC(2025, 3, 21), 'week', limits);
		expect(fitted.span).toBe(PRESET_VIEW_SPAN.week);
	});

	it('makes custom ranges fill a quarter of the view', () => {
		expect(fitView(utc, 0, 10 * DAY, null, limits).span).toBe(40 * DAY);
	});
});

describe('revealRange', () => {
	const reveal = (start: number, end: number) => revealRange(utc, view, start, end, null, limits);

	it('keeps the view when the range is visible', () => {
		const start = view.center - 5 * DAY;
		expect(reveal(start, start + 10 * DAY)).toBe(view);
	});

	it('pans just enough when the range is partly visible', () => {
		const right = view.center + view.span / 2;
		const revealed = reveal(right - 5 * DAY, right + 5 * DAY);
		expect(revealed.span).toBe(view.span);
		expect(edges(revealed)[1]).toBeCloseTo(right + 10 * DAY, -1);
	});

	it('zooms out just enough when the range does not fit', () => {
		const start = view.center - 60 * DAY;
		const revealed = reveal(start, start + 120 * DAY);
		expect(revealed.center).toBe(start + 60 * DAY);
		expect(revealed.span).toBeGreaterThan(120 * DAY);
		expect(revealed.span).toBeLessThan(140 * DAY);
	});

	it('refits when the range is off-screen', () => {
		const far = view.center + 10 * YEAR;
		expect(reveal(far, far + DAY).center).toBe(far + DAY / 2);
	});
});

describe('zoomLevel', () => {
	it.each([
		[HOUR, 'hour'],
		[3 * DAY, 'day'],
		[30 * DAY, 'week'],
		[200 * DAY, 'month'],
		[5 * YEAR, 'year']
	] as const)('maps a span of %d ms to %s', (span, preset) => {
		expect(zoomLevel(span)).toBe(preset);
	});
});
