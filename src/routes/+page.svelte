<script lang="ts">
	import { TimeRangeSlider, type TimeRangeChange } from '#lib';

	/** One locale per built-in translation (plus en-GB), named in its own language. */
	const LOCALES = [
		'en-US',
		'en-GB',
		'de-DE',
		'fr-FR',
		'es-ES',
		'it-IT',
		'pt-BR',
		'nl-NL',
		'pl-PL',
		'cs-CZ',
		'sv-SE',
		'tr-TR',
		'ru-RU',
		'uk-UA',
		'ja-JP',
		'ko-KR',
		'zh-CN',
		'zh-TW'
	].map((code) => ({
		code,
		name: new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
	}));
	const TIME_ZONES = [
		'UTC',
		'Europe/Berlin',
		'America/New_York',
		'America/Sao_Paulo',
		'Asia/Kolkata',
		'Asia/Tokyo'
	];

	let from = $state(new Date(Date.UTC(2025, 3, 1)));
	let to = $state(new Date(Date.UTC(2025, 4, 1)));
	let timeZone = $state('UTC');
	let locale = $state('en-US');
	let bounded = $state(false);
	let disabled = $state(false);
	let dark = $state(false);
	let log: { id: number; text: string }[] = $state([]);
	let slider: ReturnType<typeof TimeRangeSlider> | undefined = $state();

	let chart: 'none' | 'bar' | 'line' = $state('bar');

	/**
	 * Sample data: hourly event counts for 2024–2026 with a daytime peak, quieter weekends, a
	 * summer high and slow growth. Seeded, so every visit shows the same data.
	 */
	function sampleEvents() {
		const HOUR = 3_600_000;
		const first = Date.UTC(2024, 0, 1);
		const last = Date.UTC(2027, 0, 1);
		let seed = 42;
		const random = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const points: { time: number; value: number }[] = [];
		for (let time = first; time < last; time += HOUR) {
			const date = new Date(time);
			const daytime = Math.max(0, Math.sin(((date.getUTCHours() - 6) / 24) * 2 * Math.PI));
			const weekday = date.getUTCDay() % 6 === 0 ? 0.45 : 1;
			const season = 0.75 + 0.25 * Math.cos(((date.getUTCMonth() - 6) / 12) * 2 * Math.PI);
			const growth = 1 + (0.5 * (time - first)) / (last - first);
			const value = Math.round(20 * daytime * weekday * season * growth * (0.7 + 0.6 * random()));
			if (value > 0) points.push({ time, value });
		}
		return points;
	}
	const events = sampleEvents();

	let nextId = 0;
	function onchange({ from, to, preset }: TimeRangeChange) {
		const text = `${from.toISOString()} → ${to.toISOString()}${preset ? ` (${preset})` : ''}`;
		log = [{ id: nextId++, text }, ...log].slice(0, 8);
	}
</script>

<svelte:head>
	<title>Time Range Slider</title>
</svelte:head>

