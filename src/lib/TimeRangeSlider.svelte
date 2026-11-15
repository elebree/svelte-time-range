<!--
	@component
	A zoomable timeline for picking a half-open time range `[from, to)`.

	- Drag the knobs at the top to resize the range; drag the selection anywhere below them to move
	  it (however narrow); drag the empty timeline to scroll. Dragging near an edge scrolls the
	  timeline along; a range left outside the view is brought back.
	- Click the empty timeline to move the range there, double-click to pick the period under the
	  pointer. Wheel / pinch zooms, horizontal wheel scrolls.
	- When a drag ends, edges within `snapThreshold` px of a tick (major or minor) snap to it.
	- Keyboard: arrow keys on the handles step to the previous / next tick (Shift: labelled tick);
	  on the selection they move to the previous / next period. `+` / `-` zoom.

	```svelte
	<TimeRangeSlider bind:from bind:to timeZone="Europe/Berlin" onchange={({ from, to }) => load(from, to)} />
	```
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { on } from 'svelte/events';
	import { prefersReducedMotion } from 'svelte/motion';
	import TimeAxis from './TimeAxis.svelte';
	import TimeChart from './TimeChart.svelte';
	import { aggregateRange, binSeries, chooseBinInterval, prepareSeries } from './core/chart.js';
	import {
		adjacentRange,
		floorTime,
		matchPreset,
		matchRolling,
		nearestBoundary,
		periodAt,
		presetInterval,
		rollingRange,
		PRESETS,
		snapTime,
		stepBoundary,
		type Interval,
		type Preset,
		type Weekday
	} from './core/calendar.js';
	import { formatDateTime, formatRangeText, type Locale } from './core/format.js';
	import { computeAxis } from './core/ticks.js';
	import { getZone, localTimeZone, MINUTE, YEAR, type Zone } from './core/time.js';
	import {
		clamp,
		clampView,
		fitView,
		revealRange,
		timeAt,
		xAt,
		zoomLevel,
		zoomView,
		type ViewLimits,
		type ViewWindow
	} from './core/viewport.js';
	import { resolveLabels } from './labels.js';
	import { weekStartOf } from './core/locale.js';
	import type { TimeRangeChange, TimeRangeSliderProps } from './types.js';

	let {
		from = $bindable(),
		to = $bindable(),
		timeZone,
		locale,
		weekStartsOn,
		presets = PRESETS,
		toolbar = true,
		snapThreshold = 10,
		step = MINUTE,
		minDuration = MINUTE,
		min,
		max,
		minViewSpan = 30 * MINUTE,
		maxViewSpan = 50 * YEAR,
		disabled = false,
		labels,
		formatRange,
		data,
		chart = 'bar',
		aggregate = 'sum',
		valueLabel,
		formatValue,
		collapsible = false,
		expanded = $bindable(false),
		onchange,
		oninput,
		class: className,
		...rest
	}: TimeRangeSliderProps = $props();

	/** Unique per instance, for SVG ids. */
	const uid = $props.id();

	const FONT_SIZE = 11;
	const ZOOM_IN = 0.65;
	const ZOOM_OUT = 1.55;
	/** Duration of snapping and view animations, in ms. */
	const ANIMATION_DURATION = 200;
	/** Grab distance around a handle, in px. */
	const HANDLE_REACH = { mouse: 13, touch: 22 };
	/**
	 * Height of the strip at the top of the timeline that holds the handles, in px. Edges can only
	 * be resized there; below it, the selection is moved, however narrow it is.
	 */
	const HANDLE_STRIP = { mouse: 24, touch: 30 };
	/** Narrow selections can still be grabbed across at least this width (below the strip), in px. */
	const MIN_GRAB_WIDTH = 16;
	/** Movement before a press becomes a drag, in px. */
	const DRAG_THRESHOLD = { mouse: 2, touch: 6 };
	/** Wheel zoom per pixel of wheel delta (100 px ≈ one notch ≈ ×1.2). */
	const WHEEL_ZOOM = 0.0018;
	const PINCH_WHEEL_ZOOM = 0.008;
	/** Width of the zone at each edge in which a drag scrolls the timeline, in px. */
	const EDGE_ZONE = 32;
	/** Scroll speed at the edge while dragging, in px per second (up to twice that beyond it). */
	const EDGE_SPEED = 480;
	/** How often the "now" marker moves, in ms. */
	const NOW_INTERVAL = 30_000;

	// ── Configuration ────────────────────────────────────────────────────────────

	function warn(message: string) {
		console.warn(`[TimeRangeSlider] ${message}`);
	}

	function resolveZone(id: string | undefined): Zone {
		try {
			return getZone(id ?? localTimeZone());
		} catch {
			warn(`Unknown time zone "${id}", using UTC.`);
			return getZone('UTC');
		}
	}

	function resolveLocale(value: Locale): Locale {
		if (value === undefined) return undefined;
		try {
			Intl.DateTimeFormat.supportedLocalesOf(value as string | string[]);
			return value;
		} catch {
			warn(`Invalid locale "${String(value)}", using the default locale.`);
			return undefined;
		}
	}

	function timeOf(date: Date | undefined): number | undefined {
		const time = typeof date?.getTime === 'function' ? date.getTime() : NaN;
		return Number.isFinite(time) ? time : undefined;
	}

	const zone = $derived(resolveZone(timeZone));
	const lang = $derived(resolveLocale(locale));
	/** UI strings: the locale's translation, with any `labels` given replacing single entries. */
	const text = $derived(resolveLabels(lang, labels));
	/** First day of the week: the prop, or the locale's (Sunday in the US, Monday in Germany …). */
	const firstDay: Weekday = $derived(weekStartsOn ?? weekStartOf(lang));
	const lowerBound = $derived(timeOf(min) ?? -Infinity);
	const upperBound = $derived(timeOf(max) ?? Infinity);
	const shortest = $derived(Math.max(1, minDuration));
	const precision = $derived(step > 0 ? step : 1);
	const limits: ViewLimits = $derived({
		minSpan: Math.max(MINUTE, minViewSpan),
		maxSpan: Math.max(MINUTE, minViewSpan, maxViewSpan),
		min: lowerBound,
		max: upperBound
	});

	// ── Value ────────────────────────────────────────────────────────────────────

	/** Used while `from` / `to` are not set: the current month. */
	const fallback = untrack(() => periodAt(zone, Date.now(), 'month', firstDay));

	const start = $derived(timeOf(from) ?? fallback[0]);
	const end = $derived(Math.max(timeOf(to) ?? fallback[1], start + shortest));
	const activePreset = $derived(matchPreset(zone, start, end, firstDay));

	/** The range this component last wrote; anything else came from outside. */
	let written = { start: NaN, end: NaN };
	/** The range last reported through `onchange`. */
	let committed = { start: NaN, end: NaN };
	/** Screen reader announcement of committed changes. */
	let announcement = $state('');

	function describe(a: number, b: number): TimeRangeChange {
		return { from: new Date(a), to: new Date(b), preset: matchPreset(zone, a, b, firstDay) };
	}

	function setRange(a: number, b: number) {
		// `Date` drops fractions of a millisecond; round first so `written` matches what we read back.
		a = Math.round(a);
		b = Math.round(b);
		if (a === start && b === end) return;
		written = { start: a, end: b };
		from = new Date(a);
		to = new Date(b);
		oninput?.(describe(a, b));
	}

	/**
	 * "Current" mode: switched on by the Current button. While the selection contains now,
	 * presets select the current period of their kind instead of the one around the selection.
	 */
	let followCurrent = $state(false);
	const containsNow = (a: number, b: number, time = Date.now()) => a <= time && time < b;

	function commit() {
		if (start === committed.start && end === committed.end) return;
		// Moving the selection away from now ends "current" mode.
		if (followCurrent && !containsNow(start, end)) followCurrent = false;
		committed = { start, end };
		announcement = rangeText;
		onchange?.(describe(start, end));
	}

	// ── View ─────────────────────────────────────────────────────────────────────

	const fitted = (a: number, b: number, preset: Preset | null) =>
		fitView(zone, a, b, preset, limits, firstDay);

	/** `current`, changed as little as possible to show `[a, b)`. */
	const revealed = (current: ViewWindow, a: number, b: number) =>
		revealRange(zone, current, a, b, matchPreset(zone, a, b, firstDay), limits, firstDay);

	let width = $state(0);
	let height = $state(0);
	let view: ViewWindow = $state.raw(untrack(() => fitted(start, end, activePreset)));
	let now = $state(Date.now());

	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), NOW_INTERVAL);
		return () => clearInterval(timer);
	});

	const axis = $derived(
		width > 0
			? computeAxis({
					zone,
					start: timeAt(view, width, 0),
					end: timeAt(view, width, width),
					width,
					locale: lang,
					weekStartsOn: firstDay,
					fontSize: FONT_SIZE
				})
			: null
	);
	/** The labelled ticks; Shift + arrow keys step by these. */
	const majorInterval: Interval = $derived(axis?.interval ?? presetInterval(zoomLevel(view.span)));
	/** The finest visible ticks; snapping and arrow keys use these. */
	const fineInterval: Interval = $derived(axis?.minor ?? majorInterval);

	/**
	 * Where a running animation is taking the range. The toolbar shows this destination right
	 * away, so the range text and the preset buttons do not flicker through the in-between values.
	 */
	let heading = $state<{ start: number; end: number } | null>(null);
	const shownStart = $derived(heading?.start ?? start);
	const shownEnd = $derived(heading?.end ?? end);
	const shownPreset = $derived(matchPreset(zone, shownStart, shownEnd, firstDay));

	/**
	 * The Current button is pressed while the selection is a current period (this week, this
	 * month …), however it got there, or after the button moved a custom range onto now. It
	 * releases by itself once the selection or time moves on.
	 */
	const currentActive = $derived(
		containsNow(shownStart, shownEnd, now) && (shownPreset !== null || followCurrent)
	);

	/** The kind of "last …" window the selection is ("last 7 days" → week), if any. */
	const shownRolling = $derived(matchRolling(zone, shownStart, shownEnd));
	/**
	 * The "last …" button is pressed while the selection is a "last …" window ending now; it
	 * releases by itself once time moves on (the range itself stays put).
	 */
	const rollingActive = $derived(
		shownRolling !== null && Math.abs(shownEnd - now) <= Math.max(precision, MINUTE) + NOW_INTERVAL
	);

	type CurrentKind = Preset | 'range';
	/**
	 * The kind of the selection, which labels the "this …" and "last …" buttons: a calendar
	 * period, else a "last …" window (so "Last 7 days" pairs with "This week"), else 'range'.
	 */
	const currentKind: CurrentKind = $derived(shownPreset ?? shownRolling ?? 'range');
	/** All labels the button can show; it keeps the width of the longest so the toolbar never shifts. */
	const currentKinds: CurrentKind[] = $derived([
		...new Set<CurrentKind>([...presets, 'range', currentKind])
	]);

	const rangeText = $derived(
		formatRange
			? formatRange(new Date(shownStart), new Date(shownEnd))
			: formatRangeText(zone, shownStart, shownEnd, lang, text.quarterFormat)
	);

	// ── Chart ────────────────────────────────────────────────────────────────────

	/** Gap between the handle strip and the top of the chart, in px. */
	const CHART_TOP = 30;
	/** Height of the label row below the axis line, in px (as in TimeAxis). */
	const LABEL_ROW = 22;

	const series = $derived(data ? prepareSeries(data) : null);
	const bins = $derived(
		series && width > 0
			? binSeries(
					series,
					zone,
					timeAt(view, width, 0),
					timeAt(view, width, width),
					chooseBinInterval(view.span / width),
					aggregate,
					firstDay
				)
			: []
	);
	const valueFormat = $derived(
		new Intl.NumberFormat(lang as string | string[] | undefined, { maximumFractionDigits: 2 })
	);
	const compactFormat = $derived(
		new Intl.NumberFormat(lang as string | string[] | undefined, {
			notation: 'compact',
			maximumFractionDigits: 1
		})
	);
	const formatChartValue = (value: number) =>
		(formatValue ? formatValue(value) : valueFormat.format(value)) +
		(valueLabel ? ` ${valueLabel}` : '');
	const formatScale = (value: number) =>
		formatValue ? formatValue(value) : compactFormat.format(value);

	/** The aggregated value inside the selection, for screen readers. */
	const selectionValue = $derived(
		series ? aggregateRange(series, shownStart, shownEnd, aggregate) : null
	);
	const selectionText = $derived(
		selectionValue === null ? rangeText : `${rangeText}, ${formatChartValue(selectionValue)}`
	);

	/** Pointer position over the track while hovering (not dragging), for the chart tooltip. */
	let hoverX: number | null = $state(null);
	const hoveredIndex = $derived.by(() => {
		if (hoverX === null || dragging !== null || bins.length === 0) return null;
		const time = timeAt(view, width, hoverX);
		const index = bins.findIndex((bin) => bin.start <= time && time < bin.end);
		return index >= 0 && bins[index]!.value !== null ? index : null;
	});
	const hoveredBin = $derived(hoveredIndex === null ? null : bins[hoveredIndex]!);
	let tooltipWidth = $state(0);
	const tooltipX = $derived(
		hoveredBin
			? clamp(
					(xAt(view, width, hoveredBin.start) + xAt(view, width, hoveredBin.end)) / 2 -
						tooltipWidth / 2,
					4,
					width - tooltipWidth - 4
				)
			: 0
	);

	function onhover(event: PointerEvent) {
		hoverX = series && event.pointerType !== 'touch' && !pointers.size ? localX(event) : null;
	}

	/** Keeps far off-screen positions small; the track clips everything outside anyway. */
	const onTrack = (x: number) => clamp(x, -64, width + 64);
	const startX = $derived(onTrack(xAt(view, width, start)));
	const endX = $derived(onTrack(xAt(view, width, end)));
	const lowerX = $derived(
		Number.isFinite(lowerBound) ? onTrack(xAt(view, width, lowerBound)) : -64
	);
	const upperX = $derived(
		Number.isFinite(upperBound) ? onTrack(xAt(view, width, upperBound)) : width + 64
	);
	const viewStart = $derived(view.center - view.span / 2);
	const viewEnd = $derived(view.center + view.span / 2);
	/** The "now" marker; drawn above the chart, below the selection. */
	const nowX = $derived(width > 0 ? xAt(view, width, now) : -1);

	// External changes of `from` / `to`: bring the range into view and treat it as committed.
	$effect(() => {
		const s = start;
		const e = end;
		if (s === written.start && e === written.end) return;
		written = { start: s, end: e };
		untrack(() => {
			cancelAnimation();
			committed = { start: s, end: e };
			if (!containsNow(s, e)) followCurrent = false;
			view = revealed(view, s, e);
		});
	});

	// Changed zoom limits or bounds.
	$effect(() => {
		const current = limits;
		untrack(() => {
			view = clampView(view, current);
		});
	});

	// ── Animation (snapping, revealing, scrolling to today) ──────────────────────

	interface Target {
		start: number;
		end: number;
		center: number;
		span: number;
	}

	let animation: { frame: number; finish: () => void } | null = null;

	function animateTo(target: Partial<Target>, done: () => void) {
		finishAnimation();
		const initial: Target = { start, end, center: view.center, span: view.span };
		const goal: Target = { ...initial, ...target };
		const moveView = goal.center !== initial.center || goal.span !== initial.span;
		const apply = (k: number) => {
			const lerp = (a: number, b: number) => (k >= 1 ? b : a + (b - a) * k);
			setRange(lerp(initial.start, goal.start), lerp(initial.end, goal.end));
			if (moveView) {
				view = { center: lerp(initial.center, goal.center), span: lerp(initial.span, goal.span) };
			}
		};
		const finish = () => {
			heading = null;
			apply(1);
			done();
		};
		if (prefersReducedMotion.current || typeof requestAnimationFrame !== 'function') {
			finish();
			return;
		}
		if (goal.start !== initial.start || goal.end !== initial.end) {
			heading = { start: Math.round(goal.start), end: Math.round(goal.end) };
		}
		const startedAt = performance.now();
		const frame = (timestamp: number) => {
			const progress = Math.min(1, (timestamp - startedAt) / ANIMATION_DURATION);
			if (progress < 1) {
				apply(1 - (1 - progress) ** 3);
				animation!.frame = requestAnimationFrame(frame);
			} else {
				animation = null;
				finish();
			}
		};
		animation = { frame: requestAnimationFrame(frame), finish };
	}

	function cancelAnimation() {
		if (animation) cancelAnimationFrame(animation.frame);
		animation = null;
		heading = null;
	}

	/** Jumps to the end of a running animation, so new input starts from its final state. */
	function finishAnimation() {
		const running = animation;
		cancelAnimation();
		running?.finish();
	}

	// ── Pointer input ────────────────────────────────────────────────────────────

	type DragKind = 'from' | 'to' | 'move' | 'pan';

	interface DragGesture {
		type: 'drag';
		kind: DragKind;
		pointerId: number;
		originX: number;
		/** Instant under the pointer when the drag started. */
		originTime: number;
		/** Latest pointer position. */
		x: number;
		threshold: number;
		start: number;
		end: number;
		preset: Preset | null;
		moved: boolean;
	}

	interface PinchGesture {
		type: 'pinch';
		distance: number;
		anchor: number;
		span: number;
	}

	let track: HTMLDivElement | undefined = $state();
	let fromHandle: HTMLDivElement | undefined = $state();
	let toHandle: HTMLDivElement | undefined = $state();
	let selection: HTMLDivElement | undefined = $state();
	let gesture: DragGesture | PinchGesture | null = null;
	let dragging: DragKind | null = $state(null);
	/**
	 * Focus moved by a pointer press. Hides the focus ring, which browsers would otherwise show
	 * for the programmatic `focus()`; the next key press or leaving the track resets it.
	 */
	let pointerFocus = $state(false);
	/** Active pointers on the track: pointerId → x. Only read in event handlers. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- deliberately not reactive
	const pointers = new Map<number, number>();

	function localX(event: MouseEvent): number {
		if (!track) return 0;
		return event.clientX - track.getBoundingClientRect().left - track.clientLeft;
	}

	function localY(event: MouseEvent): number {
		if (!track) return 0;
		return event.clientY - track.getBoundingClientRect().top - track.clientTop;
	}

	const isTouch = (event: PointerEvent) => event.pointerType === 'touch';

	/** What a press at (x, y) grabs: an edge in the handle strip, else the selection or the timeline. */
	function hitTest(x: number, y: number, touch: boolean): DragKind {
		if (y <= (touch ? HANDLE_STRIP.touch : HANDLE_STRIP.mouse)) {
			const reach = touch ? HANDLE_REACH.touch : HANDLE_REACH.mouse;
			const toStart = Math.abs(x - startX);
			const toEnd = Math.abs(x - endX);
			if (Math.min(toStart, toEnd) <= reach) {
				// Handles on top of each other: the side of the pointer decides.
				if (toStart === toEnd) return x < startX ? 'from' : 'to';
				return toStart < toEnd ? 'from' : 'to';
			}
		}
		const half = Math.max(endX - startX, MIN_GRAB_WIDTH) / 2;
		return Math.abs(x - (startX + endX) / 2) <= half ? 'move' : 'pan';
	}

	function onpointerdown(event: PointerEvent) {
		if (disabled || !track || (event.pointerType === 'mouse' && event.button !== 0)) return;
		event.preventDefault();
		finishAnimation();
		const x = localX(event);
		pointers.set(event.pointerId, x);
		try {
			track.setPointerCapture(event.pointerId);
		} catch {
			// The pointer is no longer active (or the event is synthetic); dragging still works.
		}
		if (pointers.size === 2) {
			endDrag(false);
			beginPinch();
			return;
		}
		if (pointers.size > 2) return;
		const kind = hitTest(x, localY(event), isTouch(event));
		gesture = {
			type: 'drag',
			kind,
			pointerId: event.pointerId,
			originX: x,
			originTime: timeAt(view, width || 1, x),
			x,
			threshold: isTouch(event) ? DRAG_THRESHOLD.touch : DRAG_THRESHOLD.mouse,
			start,
			end,
			preset: activePreset,
			moved: false
		};
		dragging = kind;
		// Focus the grabbed part so the keyboard can take over (default focus was prevented above).
		const focusTarget = { from: fromHandle, to: toHandle, move: selection, pan: undefined }[kind];
		focusTarget?.focus({ preventScroll: true });
		// After focus(): moving focus between parts fires focusout, which clears the flag.
		pointerFocus = true;
	}

	function onpointermove(event: PointerEvent) {
		onhover(event);
		if (!pointers.has(event.pointerId)) return;
		const x = localX(event);
		pointers.set(event.pointerId, x);
		if (gesture?.type === 'pinch') {
			pinchTo(gesture);
			return;
		}
		if (gesture?.type !== 'drag' || gesture.pointerId !== event.pointerId || width === 0) return;
		const drag = gesture;
		if (!drag.moved && Math.abs(x - drag.originX) < drag.threshold) return;
		drag.moved = true;
		const dx = x - drag.x;
		drag.x = x;
		if (drag.kind === 'pan') {
			view = clampView({ center: view.center - (dx / width) * view.span, span: view.span }, limits);
			return;
		}
		applyDrag(drag);
		updateEdgeScroll();
	}

	function onpointerup(event: PointerEvent) {
		if (!pointers.delete(event.pointerId)) return;
		if (gesture?.type === 'pinch') {
			if (pointers.size === 0) {
				gesture = null;
				dragging = null;
			}
			return;
		}
		if (gesture?.type === 'drag' && gesture.pointerId === event.pointerId) {
			endDrag(event.type === 'pointerup');
		}
	}

	const roundTime = (time: number) => Math.round(time / precision) * precision;

	/** Moves the dragged part to the instant under the pointer (the view may have scrolled). */
	function applyDrag(drag: DragGesture) {
		const delta = timeAt(view, width, drag.x) - drag.originTime;
		switch (drag.kind) {
			case 'move': {
				const shift = clamp(
					roundTime(drag.start + delta) - drag.start,
					lowerBound - drag.start,
					upperBound - drag.end
				);
				setRange(drag.start + shift, drag.end + shift);
				break;
			}
			case 'from':
				setRange(clamp(roundTime(drag.start + delta), lowerBound, end - shortest), end);
				break;
			case 'to':
				setRange(start, clamp(roundTime(drag.end + delta), start + shortest, upperBound));
				break;
		}
		previewDrop(drag);
	}

	/**
	 * While dragging: where the range will land when it is dropped (after snapping), and the
	 * ticks its dragged edges will stick to. The ruler highlights both as the drag goes on.
	 */
	let dropPreview: { start: number; end: number; marks: number[] } | null = $state(null);

	function previewDrop(drag: DragGesture) {
		const target = snapTarget(drag);
		const a = target?.start ?? start;
		const b = target?.end ?? end;
		const dragged = drag.kind === 'from' ? [a] : drag.kind === 'to' ? [b] : [a, b];
		// Only edges that actually land on a tick are marked.
		const onTick = (time: number) =>
			[fineInterval, majorInterval].some(
				(interval) => floorTime(zone, time, interval, firstDay) === time
			);
		dropPreview = { start: a, end: b, marks: target ? dragged.filter(onTick) : [] };
	}

	// While a drag is near an edge, the timeline scrolls and the dragged part follows.

	let edgeFrame = 0;
	let edgeTimestamp = 0;

	/** Scroll speed for a pointer at `x`, in px per second; negative scrolls towards the past. */
	function edgeVelocity(x: number): number {
		if (x < EDGE_ZONE) return -EDGE_SPEED * Math.min(2, (EDGE_ZONE - x) / EDGE_ZONE);
		if (x > width - EDGE_ZONE) return EDGE_SPEED * Math.min(2, (x - width + EDGE_ZONE) / EDGE_ZONE);
		return 0;
	}

	function updateEdgeScroll() {
		const drag = gesture;
		if (drag?.type !== 'drag' || drag.kind === 'pan' || edgeVelocity(drag.x) === 0) {
			stopEdgeScroll();
			return;
		}
		if (edgeFrame || typeof requestAnimationFrame !== 'function') return;
		edgeTimestamp = performance.now();
		edgeFrame = requestAnimationFrame(edgeScroll);
	}

	function edgeScroll(timestamp: number) {
		edgeFrame = 0;
		const drag = gesture;
		if (drag?.type !== 'drag' || width === 0) return;
		const velocity = edgeVelocity(drag.x);
		if (velocity === 0) return;
		const seconds = Math.min(0.05, Math.max(0, (timestamp - edgeTimestamp) / 1000));
		edgeTimestamp = timestamp;
		const before = view.center;
		const shift = velocity * seconds * (view.span / width);
		view = clampView({ center: view.center + shift, span: view.span }, limits);
		if (view.center !== before) applyDrag(drag);
		else if (seconds > 0) return; // reached min / max
		edgeFrame = requestAnimationFrame(edgeScroll);
	}

	function stopEdgeScroll() {
		if (edgeFrame) cancelAnimationFrame(edgeFrame);
		edgeFrame = 0;
	}

	function endDrag(snap: boolean) {
		const drag = gesture;
		gesture = null;
		dragging = null;
		dropPreview = null;
		stopEdgeScroll();
		if (drag?.type !== 'drag') return;
		if (drag.kind === 'pan' && !drag.moved && snap) {
			// A click (no drag) on the timeline outside the selection.
			placeAt(drag.originTime);
			return;
		}
		if (drag.kind === 'pan' || !drag.moved) {
			commit();
			return;
		}
		// Snap, and bring the range back into view if it was dragged (partly) out of it.
		const target: Partial<Target> = (snap && snapTarget(drag)) || {};
		const shown = revealed(view, target.start ?? start, target.end ?? end);
		if (shown !== view) Object.assign(target, shown);
		if (Object.keys(target).length > 0) animateTo(target, commit);
		else commit();
	}

	/** Snapping distance in ms at the current zoom; 0 when snapping is off. */
	const snapDistance = () =>
		width > 0 && snapThreshold > 0 ? snapThreshold * (view.span / width) : 0;

	/**
	 * `[a, b)` shifted so that the edge closest to a tick sits on it, keeping the duration;
	 * unchanged if no tick is within the snapping distance.
	 */
	function snapRange(a: number, b: number): [number, number] {
		const threshold = snapDistance();
		if (threshold === 0) return [a, b];
		const snap = (time: number) => snapTime(zone, time, fineInterval, threshold, firstDay);
		const snappedA = snap(a);
		const snappedB = snap(b);
		const toA = snappedA === null ? Infinity : Math.abs(snappedA - a);
		const toB = snappedB === null ? Infinity : Math.abs(snappedB - b);
		if (toA === Infinity && toB === Infinity) return [a, b];
		const shift = toA <= toB ? snappedA! - a : snappedB! - b;
		return a + shift >= lowerBound && b + shift <= upperBound ? [a + shift, b + shift] : [a, b];
	}

	/**
	 * After a click on the timeline: moves the range to the clicked instant. A calendar period
	 * becomes the period of the same kind there; other ranges keep their duration, centered on
	 * the click and snapped to the nearest tick.
	 */
	function placeAt(time: number) {
		let a: number;
		let b: number;
		if (activePreset) {
			const at = clamp(time, lowerBound, upperBound - 1);
			[a, b] = periodAt(zone, at, activePreset, firstDay);
			[a, b] = [Math.max(a, lowerBound), Math.min(b, upperBound)];
			if (b - a < shortest) return;
		} else {
			const duration = end - start;
			const centered = clamp(time - duration / 2, lowerBound, upperBound - duration);
			[a, b] = snapRange(centered, centered + duration);
		}
		if (a === start && b === end) return;
		animateTo({ start: a, end: b, ...revealed(view, a, b) }, commit);
	}

	/** Where the dragged part should snap to, or `null` if no tick is close enough. */
	function snapTarget(drag: DragGesture): Partial<Target> | null {
		const threshold = snapDistance();
		if (threshold === 0) return null;
		const snap = (time: number) => snapTime(zone, time, fineInterval, threshold, firstDay);
		switch (drag.kind) {
			case 'pan':
				return null;
			case 'from': {
				const time = snap(start);
				return time !== null && time >= lowerBound && time <= end - shortest
					? { start: time }
					: null;
			}
			case 'to': {
				const time = snap(end);
				return time !== null && time <= upperBound && time >= start + shortest
					? { end: time }
					: null;
			}
			case 'move': {
				// A calendar period (a week, a month …) snaps to a whole period of the same kind.
				if (drag.preset) {
					const interval = presetInterval(drag.preset);
					const boundary = nearestBoundary(zone, start, interval, firstDay);
					if (Math.abs(boundary - start) <= threshold) {
						const [a, b] = periodAt(zone, boundary, drag.preset, firstDay);
						if (a >= lowerBound && b <= upperBound) return { start: a, end: b };
					}
				}
				// Otherwise the edge closest to a tick snaps; the other keeps the duration.
				const [a, b] = snapRange(start, end);
				return a !== start ? { start: a, end: b } : null;
			}
		}
	}

	function beginPinch() {
		const [a = 0, b = 0] = pointers.values();
		gesture = {
			type: 'pinch',
			distance: Math.max(1, Math.abs(b - a)),
			anchor: timeAt(view, width || 1, (a + b) / 2),
			span: view.span
		};
		dragging = 'pan';
	}

	function pinchTo(pinch: PinchGesture) {
		if (pointers.size !== 2 || width === 0) return;
		const [a = 0, b = 0] = pointers.values();
		const span = clamp(
			(pinch.span * pinch.distance) / Math.max(1, Math.abs(b - a)),
			limits.minSpan,
			limits.maxSpan
		);
		view = clampView({ center: pinch.anchor - ((a + b) / 2 / width - 0.5) * span, span }, limits);
	}

	function onwheel(event: WheelEvent) {
		if (disabled || width === 0) return;
		event.preventDefault();
		finishAnimation();
		const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1;
		let dx = event.deltaX * unit;
		let dy = event.deltaY * unit;
		if (event.shiftKey && dx === 0) [dx, dy] = [dy, 0];
		if (Math.abs(dx) > Math.abs(dy)) {
			view = clampView({ center: view.center + (dx / width) * view.span, span: view.span }, limits);
		} else if (dy !== 0) {
			// Trackpad pinch arrives as ctrl + wheel with small deltas.
			const rate = event.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM;
			zoom(Math.exp(clamp(dy, -100, 100) * rate), localX(event));
		}
	}

	// Registered manually: wheel listeners must be non-passive to prevent page scrolling.
	$effect(() => {
		if (!track) return;
		return on(track, 'wheel', onwheel, { passive: false });
	});

	function ondblclick(event: MouseEvent) {
		if (disabled || width === 0) return;
		selectPreset(zoomLevel(view.span), timeAt(view, width, localX(event)));
	}

	// ── Keyboard input ───────────────────────────────────────────────────────────

	type Part = 'from' | 'to' | 'range';

	const KEY_DIRECTION: Readonly<Record<string, 1 | -1>> = {
		ArrowLeft: -1,
		ArrowDown: -1,
		PageDown: -1,
		ArrowRight: 1,
		ArrowUp: 1,
		PageUp: 1
	};

	/** The range moved so its start lands on the previous / next tick. */
	function nudge(direction: 1 | -1): [number, number] {
		const a = stepBoundary(zone, start, fineInterval, direction, firstDay);
		return [a, a + (end - start)];
	}

	/** The range after a key press on `part`, or `null` if the key does nothing. */
	function keyTarget(event: KeyboardEvent, part: Part): [number, number] | null {
		const direction = KEY_DIRECTION[event.key];
		const coarse = event.shiftKey || event.key === 'PageUp' || event.key === 'PageDown';
		if (part === 'range') {
			if (!direction) return null;
			const [a, b] = event.shiftKey
				? nudge(direction)
				: adjacentRange(zone, start, end, direction, firstDay);
			return a >= lowerBound && b <= upperBound ? [a, b] : null;
		}
		let time = part === 'from' ? start : end;
		if (event.key === 'Home') time = part === 'from' ? lowerBound : start + shortest;
		else if (event.key === 'End') time = part === 'from' ? end - shortest : upperBound;
		else if (direction) {
			const interval = coarse ? majorInterval : fineInterval;
			time = stepBoundary(zone, time, interval, direction, firstDay);
		} else return null;
		if (!Number.isFinite(time)) return null;
		return part === 'from'
			? [clamp(time, lowerBound, end - shortest), end]
			: [start, clamp(time, start + shortest, upperBound)];
	}

	function onkeydown(event: KeyboardEvent, part: Part) {
		if (disabled) return;
		// Complete a running snap first, so the step starts from the snapped value.
		finishAnimation();
		const target = keyTarget(event, part);
		if (!target) return;
		event.preventDefault();
		setRange(...target);
		view = revealed(view, start, end);
		commit();
	}

	function ontrackkeydown(event: KeyboardEvent) {
		pointerFocus = false;
		if (disabled || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
			return;
		if (event.key === '+' || event.key === '=') zoomIn();
		else if (event.key === '-' || event.key === '_') zoomOut();
		else return;
		event.preventDefault();
	}

	// ── Collapsible (e.g. over a map on a phone) ─────────────────────────────────

	let root: HTMLDivElement | undefined = $state();
	/** The ruler is shown: always, unless `collapsible` and closed. */
	const open = $derived(!collapsible || expanded);

	function onrootkeydown(event: KeyboardEvent) {
		if (!collapsible || !open || event.key !== 'Escape') return;
		expanded = false;
		root?.querySelector<HTMLElement>('.trs-disclosure')?.focus();
	}

	// Pressing anywhere outside the open control (on the map) closes it again.
	$effect(() => {
		if (!collapsible || !open) return;
		return on(document, 'pointerdown', (event) => {
			if (root && !root.contains(event.target as Node)) expanded = false;
		});
	});

	// ── Public API (via bind:this) ───────────────────────────────────────────────

	/** Zooms by `factor` (< 1 zooms in) around `anchorX` px (default: the center). */
	export function zoom(factor: number, anchorX?: number) {
		finishAnimation();
		const w = width || 1;
		view = zoomView(view, w, factor, anchorX ?? w / 2, limits);
	}

	export function zoomIn() {
		zoom(ZOOM_IN);
	}

	export function zoomOut() {
		zoom(ZOOM_OUT);
	}

	/** Selects the calendar period of `preset` that contains `at` (default: the middle of the range). */
	export function selectPreset(preset: Preset, at: Date | number = (start + end) / 2) {
		finishAnimation();
		// Within min / max, even if the current range is not (e.g. after the bounds changed).
		const time = clamp(typeof at === 'number' ? at : at.getTime(), lowerBound, upperBound - 1);
		const [a, b] = periodAt(zone, time, preset, firstDay);
		const clampedStart = Math.max(a, lowerBound);
		const clampedEnd = Math.min(b, upperBound);
		if (clampedEnd - clampedStart < shortest) return;
		setRange(clampedStart, clampedEnd);
		view = fitted(clampedStart, clampedEnd, preset);
		commit();
	}

	/** Moves the range to the previous (-1) or next (1) period of the same length. */
	export function shift(direction: 1 | -1) {
		finishAnimation();
		const [a, b] = adjacentRange(zone, start, end, direction, firstDay);
		if (a < lowerBound || b > upperBound) return;
		setRange(a, b);
		view = revealed(view, a, b);
		commit();
	}

	/** Centers and zooms the timeline on the selected range. */
	export function reveal() {
		finishAnimation();
		view = fitted(start, end, activePreset);
	}

	/**
	 * Moves the selection to the current period of its kind: this hour, day, week, month, quarter or year.
	 * Other ranges keep their duration and move by whole durations until they contain now.
	 * Also switches on "current" mode, in which presets select the current period of their kind.
	 */
	export function selectCurrent() {
		finishAnimation();
		now = Date.now();
		followCurrent = true;
		const kind = activePreset ?? matchRolling(zone, start, end);
		if (kind) {
			selectPreset(kind, now);
			return;
		}
		const duration = end - start;
		const steps = Math.floor((now - start) / duration);
		const a = clamp(start + steps * duration, lowerBound, upperBound - duration);
		setRange(a, a + duration);
		view = revealed(view, a, a + duration);
		commit();
	}

	/**
	 * Selects the "last …" window ending now: of `kind`, or of the selection's kind ("This week"
	 * → last 7 days). Other ranges keep their length and are moved to end now.
	 */
	export function selectRolling(kind?: Preset) {
		finishAnimation();
		now = Date.now();
		followCurrent = false;
		const windowKind = kind ?? activePreset ?? matchRolling(zone, start, end);
		// Ends at the end of the current minute (or `step`), so the current moment is included.
		const endAt = Math.min(upperBound, Math.ceil(now / precision) * precision);
		const [a, b] = windowKind
			? rollingRange(zone, endAt, windowKind)
			: [endAt - (end - start), endAt];
		const clampedStart = Math.max(a, lowerBound);
		if (b - clampedStart < shortest) return;
		setRange(clampedStart, b);
		view = revealRange(zone, view, clampedStart, b, windowKind, limits, firstDay);
		commit();
	}

	/**
	 * A preset button: in "last …" mode the window of that kind ending now, in "current" mode
	 * the current period, else the period around the selection. The dropdown passes
	 * `rolling: false`: it has its own "last …" options.
	 */
	function choosePreset(preset: Preset, rolling = true) {
		if (rolling && rollingActive) selectRolling(preset);
		else selectPreset(preset, currentActive ? Date.now() : (start + end) / 2);
	}

	/** The period dropdown's value: a preset, `last:<kind>` for a "last …" window, or ''. */
	const selectValue = $derived(
		rollingActive && shownRolling && presets.includes(shownRolling)
			? `last:${shownRolling}`
			: shownPreset !== null && presets.includes(shownPreset)
				? currentActive
					? `this:${shownPreset}`
					: shownPreset
				: ''
	);

	/** The dropdown: `<kind>` a period, `this:<kind>` the current one, `last:<kind>` a window. */
	function onselectchange(value: string) {
		if (value.startsWith('last:')) selectRolling(value.slice(5) as Preset);
		else if (value.startsWith('this:')) {
			followCurrent = true;
			selectPreset(value.slice(5) as Preset, Date.now());
		} else if (value) choosePreset(value as Preset, false);
	}
</script>

<div
	{...rest}
	bind:this={root}
	class={['trs', className]}
	data-disabled={disabled || undefined}
	data-chart={series ? chart : undefined}
	data-collapsible={collapsible || undefined}
	onkeydown={onrootkeydown}
>
	<!-- Collapsible: the ruler opens above the toolbar, so a control at the bottom of a map grows upwards. -->
	<div class="trs-ruler" id="{uid}-ruler" hidden={!open}>
		<!-- Pointer and wheel input complement the keyboard-operable sliders inside the track. -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={track}
			bind:clientWidth={width}
			bind:clientHeight={height}
			class="trs-track"
			data-dragging={dragging}
			data-pointer-focus={pointerFocus || undefined}
			role="group"
			aria-label={text.timeline}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={onpointerup}
			onlostpointercapture={onpointerup}
			onpointerleave={() => (hoverX = null)}
			{ondblclick}
			onkeydown={ontrackkeydown}
			onfocusout={() => (pointerFocus = false)}
		>
			{#if axis}
				<TimeAxis
					{axis}
					{view}
					{width}
					{height}
					fontSize={FONT_SIZE}
					highlightStart={dropPreview?.start ?? shownStart}
					highlightEnd={dropPreview?.end ?? shownEnd}
					marks={dropPreview?.marks ?? []}
				/>
			{/if}
			{#if series && width > 0}
				<TimeChart
					{bins}
					kind={chart}
					{view}
					{width}
					{height}
					top={CHART_TOP}
					baseline={height - LABEL_ROW}
					selectionStart={startX}
					selectionEnd={endX}
					hovered={hoveredIndex}
					{formatScale}
					id={uid}
				/>
			{/if}
			{#if nowX >= 0 && nowX <= width}
				<div class="trs-now" style:left="{nowX}px"></div>
			{/if}
			{#if lowerX > 0}
				<div class="trs-out-of-range" style:left="0" style:width="{lowerX}px"></div>
			{/if}
			{#if upperX < width}
				<div class="trs-out-of-range" style:left="{upperX}px" style:right="0"></div>
			{/if}
			<div
				bind:this={selection}
				class="trs-selection"
				style:left="{startX}px"
				style:width="{endX - startX}px"
				role="slider"
				tabindex={disabled ? -1 : 0}
				aria-label={text.range}
				aria-orientation="horizontal"
				aria-valuemin={Math.min(start, Number.isFinite(lowerBound) ? lowerBound : viewStart)}
				aria-valuemax={Math.max(
					start,
					(Number.isFinite(upperBound) ? upperBound : viewEnd) - (end - start)
				)}
				aria-valuenow={start}
				aria-valuetext={selectionText}
				aria-disabled={disabled || undefined}
				onkeydown={(event) => onkeydown(event, 'range')}
			></div>
			<div
				bind:this={fromHandle}
				class="trs-handle"
				class:trs-handle-active={dragging === 'from'}
				style:left="{startX}px"
				role="slider"
				tabindex={disabled ? -1 : 0}
				aria-label={text.start}
				aria-orientation="horizontal"
				aria-valuemin={Math.min(start, Number.isFinite(lowerBound) ? lowerBound : viewStart)}
				aria-valuemax={end - shortest}
				aria-valuenow={start}
				aria-valuetext={formatDateTime(zone, start, lang)}
				aria-disabled={disabled || undefined}
				onkeydown={(event) => onkeydown(event, 'from')}
			>
				<span class="trs-knob"></span>
			</div>
			<div
				bind:this={toHandle}
				class="trs-handle"
				class:trs-handle-active={dragging === 'to'}
				style:left="{endX}px"
				role="slider"
				tabindex={disabled ? -1 : 0}
				aria-label={text.end}
				aria-orientation="horizontal"
				aria-valuemin={start + shortest}
				aria-valuemax={Math.max(end, Number.isFinite(upperBound) ? upperBound : viewEnd)}
				aria-valuenow={end}
				aria-valuetext={formatDateTime(zone, end, lang)}
				aria-disabled={disabled || undefined}
				onkeydown={(event) => onkeydown(event, 'to')}
			>
				<span class="trs-knob"></span>
			</div>
		</div>
	</div>
	{#if open && hoveredBin && hoveredBin.value !== null}
		<!-- Floats above the ruler, so it never covers the handles. Mouse only: the total inside the selection reaches screen readers via the slider. -->
		<div
			class="trs-tooltip"
			bind:clientWidth={tooltipWidth}
			style:left="{tooltipX}px"
			aria-hidden="true"
		>
			<strong>{formatChartValue(hoveredBin.value)}</strong>
			<span
				>{formatRangeText(zone, hoveredBin.start, hoveredBin.end, lang, text.quarterFormat)}</span
			>
		</div>
	{/if}

	{#if toolbar}
		<div class="trs-toolbar">
			{#if presets.length > 0}
				<!-- Buttons where there is room, a dropdown on narrow widths (CSS container query). -->
				<div class="trs-segmented trs-preset-buttons" role="group" aria-label={text.presetGroup}>
					{#each presets as preset (preset)}
						<button
							type="button"
							class="trs-segment"
							aria-pressed={currentKind === preset}
							{disabled}
							onclick={() => choosePreset(preset)}>{text.presets[preset]}</button
						>
					{/each}
				</div>
				<select
					class="trs-preset-select"
					aria-label={text.presetGroup}
					value={selectValue}
					{disabled}
					onchange={(event) => onselectchange(event.currentTarget.value)}
				>
					<option value="" disabled>{text.customPreset}</option>
					<optgroup label={text.presetGroup}>
						{#each presets as preset (preset)}
							<option value={preset}>{text.presets[preset]}</option>
						{/each}
					</optgroup>
					<optgroup label={text.currentGroup}>
						{#each presets as preset (preset)}
							<option value="this:{preset}">{text.current[preset]}</option>
						{/each}
					</optgroup>
					<optgroup label={text.rollingGroup}>
						{#each presets as preset (preset)}
							<option value="last:{preset}">{text.rolling[preset]}</option>
						{/each}
					</optgroup>
				</select>
			{/if}
			{#if collapsible}
				<!-- The range text opens and closes the ruler: the biggest target in the bar. -->
				<button
					type="button"
					class="trs-range-text trs-disclosure"
					aria-expanded={open}
					aria-controls="{uid}-ruler"
					title={open ? text.hideTimeline : text.showTimeline}
					onclick={() => (expanded = !open)}
				>
					<span class="trs-disclosure-text">{rangeText}</span>
					<span class="trs-chevron" aria-hidden="true"></span>
				</button>
			{:else}
				<strong class="trs-range-text" title={rangeText}>{rangeText}</strong>
			{/if}
			<div class="trs-actions">
				<button
					type="button"
					class="trs-button trs-current"
					aria-pressed={currentActive}
					{disabled}
					onclick={selectCurrent}
				>
					<!-- Hidden labels only reserve width; they are not part of the accessible name. -->
					{#each currentKinds as kind (kind)}
						<span class="trs-current-label" class:trs-current-shown={kind === currentKind}
							>{text.current[kind]}</span
						>
					{/each}
				</button>
				<button
					type="button"
					class="trs-button trs-current trs-rolling"
					aria-pressed={rollingActive}
					{disabled}
					onclick={() => selectRolling()}
				>
					{#each currentKinds as kind (kind)}
						<span class="trs-current-label" class:trs-current-shown={kind === currentKind}
							>{text.rolling[kind]}</span
						>
					{/each}
				</button>
				<div class="trs-segmented trs-zoom" role="group" aria-label={text.zoomGroup}>
					<button
						type="button"
						class="trs-segment trs-icon"
						aria-label={text.zoomOut}
						title={text.zoomOut}
						{disabled}
						onclick={zoomOut}>−</button
					>
					<button
						type="button"
						class="trs-segment trs-icon"
						aria-label={text.zoomIn}
						title={text.zoomIn}
						{disabled}
						onclick={zoomIn}>+</button
					>
				</div>
			</div>
		</div>
	{/if}

	<div class="trs-visually-hidden" role="status">{announcement}</div>
</div>

<style>
	.trs {
		/* Public theme variables (all optional): --trs-accent, --trs-accent-contrast, --trs-text,
		   --trs-muted, --trs-border, --trs-surface, --trs-track-background, --trs-selection,
		   --trs-tick, --trs-now, --trs-chart, --trs-chart-muted, --trs-height, --trs-radius,
		   --trs-font-size.
		   Defaults follow the page's color-scheme. */
		--_accent: var(--trs-accent, light-dark(#2563eb, #60a5fa));
		--_accent-contrast: var(--trs-accent-contrast, light-dark(#ffffff, #0b1220));
		--_text: var(--trs-text, light-dark(#0f172a, #e2e8f0));
		--_muted: var(--trs-muted, light-dark(#64748b, #94a3b8));
		--_border: var(--trs-border, light-dark(#cbd5e1, #334155));
		--_surface: var(--trs-surface, light-dark(#ffffff, #1e293b));
		--_track: var(--trs-track-background, light-dark(#f8fafc, #0f172a));
		--_now: var(--trs-now, light-dark(#e11d48, #fb7185));
		/* Chart: data inside the selection in the accent, outside in a quiet grey. Validated
		   against the track backgrounds (3:1 for marks; dark accent inside the dark band). */
		--_chart: var(--trs-chart, light-dark(#2563eb, #3b82f6));
		--_chart-muted: var(--trs-chart-muted, light-dark(#8592a8, #64748b));
		--_selection: var(--trs-selection, color-mix(in srgb, var(--_accent) 16%, transparent));
		--_tick: var(--trs-tick, light-dark(#94a3b8, #64748b));
		--_hover: color-mix(in srgb, var(--_text) 6%, var(--_surface));
		--_tick-minor: color-mix(in srgb, var(--_tick) 55%, transparent);
		--_axis-line: color-mix(in srgb, var(--_tick) 60%, transparent);
		--_out-of-range: color-mix(in srgb, var(--_muted) 14%, transparent);
		--_radius: var(--trs-radius, 8px);

		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		color: var(--_text);
		font-size: var(--trs-font-size, 13px);
		/* The toolbar adapts to the width of the component, not of the screen (see @container). */
		container-type: inline-size;
		/* Anchors the chart tooltip, which floats above the ruler. */
		position: relative;
	}

	.trs[data-disabled] {
		opacity: 0.6;
	}

	/* One row: presets · range text · current-period and zoom buttons. */
	.trs-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 12px;
		align-items: center;
	}

	/* A fixed basis and a single line: a longer text never changes how the toolbar wraps. */
	.trs-range-text {
		flex: 1 1 0;
		min-width: 10em;
		overflow: hidden;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Collapsible: a floating card for use over a map or image. */
	.trs[data-collapsible] {
		padding: 8px;
		border: 1px solid var(--_border);
		border-radius: 12px;
		background: var(--_surface);
		box-shadow: 0 4px 16px rgb(15 23 42 / 0.16);
	}

	.trs-ruler {
		display: flex;
		flex-direction: column;
	}

	/* `display` above would otherwise override the hidden attribute. */
	.trs-ruler[hidden] {
		display: none;
	}

	.trs[data-collapsible] .trs-ruler:not([hidden]) {
		animation: trs-open 160ms ease-out;
	}

	@keyframes trs-open {
		from {
			opacity: 0;
			translate: 0 6px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.trs[data-collapsible] .trs-ruler:not([hidden]) {
			animation: none;
		}
	}

	/* The range text as the toggle: same look, plus a chevron pointing where the ruler goes. */
	.trs-disclosure {
		display: flex;
		gap: 6px;
		align-items: center;
		justify-content: center;
		min-height: 30px;
		padding: 2px 8px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.trs-disclosure:hover {
		background: var(--_hover);
	}

	.trs-disclosure:focus-visible {
		outline: 2px solid var(--_accent);
		outline-offset: 1px;
	}

	.trs-disclosure-text {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.trs-chevron {
		flex: none;
		width: 7px;
		height: 7px;
		border-top: 2px solid currentColor;
		border-left: 2px solid currentColor;
		rotate: 45deg;
		translate: 0 2px;
		transition: rotate 160ms ease;
	}

	.trs-disclosure[aria-expanded='true'] .trs-chevron {
		rotate: 225deg;
		translate: 0 -2px;
	}

	.trs-actions {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}

	/* Buttons are 30px tall; segmented controls hold their buttons in one bordered pill. */
	.trs-segmented {
		display: inline-flex;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--_border);
		border-radius: 8px;
		background: var(--_surface);
	}

	.trs-button,
	.trs-segment {
		color: inherit;
		font: inherit;
		line-height: 1.2;
		cursor: pointer;
	}

	.trs-button {
		min-height: 30px;
		padding: 4px 12px;
		border: 1px solid var(--_border);
		border-radius: 8px;
		background: var(--_surface);
	}

	.trs-segment {
		min-height: 24px;
		padding: 2px 10px;
		border: 0;
		border-radius: 6px;
		background: transparent;
	}

	.trs-button:hover:not(:disabled, [aria-pressed='true']),
	.trs-segment:hover:not(:disabled, [aria-pressed='true']) {
		background: var(--_hover);
	}

	.trs-segment[aria-pressed='true'],
	.trs-button[aria-pressed='true'] {
		border-color: var(--_accent);
		background: var(--_accent);
		color: var(--_accent-contrast);
	}

	.trs-button:focus-visible,
	.trs-segment:focus-visible {
		outline: 2px solid var(--_accent);
		outline-offset: 1px;
	}

	.trs-button:disabled,
	.trs-segment:disabled {
		cursor: default;
	}

	.trs-icon {
		min-width: 28px;
		padding-inline: 6px;
		font-size: 1.15em;
		line-height: 1;
	}

	/* All labels share one grid cell: the button is as wide as the longest, only one is visible. */
	.trs-current {
		display: inline-grid;
		align-items: center;
		justify-items: center;
	}

	.trs-current-label {
		grid-area: 1 / 1;
		visibility: hidden;
		white-space: nowrap;
	}

	.trs-current-shown {
		visibility: visible;
	}

	@media (pointer: coarse) {
		.trs-button {
			min-height: 36px;
		}

		.trs-segment {
			min-height: 30px;
		}

		/* Touch screens zoom with a pinch; the buttons would only take room. */
		.trs-zoom {
			display: none;
		}
	}

	/* Six presets in German or Russian still fit a phone-width component in one row. */
	/* The period dropdown replaces the preset buttons on narrow widths. */
	.trs-preset-select {
		display: none;
		min-height: 30px;
		padding: 4px 26px 4px 10px;
		border: 1px solid var(--_border);
		border-radius: 8px;
		/* A small chevron drawn with two gradients, so it follows the text colour. */
		background:
			linear-gradient(45deg, transparent 50%, currentColor 50%) calc(100% - 15px) 55% / 5px 5px
				no-repeat,
			linear-gradient(135deg, currentColor 50%, transparent 50%) calc(100% - 10px) 55% / 5px 5px
				no-repeat,
			var(--_surface);
		color: inherit;
		font: inherit;
		line-height: 1.2;
		cursor: pointer;
		appearance: none;
	}

	.trs-preset-select:hover:not(:disabled) {
		background-color: var(--_hover);
	}

	.trs-preset-select:focus-visible {
		outline: 2px solid var(--_accent);
		outline-offset: 1px;
	}

	.trs-preset-select:disabled {
		cursor: default;
	}

	@media (pointer: coarse) {
		.trs-preset-select {
			min-height: 36px;
		}
	}

	/* Narrow: all controls in one row — dropdown · range text (up to two lines) · buttons. */
	@container (max-width: 680px) {
		/* The presets give way to the dropdown. */
		.trs-preset-buttons,
		.trs-rolling {
			display: none;
		}

		.trs-preset-select {
			display: block;
		}

		.trs-toolbar {
			flex-wrap: nowrap;
			gap: 8px;
		}

		.trs-range-text {
			min-width: 0;
			font-size: 0.95em;
			line-height: 1.15;
			white-space: normal;
		}

		.trs-range-text:not(.trs-disclosure),
		.trs-disclosure-text {
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}

		/* The date range on the left, one dropdown with every choice on the right. */
		.trs-range-text {
			order: -1;
			flex: 1 1 0;
			text-align: start;
		}

		.trs-disclosure {
			justify-content: flex-start;
			padding-inline: 4px;
		}

		.trs-preset-select {
			flex: none;
			margin-inline-start: auto;
		}

		/* "This …", "Last …" and zoom live in the dropdown (and the wheel / pinch / keys). */
		.trs-toolbar:has(.trs-preset-select) .trs-actions {
			display: none;
		}
	}

	.trs-track {
		position: relative;
		height: var(--trs-height, 64px);
		/* clip, not hidden: focusing an off-screen handle must not scroll the track. */
		overflow: clip;
		border: 1px solid var(--_border);
		border-radius: var(--_radius);
		background: var(--_track);
		cursor: grab;
		/* Horizontal drags belong to the timeline; vertical swipes still scroll the page. */
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.trs-track[data-dragging='pan'],
	.trs-track[data-dragging='move'] {
		cursor: grabbing;
	}

	.trs-track[data-dragging='from'],
	.trs-track[data-dragging='to'] {
		cursor: ew-resize;
	}

	.trs-track[data-dragging] * {
		cursor: inherit;
	}

	.trs[data-disabled] .trs-track,
	.trs[data-disabled] .trs-track * {
		cursor: default;
	}

	/* With a chart the ruler grows: the plot sits between the handle strip and the axis line. */
	.trs[data-chart] .trs-track {
		height: var(--trs-height, 104px);
	}

	/* The current time: a thin line from the handle strip to the axis, above the chart. */
	.trs-now {
		position: absolute;
		top: 24px;
		bottom: 22px;
		width: 1.5px;
		translate: -50% 0;
		background: var(--_now);
		pointer-events: none;
	}

	.trs-now::before {
		position: absolute;
		top: -3px;
		left: 50%;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		translate: -50% 0;
		background: var(--_now);
		content: '';
	}

	/* Chart tooltip, just above the ruler: the value leads, the bucket follows. Mouse only. */
	.trs-tooltip {
		position: absolute;
		z-index: 2;
		top: -6px;
		translate: 0 -100%;
		display: flex;
		gap: 6px;
		align-items: baseline;
		padding: 3px 8px;
		border: 1px solid var(--_border);
		border-radius: 6px;
		background: var(--_surface);
		box-shadow: 0 2px 8px rgb(15 23 42 / 0.12);
		font-size: 12px;
		line-height: 1.3;
		white-space: nowrap;
		pointer-events: none;
	}

	.trs-tooltip strong {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.trs-tooltip span {
		color: var(--_muted);
	}

	.trs-out-of-range {
		position: absolute;
		top: 0;
		bottom: 0;
		background: repeating-linear-gradient(135deg, var(--_out-of-range) 0 4px, transparent 4px 9px);
		pointer-events: none;
	}

	/* Layout (keep in sync with TimeAxis): a 24px strip at the top holds the handle knobs
	   (centered 12px from the top); the selection hangs from the knobs down to the axis line,
	   which sits on top of the label row (the bottom 22px). */

	.trs-selection {
		position: absolute;
		top: 12px;
		/* Stops above the label row, so edge lines never cross a label. */
		bottom: 22px;
		background: var(--_selection);
		cursor: grab;
	}

	/* Edge lines, centered on the edges. */
	.trs-selection::before,
	.trs-selection::after {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--_accent);
		content: '';
	}

	.trs-selection::before {
		left: -1px;
	}

	.trs-selection::after {
		right: -1px;
	}

	.trs-selection:focus-visible {
		outline: none;
	}

	.trs-track:not([data-pointer-focus]) .trs-selection:focus-visible {
		outline: 2px solid var(--_accent);
		outline-offset: -2px;
	}

	.trs-handle {
		position: absolute;
		top: 0;
		display: grid;
		place-items: center;
		width: 26px;
		height: 24px;
		translate: -50% 0;
		cursor: ew-resize;
	}

	.trs-knob {
		box-sizing: border-box;
		width: 14px;
		height: 14px;
		border: 2px solid var(--_accent);
		border-radius: 50%;
		background: var(--_surface);
		box-shadow:
			0 1px 2px rgb(15 23 42 / 0.18),
			0 2px 6px rgb(15 23 42 / 0.12);
		transition:
			scale 120ms ease,
			box-shadow 120ms ease;
	}

	.trs-handle:hover .trs-knob,
	.trs-handle-active .trs-knob {
		scale: 1.2;
		box-shadow:
			0 1px 2px rgb(15 23 42 / 0.18),
			0 0 0 4px color-mix(in srgb, var(--_accent) 18%, transparent);
	}

	.trs-handle:focus-visible {
		outline: none;
	}

	.trs-track:not([data-pointer-focus]) .trs-handle:focus-visible .trs-knob {
		box-shadow:
			0 1px 2px rgb(15 23 42 / 0.18),
			0 0 0 4px color-mix(in srgb, var(--_accent) 40%, transparent);
	}

	.trs[data-disabled] .trs-knob {
		scale: 1;
		box-shadow: none;
	}

	@media (pointer: coarse) {
		.trs-handle {
			top: -3px;
			width: 44px;
			height: 30px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.trs-knob {
			transition: none;
		}
	}

	.trs-visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		border: 0;
		white-space: nowrap;
	}
</style>
