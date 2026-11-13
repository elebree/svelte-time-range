<!--
	@component
	Internal: draws the ticks and labels of the timeline. Purely presentational.
-->
<script lang="ts">
	import { estimateTextWidth, type Axis } from './core/ticks.js';
	import { clamp, xAt, type ViewWindow } from './core/viewport.js';

	interface Props {
		axis: Axis;
		view: ViewWindow;
		width: number;
		height: number;
		fontSize: number;
		/** Labels of periods (or ticks) within this range are highlighted. */
		highlightStart: number;
		highlightEnd: number;
		/** Ticks to highlight: where a dragged edge will stick when it is dropped. */
		marks: readonly number[];
	}

	let { axis, view, width, height, fontSize, highlightStart, highlightEnd, marks }: Props =
		$props();

	/** Minimum free space between two labels on ticks, in px. */
	const MIN_LABEL_GAP = 6;
	/** Labels on ticks closer to the edge than this are hidden instead of clipped, in px. */
	const EDGE_PADDING = 2;
	/** Space between a between-tick label and the ticks around it, in px. */
	const PERIOD_PADDING = 3;

	// Geometry (keep in sync with TimeRangeSlider): the bottom 22px hold the labels. The axis
	// line runs along the bottom of the selection band, with the ticks rising from it.
	const LABEL_ROW = 22;
	const baseline = $derived(height - LABEL_ROW);
	const labelY = $derived(height - LABEL_ROW / 2);

	/** Centers 1px lines on a pixel so they render crisp. */
	const crisp = (x: number) => Math.round(x) + 0.5;
	const toX = (time: number) => xAt(view, width, time);

	const points = $derived(axis.ticks.map((tick) => ({ ...tick, x: toX(tick.time) })));

	const majorPath = $derived(
		points.map(({ x }) => `M${crisp(x)} ${baseline - 12}V${baseline + 1}`).join('')
	);

	const minorPath = $derived(
		axis.minorTicks
			.map(toX)
			.filter((x) => x > -1 && x < width + 1)
			.map((x) => `M${crisp(x)} ${baseline - 5}V${baseline + 1}`)
			.join('')
	);

	/** Ticks where a dragged edge will stick: drawn full height in the accent. */
	const markPath = $derived(
		marks
			.map(toX)
			.filter((x) => x > -1 && x < width + 1)
			.map((x) => `M${crisp(x)} ${baseline - 12}V${baseline + 1}`)
			.join('')
	);

	interface Label {
		key: number;
		x: number;
		text: string;
		emphasis: boolean;
		/** The labelled instant or period lies within the highlighted range. */
		selected: boolean;
	}

	/** Labels on their ticks: only those fully in view, skipping any that overlap a neighbour. */
	function labelsOnTicks(): Label[] {
		const labels: Label[] = [];
		let lastRight = -Infinity;
		for (const point of points) {
			const half = estimateTextWidth(point.label, fontSize) / 2;
			if (point.x - half < EDGE_PADDING || point.x + half > width - EDGE_PADDING) continue;
			if (point.x - half < lastRight + MIN_LABEL_GAP) continue;
			labels.push({
				key: point.time,
				x: point.x,
				text: point.label,
				emphasis: point.emphasis,
				selected: highlightStart <= point.time && point.time <= highlightEnd
			});
			lastRight = point.x + half;
		}
		return labels;
	}

	/** Bold labels are a little wider. */
	const labelWidth = (text: string, emphasis: boolean) =>
		estimateTextWidth(text, fontSize) * (emphasis ? 1.08 : 1);

	/** Bracket ends sit this far inside their ticks, so neighbouring brackets stay apart, in px. */
	const BRACKET_INSET = 3;
	/** Space between a bracket line and its label, in px. */
	const BRACKET_GAP = 5;
	/** The label width estimate is generous for layout; brackets use a closer one. */
	const BRACKET_TEXT_SCALE = 0.88;
	/** Height of the bracket ends, which rise from the line like the corners of an L, in px. */
	const BRACKET_END = 5;
	/** Brackets whose lines would be shorter than this are left out, in px. */
	const MIN_BRACKET_LINE = 6;

	/**
	 * Labels centered on their period (between a tick and the next one), clamped to the visible
	 * part of the period and hidden once that part is too small. If the compact labels ("2025",
	 * "Feb") do not fit every period, all periods use narrow ones ("J", "F") for a uniform look.
	 *
	 * Each period with enough room also gets a quiet bracket showing its extent, interrupted by
	 * the label: `└── Nov 1 ──┘`. Where the period runs past the edge of the view, its bracket
	 * has no end.
	 */
	function labelsBetweenTicks(): { labels: Label[]; brackets: string; selectedBrackets: string } {
		const periods = points.slice(0, -1).map((point, i) => ({
			point,
			start: point.x,
			end: points[i + 1]!.x,
			room: points[i + 1]!.x - point.x - 2 * PERIOD_PADDING,
			// The whole period lies within the highlighted range.
			selected: highlightStart <= point.time && points[i + 1]!.time <= highlightEnd
		}));
		const narrow = periods.some(
			({ point, room }) => labelWidth(point.compactLabel ?? point.label, point.emphasis) > room
		);
		const labels: Label[] = [];
		let brackets = '';
		/** Brackets of periods within the highlighted range, drawn in the accent. */
		let selectedBrackets = '';
		// Through the middle of the text (digits and capitals sit slightly above `labelY`).
		const lineY = Math.round(labelY - 1) + 0.5;
		for (const { point, start, end, room, selected } of periods) {
			if (end <= 0 || start >= width) continue;
			const candidates = narrow
				? [point.narrowLabel ?? point.compactLabel ?? point.label]
				: [point.label, point.compactLabel ?? point.label];
			let text = candidates.find((candidate) => labelWidth(candidate, point.emphasis) <= room);
			const textWidth = text === undefined ? 0 : labelWidth(text, point.emphasis);
			const visibleStart = Math.max(start, 0) + PERIOD_PADDING;
			const visibleEnd = Math.min(end, width) - PERIOD_PADDING;
			if (visibleEnd - visibleStart < textWidth) text = undefined;
			const x = clamp((start + end) / 2, visibleStart + textWidth / 2, visibleEnd - textWidth / 2);
			if (text !== undefined) {
				labels.push({ key: point.time, x, text, emphasis: point.emphasis, selected });
			}

			const left = crisp(start + BRACKET_INSET);
			const right = crisp(end - BRACKET_INSET);
			// Highlighted labels are bold, hence a little wider.
			const shownWidth = selected ? labelWidth(text ?? '', true) : textWidth;
			const halfText = (shownWidth * BRACKET_TEXT_SCALE) / 2 + BRACKET_GAP;
			// Judged on the whole period, so a bracket does not flicker while it scrolls out.
			if ((right - left) / 2 - halfText < MIN_BRACKET_LINE) continue;
			let path = '';
			const ends = `${lineY - BRACKET_END}V${lineY + 0.5}`;
			if (left >= 0) path += `M${left} ${ends}`;
			if (right <= width) path += `M${right} ${ends}`;
			const segments: [number, number][] =
				text === undefined
					? [[left, right]]
					: [
							[left, x - halfText],
							[x + halfText, right]
						];
			for (const [from, to] of segments) {
				const a = Math.max(from, -1);
				const b = Math.min(to, width + 1);
				if (b - a >= 1) path += `M${a} ${lineY}H${b}`;
			}
			if (selected) selectedBrackets += path;
			else brackets += path;
		}
		return { labels, brackets, selectedBrackets };
	}

	const row = $derived(
		axis.interval.between
			? labelsBetweenTicks()
			: { labels: labelsOnTicks(), brackets: '', selectedBrackets: '' }
	);
