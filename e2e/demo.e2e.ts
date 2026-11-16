import { devices, expect, test, type Page } from '@playwright/test';

/** The main slider; the demo also has one with a collapsible ruler over a map. */
const main = (page: Page) => page.getByTestId('slider');

/** The period picker of narrow widths, and a choice in it. */
const picker = (page: Page) => main(page).getByRole('button', { name: /^Period: / });
async function pickPeriod(page: Page, name: string) {
	await picker(page).click();
	await main(page).getByRole('dialog').getByRole('button', { name, exact: true }).click();
}

/** px per day in the initial view: the year 2025 plus 2 % padding on each side. */
async function pxPerDay(page: Page) {
	const width = await main(page)
		.locator('.trs-track')
		.evaluate((el) => el.clientWidth);
	return width / (365 * 1.04);
}

async function dragBy(page: Page, name: string, dx: number) {
	const box = (await main(page).getByRole('slider', { name, exact: true }).boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y, { steps: 12 });
	await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(main(page).locator('.trs-range-text')).toHaveText('Apr 2025');
	// The axis is drawn only in the browser: once it is there, the page is hydrated and
	// raw mouse input reaches the component.
	await expect(main(page).locator('.trs-axis-label').first()).toBeVisible();
});

test('dragging an edge snaps to the month boundary', async ({ page }) => {
	await dragBy(page, 'End', 30.3 * (await pxPerDay(page)));
	await expect(page.getByTestId('to')).toHaveAttribute('datetime', '2025-06-01T00:00:00.000Z');
	await expect(page.getByTestId('from')).toHaveAttribute('datetime', '2025-04-01T00:00:00.000Z');
	await expect(page.getByTestId('log').locator('li')).toHaveCount(1);
});

