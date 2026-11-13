<!--
	@component
	Internal: draws the chart on the ruler. Purely presentational; data comes in as buckets.
	Everything is drawn in the de-emphasis grey and drawn again in the accent, clipped to the
	selection, so the data inside the selected range stands out with exact edges.
-->
<script lang="ts">
	import { niceCeiling, type Bin } from './core/chart.js';
	import { xAt, type ViewWindow } from './core/viewport.js';

	interface Props {
		bins: readonly Bin[];
		kind: 'bar' | 'line';
		view: ViewWindow;
		width: number;
		height: number;
		/** Top of the plot area, in px. */
		top: number;
		/** The value axis' zero line (the ruler's axis line), in px. */
		baseline: number;
		/** The selection, in px. */
		selectionStart: number;
		selectionEnd: number;
		/** Index into `bins` of the bucket under the pointer. */
		hovered: number | null;
		/** Formats the label of the scale's top line. */
		formatScale: (value: number) => string;
		/** Unique id for the clip path. */
		id: string;
	}

	let {
		bins,
		kind,
		view,
		width,
		height,
		top,
		baseline,
		selectionStart,
		selectionEnd,
		hovered,
		formatScale,
		id
	}: Props = $props();

	/** Bars are capped at this thickness; wider buckets leave air around them. */
	const MAX_BAR = 24;
	/** Gap between neighbouring bars, in px. */
	const BAR_GAP = 2;
	/** Rounding of the bar ends away from the baseline, in px. */
	const BAR_RADIUS = 4;

	const toX = (time: number) => xAt(view, width, time);
	const crisp = (y: number) => Math.round(y) + 0.5;

	/** Bins in view with their geometry. */
	const visible = $derived(
		bins
			.map((bin, index) => ({ ...bin, index, x0: toX(bin.start), x1: toX(bin.end) }))
			.filter((bin) => bin.x1 > 0 && bin.x0 < width)
	);

	/** The value scale: zero to a clean number above the largest value in view. */
	const scale = $derived.by(() => {
		let low = 0;
		let high = 0;
		for (const { value } of visible) {
			if (value === null) continue;
			if (value > high) high = value;
			if (kind === 'line' && value < low) low = value;
		}
		const max = niceCeiling(high);
		const min = low < 0 ? -niceCeiling(-low) : 0;
		return { min, max };
	});

	const plotHeight = $derived(baseline - top);
	/** Line charts may go below zero; the zero line moves up accordingly. */
	const zeroY = $derived(baseline - ((0 - scale.min) / (scale.max - scale.min)) * plotHeight);
	const yAt = (value: number) =>
		baseline - ((value - scale.min) / (scale.max - scale.min)) * plotHeight;

	function barPath(bin: { x0: number; x1: number; value: number | null }): string {
		if (bin.value === null || bin.value <= 0) return '';
		const slot = bin.x1 - bin.x0;
		const barWidth = Math.min(MAX_BAR, slot - BAR_GAP);
		if (barWidth < 1) return '';
		const left = bin.x0 + (slot - barWidth) / 2;
		const right = left + barWidth;
		const barTop = Math.min(yAt(bin.value), zeroY - 1);
		const r = Math.min(BAR_RADIUS, barWidth / 2, zeroY - barTop);
		// Square at the baseline, rounded at the data end.
		return (
			`M${left} ${zeroY}V${barTop + r}A${r} ${r} 0 0 1 ${left + r} ${barTop}` +
			`H${right - r}A${r} ${r} 0 0 1 ${right} ${barTop + r}V${zeroY}Z`
		);
	}

	const bars = $derived(kind === 'bar' ? visible.map(barPath).join('') : '');

	/** Line segments through the bucket centres; buckets without data break the line. */
	const segments = $derived.by(() => {
		if (kind !== 'line') return [];
		const result: { x: number; y: number }[][] = [];
		let current: { x: number; y: number }[] = [];
		for (const bin of bins) {
			if (bin.value === null) {
				if (current.length) result.push(current);
				current = [];
				continue;
			}
			current.push({ x: (toX(bin.start) + toX(bin.end)) / 2, y: yAt(bin.value) });
		}
		if (current.length) result.push(current);
		return result;
	});

	const line = $derived(
		segments
			.map((points) => points.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x} ${y}`).join(''))
			.join('')
	);
	const area = $derived(
		segments
			.filter((points) => points.length > 1)
			.map(
				(points) =>
					`M${points[0]!.x} ${zeroY}` +
					points.map(({ x, y }) => `L${x} ${y}`).join('') +
					`L${points[points.length - 1]!.x} ${zeroY}Z`
			)
			.join('')
	);

	const hoveredBin = $derived(visible.find((bin) => bin.index === hovered) ?? null);
	const hoveredInside = $derived(
		hoveredBin !== null &&
			(hoveredBin.x0 + hoveredBin.x1) / 2 >= selectionStart &&
			(hoveredBin.x0 + hoveredBin.x1) / 2 <= selectionEnd
	);
</script>

<svg class="trs-chart" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
	<defs>
		<clipPath id="{id}-selection">
			<rect x={selectionStart} y="0" width={Math.max(0, selectionEnd - selectionStart)} {height} />
		</clipPath>
	</defs>

	<!-- One hairline marks the top of the value scale. -->
	<line class="trs-chart-scale" x1="0" x2={width} y1={crisp(top)} y2={crisp(top)} />
	<text class="trs-chart-scale-label" x="4" y={top + 2}>{formatScale(scale.max)}</text>

	{#if kind === 'bar'}
		<path class="trs-chart-bars" d={bars} />
		<path class="trs-chart-bars trs-chart-selected" d={bars} clip-path="url(#{id}-selection)" />
		{#if hoveredBin}
			<path class="trs-chart-hover" d={barPath(hoveredBin)} />
		{/if}
	{:else}
		<path class="trs-chart-area" d={area} />
		<path class="trs-chart-area trs-chart-selected" d={area} clip-path="url(#{id}-selection)" />
		<path class="trs-chart-line" d={line} />
		<path class="trs-chart-line trs-chart-selected" d={line} clip-path="url(#{id}-selection)" />
		{#if hoveredBin && hoveredBin.value !== null}
			{@const x = (hoveredBin.x0 + hoveredBin.x1) / 2}
			<line class="trs-chart-crosshair" x1={x} x2={x} y1={top} y2={baseline} />
			<circle
				class="trs-chart-dot"
				class:trs-chart-selected={hoveredInside}
				cx={x}
				cy={yAt(hoveredBin.value)}
				r="4"
			/>
		{/if}
	{/if}
</svg>

<style>
	.trs-chart {
		position: absolute;
		inset: 0;
		display: block;
		overflow: visible;
		pointer-events: none;
	}

	.trs-chart-scale {
		stroke: var(--_axis-line);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}

	.trs-chart-scale-label {
		fill: var(--_muted);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		dominant-baseline: hanging;
		/* A halo in the track colour keeps the label legible over bars. */
		paint-order: stroke;
		stroke: var(--_track);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	.trs-chart-bars {
		fill: var(--_chart-muted);
	}

	.trs-chart-bars.trs-chart-selected {
		fill: var(--_chart);
	}

	.trs-chart-hover {
		fill: #fff;
		opacity: 0.35;
	}

	.trs-chart-area {
		fill: var(--_chart-muted);
		opacity: 0.12;
	}

	.trs-chart-area.trs-chart-selected {
		fill: var(--_chart);
	}

	.trs-chart-line {
		fill: none;
		stroke: var(--_chart-muted);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.trs-chart-line.trs-chart-selected {
		stroke: var(--_chart);
	}

	.trs-chart-crosshair {
		stroke: var(--_muted);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}

	.trs-chart-dot {
		fill: var(--_chart-muted);
		/* A ring in the track colour keeps the dot legible on the line. */
		stroke: var(--_track);
		stroke-width: 2;
	}

	.trs-chart-dot.trs-chart-selected {
		fill: var(--_chart);
	}
</style>
