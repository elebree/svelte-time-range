import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TimeRangeSlider from './TimeRangeSlider.svelte';
import { presetRange } from './index.js';
import { YEAR_VIEW_PADDING } from './core/viewport.js';
import type { TimeRangeChange, TimeRangeSliderProps } from './types.js';

const DAY = 86_400_000;
const APRIL = { from: new Date(Date.UTC(2025, 3, 1)), to: new Date(Date.UTC(2025, 4, 1)) };
const iso = (change: TimeRangeChange | undefined) =>
	change && [change.from.toISOString(), change.to.toISOString(), change.preset];

function setup(props: Partial<TimeRangeSliderProps> = {}) {
	const onchange = vi.fn<(change: TimeRangeChange) => void>();
	const oninput = vi.fn<(change: TimeRangeChange) => void>();
	const result = render(TimeRangeSlider, {
		...APRIL,
		timeZone: 'UTC',
		locale: 'en-US',
		// Fixed, so expectations do not depend on the locale's first day (tested separately).
		weekStartsOn: 1,
		style: 'width: 800px',
		onchange,
		oninput,
		...props
	});
	const track = result.container.querySelector<HTMLElement>('.trs-track')!;
	const labels = () =>
		[...result.container.querySelectorAll('.trs-axis-label')].map((el) => el.textContent);
	return {
		...result,
		track,
		labels,
		onchange,
		oninput,
		lastChange: () => iso(onchange.mock.lastCall?.[0])
	};
}

const slider = (name: string) => page.getByRole('slider', { name, exact: true });
/** The period picker of narrow widths, and a choice in it. */
const picker = () => page.getByRole('button', { name: /^Period: / });
const periods = () => document.querySelector<HTMLElement>('.trs-periods')!;
async function pick(name: string) {
	await picker().click();
	await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
}
const valueText = (name: string) => slider(name).element().getAttribute('aria-valuetext');
const focus = (name: string) => (slider(name).element() as HTMLElement).focus();

function pointer(type: string, target: Element, clientX: number, clientY: number) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			clientX,
			clientY,
			pointerId: 1,
			pointerType: 'mouse',
			isPrimary: true,
			button: 0,
			buttons: type === 'pointerup' ? 0 : 1
		})
	);
}

/** Presses on the center of `element` and moves by `dx` px; returns a function that releases. */
function press(track: HTMLElement, element: Element, dx: number) {
	const box = element.getBoundingClientRect();
	const x = box.left + box.width / 2;
	const y = box.top + box.height / 2;
	pointer('pointerdown', element, x, y);
	for (let i = 1; i <= 5; i++) pointer('pointermove', track, x + (dx * i) / 5, y);
	return () => pointer('pointerup', track, x + dx, y);
}

function drag(track: HTMLElement, element: Element, dx: number) {
	press(track, element, dx)();
}

/** px per day in the initial view of a 2025 month: the year 2025 plus padding on both sides. */
const pxPerDay = (track: HTMLElement) => track.clientWidth / (365 * (1 + 2 * YEAR_VIEW_PADDING));

/** Client x of an instant in the initial view of a 2025 month. */
const clientX = (track: HTMLElement, time: number) =>
	track.getBoundingClientRect().left +
	track.clientLeft +
	((time - Date.UTC(2025, 0, 1)) / DAY + 365 * YEAR_VIEW_PADDING) * pxPerDay(track);

const ready = (track: HTMLElement) => expect.poll(() => track.clientWidth).toBeGreaterThan(0);

const inside = (element: Element, track: HTMLElement) => {
	const box = element.getBoundingClientRect();
	const bounds = track.getBoundingClientRect();
	const center = box.left + box.width / 2;
	return center >= bounds.left && center <= bounds.right;
};