</script>

<svg class="trs-axis" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
	<line class="trs-axis-line" x1="0" x2={width} y1={baseline + 0.5} y2={baseline + 0.5} />
	<path class="trs-axis-minor" d={minorPath} />
	<path class="trs-axis-major" d={majorPath} />
	<path class="trs-axis-mark" d={markPath} />
	<path class="trs-axis-bracket" d={row.brackets} />
	<path class="trs-axis-bracket trs-axis-bracket-selected" d={row.selectedBrackets} />
	{#each row.labels as label (label.key)}
		<text
			class="trs-axis-label"
			class:trs-axis-label-emphasis={label.emphasis}
			class:trs-axis-label-selected={label.selected}
			x={label.x}
			y={labelY}
			font-size={fontSize}>{label.text}</text
		>
	{/each}
</svg>

<style>
	.trs-axis {
		position: absolute;
		inset: 0;
		display: block;
		overflow: visible;
		pointer-events: none;
	}

	.trs-axis-line,
	.trs-axis-major,
	.trs-axis-minor,
	.trs-axis-bracket {
		fill: none;
		stroke-width: 1;
		shape-rendering: crispEdges;
	}

	.trs-axis-line {
		stroke: var(--_axis-line);
	}

	/* Quiet: brackets support the labels and should not draw the eye. */
	.trs-axis-bracket {
		stroke: color-mix(in srgb, var(--_tick) 45%, transparent);
	}

	.trs-axis-major {
		stroke: var(--_tick);
	}

	.trs-axis-minor {
		stroke: var(--_tick-minor);
	}

	.trs-axis-label {
		fill: var(--_muted);
		text-anchor: middle;
		dominant-baseline: middle;
		font-variant-numeric: tabular-nums;
	}

	.trs-axis-label-emphasis {
		fill: var(--_text);
		font-weight: 600;
	}

	/* Labels within the selection — or, while dragging, where it will land. */
	.trs-axis-label-selected {
		fill: var(--_accent);
		font-weight: 600;
	}

	/* Brackets stay quiet, except around the highlighted periods. */
	.trs-axis-bracket-selected {
		stroke: color-mix(in srgb, var(--_accent) 60%, transparent);
	}

	/* The tick a dragged edge will stick to when it is dropped. */
	.trs-axis-mark {
		fill: none;
		stroke: var(--_accent);
		stroke-width: 2;
	}
</style>