test('moving a month keeps it a calendar month', async ({ page }) => {
	await dragBy(page, 'Selected range', -30.5 * (await pxPerDay(page)));
	await expect(page.getByTestId('from')).toHaveAttribute('datetime', '2025-03-01T00:00:00.000Z');
	await expect(page.getByTestId('to')).toHaveAttribute('datetime', '2025-04-01T00:00:00.000Z');
	await expect(main(page).getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('keyboard continues where the pointer left off', async ({ page }) => {
	// A short drag that snaps back; the key press arrives while the snap is still animating.
	await dragBy(page, 'Start', 3);
	await expect(main(page).getByRole('slider', { name: 'Start' })).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	// One minor tick back: quarter-months (1st, 8th, 15th, 22nd) in the year view.
	await expect(page.getByTestId('from')).toHaveAttribute('datetime', '2025-03-22T00:00:00.000Z');
});

test('dragging into the edge scrolls the timeline', async ({ page }) => {
	const track = (await main(page).locator('.trs-track').boundingBox())!;
	const handle = (await main(page).getByRole('slider', { name: 'End' }).boundingBox())!;
	const y = handle.y + handle.height / 2;
	await page.mouse.move(handle.x + handle.width / 2, y);
	await page.mouse.down();
	await page.mouse.move(track.x + track.width - 6, y, { steps: 10 });
	await expect
		.poll(async () =>
			Number(await main(page).getByRole('slider', { name: 'End' }).getAttribute('aria-valuenow'))
		)
		.toBeGreaterThan(Date.UTC(2026, 1, 1));
	await page.mouse.up();
	await expect(page.getByTestId('to')).toHaveAttribute('datetime', /^2026-/);
	await expect(page.getByTestId('log').locator('li')).toHaveCount(1);
});

test('the map shows only the incidents inside the range', async ({ page }) => {
	const count = async () =>
		Number((await page.locator('.count').textContent())!.replace(/\D/g, ''));
	const dots = page.locator('.dots circle');
	const month = await count();
	expect(month).toBeGreaterThan(0);
	await expect(dots).toHaveCount(month);
	await main(page).getByRole('button', { name: 'Year', exact: true }).click();
	await expect.poll(count).toBeGreaterThan(month * 6);
	await expect(dots).toHaveCount(await count());
});

test('wheel zooms around the pointer', async ({ page }) => {
	const track = main(page).locator('.trs-track');
	await expect(track.locator('.trs-axis-label', { hasText: /^May$/ })).toBeVisible();
	await track.hover();
	for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
	// Zoomed in to weeks: labels such as "Jul 7".
	await expect(
		track.locator('.trs-axis-label', { hasText: /^[A-Z][a-z]{2} \d+$/ }).first()
	).toBeVisible();
	// Zooming does not change the selection.
	await expect(page.getByTestId('log').locator('li')).toHaveCount(0);
});

test('Current moves the selection to the current month', async ({ page }) => {
	const today = new Date();
	const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
	await main(page).getByRole('button', { name: 'This month', exact: true }).click();
	await expect(page.getByTestId('from')).toHaveAttribute('datetime', monthStart.toISOString());
	await expect(main(page).locator('.trs-now')).toHaveCount(1);
	await expect(main(page).getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('a click on the timeline moves the month there', async ({ page }) => {
	const track = (await main(page).locator('.trs-track').boundingBox())!;
	// The view starts 2 % of a year before 2025; mid-August is about 226 days later.
	const x = track.x + 1 + (365 * 0.02 + 226) * (await pxPerDay(page));
	await page.mouse.click(x, track.y + 60);
	await expect(page.getByTestId('from')).toHaveAttribute('datetime', '2025-08-01T00:00:00.000Z');
	await expect(page.getByTestId('to')).toHaveAttribute('datetime', '2025-09-01T00:00:00.000Z');
});

test('a narrow range is moved, not resized, by its lower part', async ({ page }) => {
	await main(page).getByRole('button', { name: 'Day', exact: true }).click();
	const track = main(page).locator('.trs-track');
	await track.hover();
	for (let i = 0; i < 16; i++) await page.mouse.wheel(0, 100);
	const range = main(page).getByRole('slider', { name: 'Selected range' });
	await expect.poll(async () => (await range.boundingBox())!.width).toBeLessThan(12);
	const selection = (await range.boundingBox())!;
	const x = selection.x + selection.width / 2;
	const y = selection.y + selection.height - 8;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + 120, y, { steps: 10 });
	await page.mouse.up();
	await expect(page.getByTestId('log').locator('li')).toHaveCount(2);
	const from = Date.parse((await page.getByTestId('from').getAttribute('datetime'))!);
	const to = Date.parse((await page.getByTestId('to').getAttribute('datetime'))!);
	expect(to - from).toBe(86_400_000);
	expect(from).toBeGreaterThan(Date.UTC(2025, 3, 16));
});

test('time zone and locale change the calendar', async ({ page }) => {
	await page.getByLabel('Time zone').selectOption('Europe/Berlin');
	await page.getByLabel('Locale').selectOption('de-DE');
	await main(page).getByRole('button', { name: 'Monat', exact: true }).click();
	await expect(page.getByTestId('from')).toHaveAttribute('datetime', '2025-03-31T22:00:00.000Z');
	await expect(page.getByTestId('to')).toHaveAttribute('datetime', '2025-04-30T22:00:00.000Z');
	await expect(main(page).locator('.trs-range-text')).toHaveText('Apr. 2025');
});

test.describe('on a phone', () => {
	const phone = devices['Pixel 7'];
	test.use({
		viewport: phone.viewport,
		deviceScaleFactor: phone.deviceScaleFactor,
		isMobile: true,
		hasTouch: true
	});

	for (const width of [390, 412]) {
		test(`a year shows all 12 month names at ${width} px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 860 });
			const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
			await expect(main(page).locator('.trs-axis-label')).toHaveText(months);
			const overlay = page.getByTestId('overlay');
			await overlay.locator('.trs-disclosure').scrollIntoViewIfNeeded();
			await overlay.locator('.trs-disclosure').tap();
			await expect(overlay.locator('.trs-axis-label')).toHaveText(months);
		});
	}

	test.describe('in British English', () => {
		test.use({ locale: 'en-GB' });

		test('a year trims "Sept" rather than dropping the months at 375 px', async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 860 });
			await page.goto('/');
			const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
			await expect(main(page).locator('.trs-axis-label')).toHaveText(months);
		});

		test('an hour shows its whole day, labelled every 3 hours', async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 860 });
			await page.goto('/');
			await pickPeriod(page, 'Hour');
			await expect(main(page).locator('.trs-axis-label')).toHaveText(
				['03', '06', '09', '12', '15', '18', '21'].map((hour) => `${hour}:00`)
			);
		});
	});

	test('the toolbar is one row: range text on the left, one dropdown on the right', async ({
		page
	}) => {
		await expect(picker(page)).toBeVisible();
		await expect(main(page).getByRole('button', { name: 'Week', exact: true })).toBeHidden();
		await expect(main(page).locator('.trs-actions')).toBeHidden();
		// Touch screens zoom with a pinch, so there are no zoom buttons.
		await expect(main(page).getByRole('group', { name: 'Zoom' })).toBeHidden();
		const boxes = await main(page)
			.locator('.trs-toolbar > *')
			.evaluateAll((elements) =>
				elements
					.filter((element) => getComputedStyle(element).display !== 'none')
					.map((element) => element.getBoundingClientRect())
					.map((box) => box.top + box.height / 2)
			);
		expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(2);

		await pickPeriod(page, 'Week');
		await expect(page.getByTestId('from')).toHaveAttribute('datetime', '2025-04-13T00:00:00.000Z'); // en-US: Sunday
		await expect(picker(page)).toHaveAccessibleName('Period: Week');

		await pickPeriod(page, 'This month');
		await expect(picker(page)).toHaveAccessibleName('Period: This month');
		await expect(main(page).locator('.trs-range-text')).toHaveText(/\w{3} \d{4}/);
	});

	test('the period picker of the map overlay opens above it, on screen', async ({ page }) => {
		const overlay = page.getByTestId('overlay');
		const button = overlay.getByRole('button', { name: /^Period: / });
		await button.scrollIntoViewIfNeeded();
		await button.tap();
		const dialog = overlay.getByRole('dialog');
		await expect(dialog).toBeVisible();
		const box = (await dialog.boundingBox())!;
		const anchor = (await button.boundingBox())!;
		expect(box.y + box.height).toBeLessThanOrEqual(anchor.y);
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
		await dialog.getByRole('button', { name: 'Last 7 days' }).tap();
		await expect(dialog).toBeHidden();
		await expect(button).toHaveAccessibleName('Period: Last 7 days');
	});

	test('the map overlay opens from its bar and closes on a tap on the map', async ({ page }) => {
		const overlay = page.getByTestId('overlay');
		const toggle = overlay.locator('.trs-disclosure');
		await toggle.scrollIntoViewIfNeeded();
		await expect(overlay.locator('.trs-track')).toBeHidden();
		await toggle.tap();
		await expect(overlay.locator('.trs-track')).toBeVisible();
		await expect(overlay.locator('.trs-axis-label').first()).toBeVisible();
		const map = (await page.locator('.map').boundingBox())!;
		await page.touchscreen.tap(map.x + 30, map.y + 30);
		await expect(overlay.locator('.trs-track')).toBeHidden();
	});
});