describe('rendering', () => {
	it('shows a whole month as month and year and marks the preset', async () => {
		setup();
		await expect.element(page.getByText('Apr 2025', { exact: true })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Month', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect
			.element(page.getByRole('button', { name: 'Week', exact: true }))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('exposes the handles as sliders with readable values', async () => {
		setup();
		await expect.element(slider('Start')).toBeInTheDocument();
		expect(valueText('Start')).toMatch(/^Apr 1, 2025, 12:00\sAM$/);
		expect(valueText('End')).toMatch(/^May 1, 2025, 12:00\sAM$/);
		expect(valueText('Selected range')).toBe('Apr 2025');
	});

	it('shows the whole year for a month, with month names between the ticks', async () => {
		const { track, labels, container } = setup();
		await ready(track);
		// January shows the year: "Jan 2025", or just "2025" when that does not fit.
		await expect.poll(labels).toEqual(expect.arrayContaining(['Jun', 'Dec']));
		expect(labels()).toEqual(expect.arrayContaining([expect.stringMatching(/2025/)]));
		// "Jun" sits between the June 1 and July 1 ticks.
		const june = [...container.querySelectorAll('.trs-axis-label')].find(
			(el) => el.textContent === 'Jun'
		)!;
		const x = Number(june.getAttribute('x'));
		const toX = (time: number) => (time - Date.UTC(2025, 0, 1)) / DAY + 365 * YEAR_VIEW_PADDING;
		expect(x / pxPerDay(track)).toBeGreaterThan(toX(Date.UTC(2025, 5, 1)));
		expect(x / pxPerDay(track)).toBeLessThan(toX(Date.UTC(2025, 6, 1)));
	});

	it('draws calendar-aligned minor ticks', async () => {
		const { track, container } = setup();
		await ready(track);
		await expect
			.poll(() => container.querySelector('.trs-axis-minor')?.getAttribute('d')?.length ?? 0)
			.toBeGreaterThan(0);
	});

	it('marks today when it is in view', async () => {
		const { track, container } = setup({ from: undefined, to: undefined });
		await ready(track);
		await expect.poll(() => container.querySelector('.trs-now')).not.toBeNull();
	});

	it('uses custom labels and range text', async () => {
		setup({
			labels: { presets: { month: 'Monat' }, start: 'Beginn', current: { month: 'Dieser Monat' } },
			formatRange: (from, to) => `${from.getUTCDate()}..${to.getUTCDate()}`
		});
		await expect
			.element(page.getByRole('button', { name: 'Monat', exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Dieser Monat' })).toBeInTheDocument();
		await expect.element(slider('Beginn')).toBeInTheDocument();
		await expect.element(page.getByText('1..1')).toBeInTheDocument();
	});

	describe('narrow', () => {
		const narrow = { style: 'width: 360px' };

		it('shows the range text on the left and one period picker on the right', async () => {
			const { container } = setup(narrow);
			await expect.element(picker()).toBeVisible();
			await expect.element(picker()).toHaveAccessibleName('Period: Month');
			// Preset, current-period and recent-period buttons all give way to the picker.
			expect(page.getByRole('button').elements()).toHaveLength(1);
			const visible = [...container.querySelectorAll('.trs-toolbar > *')].filter(
				(el) => getComputedStyle(el).display !== 'none'
			);
			expect(visible).toHaveLength(2);
			const text = container.querySelector('.trs-range-text')!.getBoundingClientRect();
			const select = picker().element().getBoundingClientRect();
			const toolbar = container.querySelector('.trs-toolbar')!.getBoundingClientRect();
			expect(text.left).toBeLessThan(select.left);
			expect(Math.abs(toolbar.right - select.right)).toBeLessThan(2); // aligned right
			expect(Math.abs(text.top + text.height / 2 - (select.top + select.height / 2))).toBeLessThan(
				2
			); // one line
		});

		it('lays out periods, current periods and recent periods in three columns', async () => {
			const { container, lastChange } = setup(narrow);
			await picker().click();
			await expect.element(page.getByRole('dialog', { name: 'Period' })).toBeVisible();
			const texts = (selector: string) =>
				[...container.querySelectorAll(selector)].map((el) => el.textContent?.trim());
			expect(texts('.trs-periods-heading')).toEqual(['Period', 'Current', 'Recent']);
			// The Recent column names only the length; its buttons keep the full name.
			expect(texts('.trs-period').filter((_, i) => i % 3 === 2)).toEqual([
				'1 hour',
				'24 hours',
				'7 days',
				'30 days',
				'90 days',
				'12 months'
			]);
			await expect
				.element(page.getByRole('button', { name: 'Last 7 days' }))
				.toHaveTextContent('7 days');
			// The chosen period is pressed and focused.
			const month = page.getByRole('button', { name: 'Month', exact: true });
			await expect.element(month).toHaveAttribute('aria-pressed', 'true');
			expect(document.activeElement).toBe(month.element());

			await page.getByRole('button', { name: 'Today' }).click();
			const [from, to, preset] = lastChange()!;
			expect(preset).toBe('day');
			expect(Date.parse(from!)).toBeLessThanOrEqual(Date.now());
			expect(Date.parse(to!)).toBeGreaterThan(Date.now());
			await expect.element(picker()).toHaveAccessibleName('Period: Today');
			expect(periods().matches(':popover-open')).toBe(false);
			expect(document.activeElement).toBe(picker().element());
		});

		it('moves through the grid with the arrow keys', async () => {
			setup(narrow);
			await picker().click();
			await userEvent.keyboard('{ArrowRight}');
			expect(document.activeElement?.textContent?.trim()).toBe('This month');
			await userEvent.keyboard('{ArrowDown}');
			expect(document.activeElement?.textContent?.trim()).toBe('This quarter');
			await userEvent.keyboard('{ArrowRight}');
			expect(document.activeElement?.textContent?.trim()).toBe('90 days');
		});

		it('closes with Escape, leaving a collapsible ruler open', async () => {
			setup({ ...narrow, ruler: 'toggle', expanded: true });
			await picker().click();
			expect(periods().matches(':popover-open')).toBe(true);
			await userEvent.keyboard('{Escape}');
			await expect.poll(() => periods().matches(':popover-open')).toBe(false);
			await expect.element(slider('Start')).toBeVisible();
		});

		it('selects presets from the picker', async () => {
			const { lastChange } = setup(narrow);
			await pick('Week');
			expect(lastChange()).toEqual([
				'2025-04-14T00:00:00.000Z',
				'2025-04-21T00:00:00.000Z',
				'week'
			]);
		});

		it('shows "Custom" for other ranges', async () => {
			setup({
				...narrow,
				from: new Date(Date.UTC(2025, 3, 3)),
				to: new Date(Date.UTC(2025, 3, 9))
			});
			await expect.element(picker()).toHaveAccessibleName('Period: Custom');
			await expect.element(picker()).toHaveTextContent('Custom');
			expect(picker().element().hasAttribute('data-active')).toBe(false);
			await pick('Week');
			expect(picker().element().hasAttribute('data-active')).toBe(true);
		});
	});

	it('can hide the toolbar', async () => {
		setup({ toolbar: false });
		await expect.element(slider('Start')).toBeInTheDocument();
		expect(page.getByRole('button').elements()).toHaveLength(0);
		expect(page.getByRole('combobox').elements()).toHaveLength(0);
	});

	it('falls back to UTC for an unknown time zone', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		setup({ timeZone: 'Not/AZone' });
		await expect.element(page.getByText('Apr 2025', { exact: true })).toBeInTheDocument();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('Not/AZone'));
		warn.mockRestore();
	});
});

describe('presets', () => {
	it('selects the period around the middle of the range', async () => {
		const { lastChange } = setup();
		await page.getByRole('button', { name: 'Week', exact: true }).click();
		expect(lastChange()).toEqual(['2025-04-14T00:00:00.000Z', '2025-04-21T00:00:00.000Z', 'week']);
		await expect
			.element(page.getByRole('button', { name: 'Week', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('uses calendar periods of the time zone', async () => {
		const { lastChange } = setup({ timeZone: 'Europe/Berlin' });
		await page.getByRole('button', { name: 'Month', exact: true }).click();
		expect(lastChange()).toEqual(['2025-03-31T22:00:00.000Z', '2025-04-30T22:00:00.000Z', 'month']);
	});

	it('selects the quarter and steps through quarters with the keyboard', async () => {
		const { lastChange } = setup();
		await page.getByRole('button', { name: 'Quarter', exact: true }).click();
		expect(lastChange()).toEqual([
			'2025-04-01T00:00:00.000Z',
			'2025-07-01T00:00:00.000Z',
			'quarter'
		]);
		expect(valueText('Selected range')).toBe('Q2 2025');
		focus('Selected range');
		await userEvent.keyboard('{ArrowRight}{ArrowRight}');
		expect(lastChange()).toEqual([
			'2025-10-01T00:00:00.000Z',
			'2026-01-01T00:00:00.000Z',
			'quarter'
		]);
	});

	it('respects the first day of the week', async () => {
		const { lastChange } = setup({ weekStartsOn: 0 });
		await page.getByRole('button', { name: 'Week', exact: true }).click();
		expect(lastChange()).toEqual(['2025-04-13T00:00:00.000Z', '2025-04-20T00:00:00.000Z', 'week']);
	});

	it('picks a period within min / max even when the range is outside', async () => {
		const { lastChange } = setup({ max: new Date(Date.UTC(2025, 0, 1)) });
		await page.getByRole('button', { name: 'Month', exact: true }).click();
		expect(lastChange()).toEqual(['2024-12-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z', 'month']);
	});
});

describe('keyboard', () => {
	it('moves the selection to the next and previous period', async () => {
		const { lastChange } = setup();
		focus('Selected range');
		await userEvent.keyboard('{ArrowRight}');
		expect(lastChange()).toEqual(['2025-05-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z', 'month']);
		await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
		expect(lastChange()).toEqual(['2025-03-01T00:00:00.000Z', '2025-04-01T00:00:00.000Z', 'month']);
	});

	it('steps a handle to the neighbouring minor tick, or labelled tick with Shift', async () => {
		const { track, lastChange } = setup();
		await ready(track);
		focus('Start');
		await userEvent.keyboard('{ArrowLeft}');
		expect(lastChange()).toEqual(['2025-03-22T00:00:00.000Z', '2025-05-01T00:00:00.000Z', null]);
		await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
		expect(lastChange()).toEqual(['2025-03-01T00:00:00.000Z', '2025-05-01T00:00:00.000Z', null]);
		focus('End');
		await userEvent.keyboard('{ArrowRight}');
		expect(lastChange()).toEqual(['2025-03-01T00:00:00.000Z', '2025-05-08T00:00:00.000Z', null]);
	});

	it('keeps the range within min and max', async () => {
		const { onchange } = setup({ max: new Date(Date.UTC(2025, 4, 15)) });
		focus('Selected range');
		await userEvent.keyboard('{ArrowRight}');
		expect(onchange).not.toHaveBeenCalled();
		focus('End');
		await userEvent.keyboard('{End}');
		expect(onchange.mock.lastCall?.[0].to.toISOString()).toBe('2025-05-15T00:00:00.000Z');
	});

	it('zooms with + and -', async () => {
		const { track, labels } = setup();
		await ready(track);
		await expect.poll(labels).toContain('May');
		focus('Start');
		await userEvent.keyboard('++++');
		await expect
			.poll(() => labels().some((label) => /^[A-Z][a-z]{2} \d+$/.test(label!)))
			.toBe(true);
		await userEvent.keyboard('----');
		await expect.poll(labels).toContain('May');
	});
});

describe('pointer', () => {
	it('snaps a dragged edge to the nearest minor tick', async () => {
		const { track, lastChange, oninput } = setup();
		await ready(track);
		// 20 days to the right: May 21; quarter-month ticks are on the 1st, 8th, 15th and 22nd.
		drag(track, slider('End').element(), 20 * pxPerDay(track));
		expect(oninput).toHaveBeenCalled();
		await expect
			.poll(lastChange)
			.toEqual(['2025-04-01T00:00:00.000Z', '2025-05-22T00:00:00.000Z', null]);
	});

	it('snaps a dragged edge to a labelled tick', async () => {
		const { track, lastChange } = setup();
		await ready(track);
		drag(track, slider('End').element(), 30.3 * pxPerDay(track));
		await expect
			.poll(lastChange)
			.toEqual(['2025-04-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z', null]);
	});

	it('does not snap with a snap threshold of 0', async () => {
		const { track, lastChange } = setup({ snapThreshold: 0 });
		await ready(track);
		drag(track, slider('End').element(), 20 * pxPerDay(track));
		await expect.poll(lastChange).toBeTruthy();
		const [, to] = lastChange()!;
		expect(to).toMatch(/^2025-05-21T/);
		expect(to!.endsWith(':00.000Z')).toBe(true); // rounded to whole minutes
	});

	it('moves a calendar period to a whole period of the same kind', async () => {
		const { track, lastChange } = setup();
		await ready(track);
		// Roughly one month to the right; April (30 days) becomes May (31 days).
		drag(track, slider('Selected range').element(), 30.5 * pxPerDay(track));
		await expect
			.poll(lastChange)
			.toEqual(['2025-05-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z', 'month']);
	});

	it('scrolls the timeline while a handle is held at the edge', async () => {
		const { track, lastChange } = setup();
		await ready(track);
		const handle = slider('End').element();
		const box = handle.getBoundingClientRect();
		const right = track.getBoundingClientRect().right;
		const release = press(track, handle, right - 6 - (box.left + box.width / 2));
		// The view keeps scrolling while the pointer stays in the edge zone.
		await expect
			.poll(() => Number(slider('End').element().getAttribute('aria-valuenow')), {
				timeout: 3000
			})
			.toBeGreaterThan(Date.UTC(2026, 0, 20));
		release();
		await expect.poll(() => lastChange()?.[1] ?? '').toMatch(/^2026-/);
		// After the drag, the whole range is in view again.
		await expect.poll(() => inside(slider('End').element(), track)).toBe(true);
		expect(inside(slider('Start').element(), track)).toBe(true);
	});

	it('brings a range dragged partly out of view back into view', async () => {
		const { track, lastChange } = setup({ snapThreshold: 0 });
		await ready(track);
		const selection = slider('Selected range').element();
		// Release the drag right away, before the edge zone can scroll the view.
		drag(track, selection, 270 * pxPerDay(track));
		await expect.poll(() => lastChange()?.[1] ?? '').toMatch(/^2026-01/);
		await expect.poll(() => inside(slider('End').element(), track)).toBe(true);
	});

	it('resizes only from the handle strip; lower down, pressing an edge moves the range', async () => {
		const { track, lastChange } = setup({ snapThreshold: 0 });
		await ready(track);
		const top = track.getBoundingClientRect().top;
		const x = clientX(track, Date.UTC(2025, 4, 1)); // the end edge
		pointer('pointerdown', track, x, top + 70);
		pointer('pointermove', track, x + 10 * pxPerDay(track), top + 70);
		pointer('pointerup', track, x + 10 * pxPerDay(track), top + 70);
		await expect.poll(lastChange).toBeTruthy();
		const [from, to] = lastChange()!;
		expect(from).toMatch(/^2025-04-1[01]T/);
		expect(Date.parse(to!) - Date.parse(from!)).toBe(30 * DAY);
	});

	it('moves a range only a few pixels wide by its lower part', async () => {
		const { component, track, lastChange } = setup({ snapThreshold: 0 });
		await ready(track);
		component.selectPreset('day', Date.UTC(2025, 3, 16, 12));
		component.zoom(50); // the day is now about 2 px wide
		const width = () => slider('Selected range').element().getBoundingClientRect().width;
		await expect.poll(width).toBeLessThan(4);
		const selection = slider('Selected range').element().getBoundingClientRect();
		const x = selection.left + selection.width / 2;
		const y = selection.bottom - 10;
		pointer('pointerdown', track, x, y);
		pointer('pointermove', track, x + 60, y);
		pointer('pointerup', track, x + 60, y);
		await expect.poll(() => lastChange()?.[0]).not.toBe('2025-04-16T00:00:00.000Z');
		const [from, to] = lastChange()!;
		expect(Date.parse(to!) - Date.parse(from!)).toBe(DAY);
		expect(Date.parse(from!)).toBeGreaterThan(Date.UTC(2025, 3, 20));
	});

	it('moves the range to a clicked place, as the same kind of period', async () => {
		const { track, lastChange } = setup();
		await ready(track);
		const x = clientX(track, Date.UTC(2025, 7, 15));
		const y = track.getBoundingClientRect().top + 60;
		pointer('pointerdown', track, x, y);
		pointer('pointerup', track, x, y);
		await expect
			.poll(lastChange)
			.toEqual(['2025-08-01T00:00:00.000Z', '2025-09-01T00:00:00.000Z', 'month']);
	});

	it('reports a jump at once and only animates the picture', async () => {
		const { track, onchange, oninput, lastChange } = setup();
		await ready(track);
		const month = page.getByRole('button', { name: 'Month', exact: true }).element();
		const text = () => track.closest('.trs')!.querySelector('.trs-range-text')!.textContent;
		const left = () => track.querySelector<HTMLElement>('.trs-selection')!.style.left;
		const x = clientX(track, Date.UTC(2025, 7, 15));
		const y = track.getBoundingClientRect().top + 60;
		pointer('pointerdown', track, x, y);
		pointer('pointerup', track, x, y);
		// The destination arrives right away, before the first frame, so loading can start.
		const august = ['2025-08-01T00:00:00.000Z', '2025-09-01T00:00:00.000Z', 'month'];
		expect(onchange).toHaveBeenCalledTimes(1);
		expect(lastChange()).toEqual(august);
		expect(oninput.mock.calls.map(([change]) => iso(change))).toEqual([august]);
		// Sample every frame of the animation: the selection moves, the toolbar does not flicker.
		const seen = new Set<string>();
		const positions = new Set<string>();
		const until = performance.now() + 300;
		while (performance.now() < until) {
			await new Promise(requestAnimationFrame);
			seen.add(`${month.getAttribute('aria-pressed')} ${text()}`);
			positions.add(left());
		}
		expect([...seen]).toEqual(['true Aug 2025']);
		expect(positions.size).toBeGreaterThan(2);
		expect(onchange).toHaveBeenCalledTimes(1);
		expect(oninput).toHaveBeenCalledTimes(1);
	});

	it('centers other ranges on a clicked place and snaps them to a tick', async () => {
		const from = Date.UTC(2025, 3, 3, 7, 30);
		const { track, lastChange } = setup({
			from: new Date(from),
			to: new Date(from + 10 * DAY)
		});
		await ready(track);
		// A custom range is shown so it fills a quarter of the view: 40 days around its middle.
		const center = from + 5 * DAY;
		const box = track.getBoundingClientRect();
		const x =
			box.left +
			track.clientLeft +
			((Date.UTC(2025, 3, 25) - center) / (40 * DAY) + 0.5) * track.clientWidth;
		pointer('pointerdown', track, x, box.top + 60);
		pointer('pointerup', track, x, box.top + 60);
		// Centered on Apr 25: Apr 20 – Apr 30, snapped to the day ticks.
		await expect
			.poll(lastChange)
			.toEqual(['2025-04-20T00:00:00.000Z', '2025-04-30T00:00:00.000Z', null]);
	});

	it('does nothing on a click inside the selection', async () => {
		const { track, onchange } = setup();
		await ready(track);
		const x = clientX(track, Date.UTC(2025, 3, 15));
		const y = track.getBoundingClientRect().top + 60;
		pointer('pointerdown', track, x, y);
		pointer('pointerup', track, x, y);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(onchange).not.toHaveBeenCalled();
	});

	it('scrolls the timeline without changing the range', async () => {
		const { track, labels, onchange } = setup();
		await expect.poll(() => labels().length).toBeGreaterThan(0);
		const before = slider('Start').element().getBoundingClientRect().left;
		const box = track.getBoundingClientRect();
		pointer('pointerdown', track, box.left + 20, box.top + 40);
		pointer('pointermove', track, box.left + 120, box.top + 40);
		pointer('pointerup', track, box.left + 120, box.top + 40);
		await expect
			.poll(() => slider('Start').element().getBoundingClientRect().left)
			.toBeGreaterThan(before + 90);
		expect(onchange).not.toHaveBeenCalled();
	});

	it('picks the period under the pointer on double-click', async () => {
		const { track, lastChange } = setup();
		await ready(track);
		const box = track.getBoundingClientRect();
		// A quarter of the way into 2025 (plus padding): late March.
		const x = box.left + track.clientLeft + track.clientWidth / 4;
		track.dispatchEvent(
			new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: box.top + 40 })
		);
		expect(lastChange()).toEqual(['2025-03-01T00:00:00.000Z', '2025-04-01T00:00:00.000Z', 'month']);
	});

	it('finishes a running snap before handling a key press', async () => {
		const { track, lastChange } = setup();
		await ready(track);
		// A short drag of the start handle snaps back to April 1 (animated) …
		drag(track, slider('Start').element(), 5);
		expect(document.activeElement).toBe(slider('Start').element());
		// … and an immediate key press must step from April 1, not from the animated value.
		await userEvent.keyboard('{ArrowLeft}');
		expect(lastChange()).toEqual(['2025-03-22T00:00:00.000Z', '2025-05-01T00:00:00.000Z', null]);
	});
});

describe('localization', () => {
	/** The selection's accessible value; its name is translated too. */
	const selectionText = () =>
		document.querySelector('.trs-selection')?.getAttribute('aria-valuetext');

	it('speaks the language of the locale', async () => {
		setup({ locale: 'de-DE' });
		await expect.element(page.getByRole('button', { name: 'Monat', exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Dieser Monat', exact: true }))
			.toBeVisible();
		expect(selectionText()).toBe('Apr. 2025');
	});

	it('lets single strings be replaced', async () => {
		setup({ locale: 'fr-FR', labels: { presets: { month: 'Mensuel' } } });
		await expect.element(page.getByRole('button', { name: 'Mensuel', exact: true })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Semaine', exact: true })).toBeVisible();
	});

	it("starts weeks on the locale's first day", async () => {
		const us = setup({ weekStartsOn: undefined });
		await page.getByRole('button', { name: 'Week', exact: true }).click();
		expect(us.lastChange()?.[0]).toBe('2025-04-13T00:00:00.000Z'); // Sunday
		us.unmount();
		const de = setup({ locale: 'de-DE', weekStartsOn: undefined });
		await page.getByRole('button', { name: 'Woche', exact: true }).click();
		expect(de.lastChange()?.[0]).toBe('2025-04-14T00:00:00.000Z'); // Monday
	});

	it('names quarters in the local style', async () => {
		const quarter = { from: new Date(Date.UTC(2025, 0, 1)), to: new Date(Date.UTC(2025, 3, 1)) };
		const ja = setup({ ...quarter, locale: 'ja-JP' });
		expect(selectionText()).toBe('2025年第1四半期');
		ja.unmount();
		setup({ ...quarter, locale: 'pl-PL' });
		expect(selectionText()).toBe('I kw. 2025');
	});
});

describe('last … button', () => {
	const rollingButton = () => page.getByRole('button', { name: /^(Last|Up to now)/ });

	it('is labelled by the kind of the selection', async () => {
		setup();
		await expect.element(rollingButton()).toHaveAccessibleName('Last 30 days');
		await page.getByRole('button', { name: 'Day', exact: true }).click();
		await expect.element(rollingButton()).toHaveAccessibleName('Last 24 hours');
	});

	it('selects the window ending now and stays pressed', async () => {
		const { lastChange } = setup();
		await page.getByRole('button', { name: 'Week', exact: true }).click();
		await rollingButton().click();
		const [from, to, preset] = lastChange()!;
		const end = Date.parse(to!);
		expect(end).toBeGreaterThanOrEqual(Date.now() - 1000);
		expect(end - Date.now()).toBeLessThanOrEqual(60_000);
		expect(new Date(end).getUTCSeconds()).toBe(0); // the end of the current minute
		expect(end - Date.parse(from!)).toBe(7 * DAY);
		expect(preset).toBeNull();
		await expect.element(rollingButton()).toHaveAttribute('aria-pressed', 'true');
		// The week button stays the active kind; the "this …" button names it.
		await expect
			.element(page.getByRole('button', { name: 'Week', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByRole('button', { name: 'This week' })).toBeVisible();
	});

	it('makes the presets pick "last …" windows while it is pressed', async () => {
		const { lastChange } = setup();
		await rollingButton().click();
		await page.getByRole('button', { name: 'Day', exact: true }).click();
		const [from, to] = lastChange()!;
		expect(Date.parse(to!) - Date.parse(from!)).toBe(DAY);
		await expect.element(rollingButton()).toHaveAccessibleName('Last 24 hours');
	});

	it('keeps the length of other ranges and moves them to end now', async () => {
		const from = new Date(Date.UTC(2015, 3, 1, 6));
		const { lastChange } = setup({ from, to: new Date(from.getTime() + 5 * DAY) });
		await expect.element(rollingButton()).toHaveAccessibleName('Up to now');
		await rollingButton().click();
		const [start, end] = lastChange()!;
		expect(Date.parse(end!) - Date.parse(start!)).toBe(5 * DAY);
		expect(Date.parse(end!)).toBeGreaterThan(Date.now() - 1000);
	});

	it('is offered in the period picker on narrow widths', async () => {
		const { lastChange } = setup({ style: 'width: 360px' });
		await pick('Last 30 days');
		const [from, to] = lastChange()!;
		expect(Date.parse(to!) - Date.parse(from!)).toBe(30 * DAY);
		await expect.element(picker()).toHaveAccessibleName('Period: Last 30 days');
		// The button gives way to the picker.
		expect(getComputedStyle(document.querySelector('.trs-rolling')!).display).toBe('none');
	});
});

describe('ruler mode', () => {
	const disclosure = () => page.getByRole('button', { name: 'Apr 2025' });

	it('shows only the toolbar until the range text is pressed', async () => {
		const { container } = setup({ ruler: 'popover' });
		const ruler = container.querySelector<HTMLElement>('.trs-ruler')!;
		await expect.element(disclosure()).toHaveAttribute('aria-expanded', 'false');
		expect(ruler.hidden).toBe(true);
		expect(page.getByRole('slider').elements()).toHaveLength(0);
		await disclosure().click();
		await expect.element(disclosure()).toHaveAttribute('aria-expanded', 'true');
		expect(ruler.hidden).toBe(false);
		await expect.element(slider('Start')).toBeVisible();
	});

	it.each(['popover', 'toggle'] as const)(
		'%s closes with Escape, returning focus to the range text',
		async (ruler) => {
			setup({ ruler, expanded: true });
			await expect.element(slider('Start')).toBeVisible();
			focus('Start');
			await userEvent.keyboard('{Escape}');
			await expect.element(disclosure()).toHaveAttribute('aria-expanded', 'false');
			expect(document.activeElement).toBe(disclosure().element());
		}
	);

	it('popover closes on a press outside, but not inside', async () => {
		const { container } = setup({ ruler: 'popover', expanded: true });
		await expect.element(slider('Start')).toBeVisible();
		const inside = container.querySelector('.trs-toolbar')!;
		inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.element(disclosure()).toHaveAttribute('aria-expanded', 'true');
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.element(disclosure()).toHaveAttribute('aria-expanded', 'false');
	});

	it('toggle stays open on a press outside, and closes with the range text', async () => {
		setup({ ruler: 'toggle' });
		await disclosure().click();
		await expect.element(slider('Start')).toBeVisible();
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.element(disclosure()).toHaveAttribute('aria-expanded', 'true');
		await disclosure().click();
		await expect.element(disclosure()).toHaveAttribute('aria-expanded', 'false');
	});

	it('keeps the toolbar for its toggle, even with toolbar off', async () => {
		setup({ ruler: 'toggle', toolbar: false });
		await expect.element(disclosure()).toBeVisible();
	});

	it('is a plain, always open control by default', async () => {
		const { container } = setup();
		expect(container.querySelector('.trs-disclosure')).toBeNull();
		expect(container.querySelector<HTMLElement>('.trs-ruler')!.hidden).toBe(false);
	});
});

describe('highlighted labels', () => {
	const selectedLabels = (container: HTMLElement) =>
		[...container.querySelectorAll('.trs-axis-label-selected')].map((el) => el.textContent);
	const marks = (container: HTMLElement) =>
		container.querySelector('.trs-axis-mark')?.getAttribute('d') ?? '';

	it('highlights the periods inside the selection', async () => {
		const { container, track } = setup();
		await ready(track);
		await expect.poll(() => selectedLabels(container)).toEqual(['Apr']);
		expect(container.querySelector('.trs-axis-bracket-selected')?.getAttribute('d')).not.toBe('');
		await page.getByRole('button', { name: 'Quarter', exact: true }).click();
		await expect.poll(() => selectedLabels(container)).toEqual(['Apr', 'May', 'Jun']);
	});

	it('highlights the ticks at the edges when labels sit on ticks', async () => {
		const { container, track } = setup();
		await ready(track);
		await page.getByRole('button', { name: 'Week', exact: true }).click();
		await expect.poll(() => selectedLabels(container)).toEqual(['Apr 14', 'Apr 21']);
	});

	it('shows where a drag will land, and the tick it will stick to', async () => {
		const { container, track } = setup();
		await ready(track);
		// Drag the end from May 1 to about May 31; it will snap to June 1.
		const release = press(track, slider('End').element(), 30.3 * pxPerDay(track));
		await expect.poll(() => selectedLabels(container)).toEqual(['Apr', 'May']);
		expect(marks(container)).toMatch(/^M[\d.]+ [\d.]+V[\d.]+$/); // one tick: June 1
		release();
		await expect.poll(() => marks(container)).toBe('');
		expect(selectedLabels(container)).toEqual(['Apr', 'May']);
	});

	it('marks nothing while no tick is close enough to stick to', async () => {
		const { container, track } = setup({ snapThreshold: 0 });
		await ready(track);
		const release = press(track, slider('End').element(), 30.3 * pxPerDay(track));
		await expect.poll(() => selectedLabels(container)).toEqual(['Apr']);
		expect(marks(container)).toBe('');
		release();
	});
});

describe('chart', () => {
	const HOUR = 3_600_000;
	/** One event per hour throughout April 2025: 720 in April, 168 in a full week. */
	const april = Array.from({ length: 30 * 24 }, (_, i) => ({
		time: Date.UTC(2025, 3, 1) + i * HOUR
	}));
	const path = (container: HTMLElement, selector: string) =>
		container.querySelector(selector)?.getAttribute('d') ?? '';

	it('draws bars, re-drawing those inside the selection for emphasis', async () => {
		const { container, track } = setup({ data: april });
		await ready(track);
		await expect.poll(() => path(container, '.trs-chart-bars')).not.toBe('');
		const selected = container.querySelector('.trs-chart-bars.trs-chart-selected')!;
		expect(selected.getAttribute('clip-path')).toMatch(/^url\(#.+-selection\)$/);
		expect(selected.getAttribute('d')).toBe(path(container, '.trs-chart-bars'));
	});

	it('draws a line with an area', async () => {
		const { container, track } = setup({ data: april, chart: 'line' });
		await ready(track);
		await expect.poll(() => path(container, '.trs-chart-line')).toMatch(/^M[\d.]+ [\d.]+L/);
		expect(path(container, '.trs-chart-area')).toMatch(/Z$/);
		expect(container.querySelector('.trs-chart-bars')).toBeNull();
	});

	it('makes room on the ruler only when there is data', async () => {
		const plain = setup();
		await ready(plain.track);
		const withoutChart = plain.track.clientHeight;
		plain.unmount();
		const charted = setup({ data: april });
		await ready(charted.track);
		expect(charted.track.clientHeight).toBeGreaterThan(withoutChart + 20);
		expect(charted.container.querySelector('.trs-chart')).not.toBeNull();
	});

	it('shows the value and bucket under the mouse', async () => {
		const { container, track } = setup({ data: april, valueLabel: 'events' });
		await ready(track);
		const box = track.getBoundingClientRect();
		const x = clientX(track, Date.UTC(2025, 3, 16));
		pointer('pointermove', track, x, box.top + 50);
		const tooltip = () =>
			container.querySelector('.trs-tooltip')?.textContent?.replace(/\s+/g, ' ');
		// At the initial zoom (a year), the buckets are weeks.
		await expect.poll(tooltip).toBe('168 events Apr 14 – 20, 2025');
		track.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
		await expect.poll(tooltip).toBeUndefined();
	});

	it('tells screen readers the total inside the selection', async () => {
		setup({ data: april, valueLabel: 'events' });
		await expect.element(slider('Selected range')).toBeInTheDocument();
		expect(valueText('Selected range')).toBe('Apr 2025, 720 events');
	});

	it('combines values as asked', async () => {
		const values = april.map((point, i) => ({ ...point, value: i % 24 }));
		setup({ data: values, aggregate: 'max', formatValue: (value) => `max ${value}` });
		await expect.element(slider('Selected range')).toBeInTheDocument();
		expect(valueText('Selected range')).toBe('Apr 2025, max 23');
	});
});

describe('min / max', () => {
	const bounds = { min: new Date(Date.UTC(2025, 0, 1)), max: new Date(Date.UTC(2026, 0, 1)) };
	const outOfRange = (container: HTMLElement) =>
		[...container.querySelectorAll<HTMLElement>('.trs-out-of-range')].map((el) => el.offsetWidth);

	it('does not zoom out beyond the bounds', async () => {
		const { component, container, track } = setup(bounds);
		await ready(track);
		component.zoom(100);
		// Only a small overscroll beyond each bound is visible.
		await expect.poll(() => outOfRange(container)).toHaveLength(2);
		for (const width of outOfRange(container)) {
			expect(width).toBeLessThanOrEqual(track.clientWidth * 0.05);
		}
	});

	it('does not scroll beyond the bounds', async () => {
		const { container, track } = setup(bounds);
		await ready(track);
		const box = track.getBoundingClientRect();
		pointer('pointerdown', track, box.left + 10, box.top + 40);
		pointer('pointermove', track, box.left + 700, box.top + 40);
		pointer('pointerup', track, box.left + 700, box.top + 40);
		// Scrolled to the start: only the small overscroll before `min` is visible.
		const before = () => container.querySelector<HTMLElement>('.trs-out-of-range')!.offsetWidth;
		await expect.poll(before).toBeGreaterThan(track.clientWidth * 0.02);
		expect(before()).toBeLessThanOrEqual(track.clientWidth * 0.05);
	});
});

describe('state', () => {
	it('follows external changes without reporting them as user changes', async () => {
		const { rerender, onchange } = setup();
		await rerender({ from: new Date(Date.UTC(2025, 6, 1)), to: new Date(Date.UTC(2025, 7, 1)) });
		await expect.element(page.getByText('Jul 2025', { exact: true })).toBeInTheDocument();
		expect(onchange).not.toHaveBeenCalled();
	});

	it('defaults to the current month', async () => {
		const now = new Date();
		setup({ from: undefined, to: undefined });
		const label = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(now);
		await expect
			.element(page.getByRole('button', { name: 'Month', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
		expect(valueText('Start')).toMatch(new RegExp(`^${label} 1, ${now.getUTCFullYear()},`));
	});

	it('ignores input when disabled', async () => {
		const { onchange } = setup({ disabled: true });
		await expect.element(page.getByRole('button', { name: 'Week', exact: true })).toBeDisabled();
		await expect.element(slider('Start')).toHaveAttribute('tabindex', '-1');
		focus('Selected range');
		await userEvent.keyboard('{ArrowRight}');
		expect(onchange).not.toHaveBeenCalled();
	});

	describe('current period button', () => {
		const current = (preset: 'day' | 'week' | 'month' | 'quarter' | 'year') => {
			const range = presetRange(preset, { timeZone: 'UTC', weekStartsOn: 1 });
			return [range.from.toISOString(), range.to.toISOString(), preset];
		};
		/** Labelled by the kind of the selection: "Today", "This week" … or "Now". */
		const currentButton = () => page.getByRole('button', { name: /^(This \w+|Today|Now)$/ });
		const past = { from: new Date(Date.UTC(2015, 3, 1)), to: new Date(Date.UTC(2015, 4, 1)) };

		it('is labelled by the kind of the selection', async () => {
			setup(past);
			await expect.element(currentButton()).toHaveTextContent('This month');
			await page.getByRole('button', { name: 'Day', exact: true }).click();
			await expect.element(currentButton()).toHaveAccessibleName('Today');
			await page.getByRole('button', { name: 'Quarter', exact: true }).click();
			await expect.element(currentButton()).toHaveAccessibleName('This quarter');
			// A custom range: drag its end handle somewhere that is not a period boundary.
			focus('End');
			await userEvent.keyboard('{ArrowRight}');
			await expect.element(currentButton()).toHaveAccessibleName('Now');
		});

		it('keeps its width when its label changes', async () => {
			setup(past);
			const width = () => currentButton().element().getBoundingClientRect().width;
			await expect.element(currentButton()).toHaveAccessibleName('This month');
			const before = width();
			await page.getByRole('button', { name: 'Day', exact: true }).click();
			await expect.element(currentButton()).toHaveAccessibleName('Today');
			expect(width()).toBe(before);
		});

		it.each(['day', 'week', 'month', 'quarter', 'year'] as const)(
			'moves a %s to the current one',
			async (preset) => {
				const { container, track, lastChange } = setup({
					from: new Date(Date.UTC(2015, 3, 1)),
					to: new Date(Date.UTC(2015, 4, 1))
				});
				await ready(track);
				await page
					.getByRole('button', { name: preset[0]!.toUpperCase() + preset.slice(1), exact: true })
					.click();
				await currentButton().click();
				expect(lastChange()).toEqual(current(preset));
				await expect.poll(() => container.querySelector('.trs-now')).not.toBeNull();
			}
		);

		it('stays pressed, and presets then select the current period', async () => {
			const { lastChange } = setup(past);
			await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'false');
			await currentButton().click();
			await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'true');
			for (const preset of ['week', 'day', 'quarter'] as const) {
				await page
					.getByRole('button', { name: preset[0]!.toUpperCase() + preset.slice(1), exact: true })
					.click();
				expect(lastChange()).toEqual(current(preset));
				await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'true');
			}
		});

		it('stays pressed and keeps the range on a second click', async () => {
			const { lastChange, onchange } = setup(past);
			await currentButton().click();
			const selected = lastChange();
			await currentButton().click();
			await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'true');
			expect(lastChange()).toEqual(selected);
			expect(onchange).toHaveBeenCalledTimes(1);
		});

		it('is pressed whenever the selection is a current period', async () => {
			const { rerender } = setup({ ...presetRange('week', { timeZone: 'UTC', weekStartsOn: 1 }) });
			await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'true');
			// The selection is set from outside: last week is not current.
			const lastWeek = presetRange('week', {
				timeZone: 'UTC',
				weekStartsOn: 1,
				at: new Date(Date.now() - 7 * DAY)
			});
			await rerender({ ...lastWeek });
			await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'false');
			// The keyboard moves it back to this week.
			focus('Selected range');
			await userEvent.keyboard('{ArrowRight}');
			await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'true');
		});

		it('is not pressed for a custom range around now that was not set by the button', async () => {
			setup({ from: new Date(Date.now() - DAY), to: new Date(Date.now() + DAY) });
			await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'false');
		});

		it('is released when the selection moves away from now', async () => {
			const { lastChange } = setup(past);
			await currentButton().click();
			focus('Selected range');
			await userEvent.keyboard('{ArrowRight}');
			await expect.element(currentButton()).toHaveAttribute('aria-pressed', 'false');
			// Presets work around the selection again, not around now.
			const [from] = lastChange()!;
			await page.getByRole('button', { name: 'Year', exact: true }).click();
			expect(lastChange()![0]).toBe(`${from!.slice(0, 4)}-01-01T00:00:00.000Z`);
		});

		it('moves other ranges by whole durations until they contain now', async () => {
			const from = new Date(Date.UTC(2015, 3, 1, 6));
			const { lastChange } = setup({ from, to: new Date(from.getTime() + 5 * DAY) });
			await currentButton().click();
			const [start, end, preset] = lastChange()!;
			const a = Date.parse(start!);
			expect(Date.parse(end!) - a).toBe(5 * DAY);
			expect((a - from.getTime()) % (5 * DAY)).toBe(0);
			expect(a).toBeLessThanOrEqual(Date.now());
			expect(Date.parse(end!)).toBeGreaterThan(Date.now());
			expect(preset).toBeNull();
		});
	});

	it('exposes an imperative API', async () => {
		const { component, lastChange } = setup();
		component.shift(1);
		expect(lastChange()).toEqual(['2025-05-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z', 'month']);
		component.selectPreset('day', new Date(Date.UTC(2025, 4, 20, 15)));
		expect(lastChange()).toEqual(['2025-05-20T00:00:00.000Z', '2025-05-21T00:00:00.000Z', 'day']);
	});
});