<main class:dark>
	<header>
		<h1>Time Range Slider</h1>
		<p>A zoomable timeline for picking a time range, e.g. to filter a map.</p>
	</header>

	<section class="card" aria-label="Demo">
		<TimeRangeSlider
			bind:this={slider}
			bind:from
			bind:to
			{timeZone}
			{locale}
			{disabled}
			min={bounded ? new Date(Date.UTC(2024, 0, 1)) : undefined}
			max={bounded ? new Date(Date.UTC(2026, 0, 1)) : undefined}
			data={chart === 'none' ? undefined : events}
			chart={chart === 'line' ? 'line' : 'bar'}
			valueLabel="events"
			{onchange}
			data-testid="slider"
		/>
		<p class="help">
			Drag the knobs to resize the range, the selection below them to move it, the empty timeline to
			scroll; hold a drag at the edge to scroll along. Dropped edges snap to the nearest tick. Click
			the timeline to move the range there, double-click to pick the period under the pointer. The
			wheel zooms (trackpads: pinch). With the keyboard: arrow keys on a knob step to the next tick
			(Shift: next labelled tick); on the selection they jump to the previous / next period;
			<kbd>+</kbd> / <kbd>−</kbd> zoom.
		</p>
	</section>

	<section class="card" aria-label="Over a map">
		<h2>Over a map (collapsible)</h2>
		<div class="map">
			<div class="map-control">
				<TimeRangeSlider
					bind:from
					bind:to
					{timeZone}
					{locale}
					data={chart === 'none' ? undefined : events}
					chart={chart === 'line' ? 'line' : 'bar'}
					valueLabel="events"
					collapsible
					data-testid="overlay"
				/>
			</div>
		</div>
		<p class="help">
			Tap the range text to open the ruler and chart; Escape or a tap on the map closes it.
		</p>
	</section>

	<section class="card controls" aria-label="Options">
		<label>
			Time zone
			<select bind:value={timeZone}>
				{#each TIME_ZONES as zone (zone)}<option>{zone}</option>{/each}
			</select>
		</label>
		<label>
			Locale
			<select bind:value={locale}>
				{#each LOCALES as { code, name } (code)}<option value={code}>{name} ({code})</option>{/each}
			</select>
		</label>
		<label>
			Chart
			<select bind:value={chart}>
				<option value="none">None</option>
				<option value="bar">Bars</option>
				<option value="line">Line</option>
			</select>
		</label>
		<label><input type="checkbox" bind:checked={bounded} /> Limit to 2024–2025</label>
		<label><input type="checkbox" bind:checked={disabled} /> Disabled</label>
		<label><input type="checkbox" bind:checked={dark} /> Dark</label>
		<span class="buttons">
			<button type="button" onclick={() => slider?.shift(-1)}>← Previous</button>
			<button type="button" onclick={() => slider?.shift(1)}>Next →</button>
			<button type="button" onclick={() => slider?.reveal()}>Show selection</button>
		</span>
	</section>

	<section class="card" aria-label="Value">
		<dl>
			<dt>from</dt>
			<dd data-testid="from">{from.toISOString()}</dd>
			<dt>to</dt>
			<dd data-testid="to">{to.toISOString()}</dd>
		</dl>
		<h2>onchange</h2>
		<ol class="log" data-testid="log">
			{#each log as entry (entry.id)}<li>{entry.text}</li>{/each}
		</ol>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}

	main {
		--page: #f1f5f9;
		--card: #fff;
		--line: #e2e8f0;
		--muted: #64748b;
		min-height: 100vh;
		box-sizing: border-box;
		padding: 24px 16px;
		background: var(--page);
		color: #0f172a;
		color-scheme: light;
	}

	main.dark {
		--page: #020617;
		--card: #0f172a;
		--line: #1e293b;
		--muted: #94a3b8;
		color: #e2e8f0;
		color-scheme: dark;
	}

	header,
	.card {
		max-width: 940px;
		margin: 0 auto 16px;
	}

	h1 {
		margin: 0 0 4px;
		font-size: 1.5rem;
	}

	h2 {
		margin: 16px 0 8px;
		font-size: 0.95rem;
	}

	h2:first-child {
		margin-top: 0;
	}

	/* A stand-in for a map: water, parks and streets drawn with gradients. */
	.map {
		position: relative;
		height: 340px;
		overflow: hidden;
		border-radius: 10px;
		background:
			radial-gradient(circle at 78% 22%, #bfdbfe 0 14%, transparent 14.5%),
			radial-gradient(circle at 18% 70%, #bbf7d0 0 10%, transparent 10.5%),
			repeating-linear-gradient(0deg, transparent 0 46px, #ffffff 46px 50px),
			repeating-linear-gradient(90deg, transparent 0 62px, #ffffff 62px 66px), #e7e5e4;
	}

	.map-control {
		position: absolute;
		right: 10px;
		bottom: 10px;
		left: 10px;
	}

	header p,
	.help {
		margin: 0;
		color: var(--muted);
		line-height: 1.5;
	}

	.card {
		box-sizing: border-box;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--card);
	}

	.help {
		margin-top: 10px;
		font-size: 12px;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 18px;
		align-items: center;
		font-size: 13px;
	}

	.controls label {
		display: inline-flex;
		gap: 6px;
		align-items: center;
	}

	.buttons {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-left: auto;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0;
		font-size: 13px;
	}

	dt {
		color: var(--muted);
	}

	dd,
	.log {
		margin: 0;
		font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
		font-size: 12px;
	}

	.log {
		min-height: 1.5em;
		padding-left: 20px;
		line-height: 1.6;
	}

	@media (max-width: 560px) {
		main {
			padding: 12px 8px;
		}

		.card {
			padding: 10px;
		}
	}
</style>
