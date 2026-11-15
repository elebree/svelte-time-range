<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- the only links are external */
	import { TimeRangeSlider, type TimeRangeChange } from '#lib';
	import { name, version, repository } from '../../package.json';

	const repoUrl = repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
	const npmUrl = `https://www.npmjs.com/package/${name}`;
	const install = `npm install ${name}`;

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
	const THEMES = ['auto', 'light', 'dark'] as const;

	let from = $state(new Date(Date.UTC(2025, 3, 1)));
	let to = $state(new Date(Date.UTC(2025, 4, 1)));
	let timeZone = $state('UTC');
	let locale = $state('en-US');
	let chart: 'none' | 'bar' | 'line' = $state('bar');
	let bounded = $state(false);
	let disabled = $state(false);
	let theme: (typeof THEMES)[number] = $state('auto');
	let log: { id: number; text: string }[] = $state([]);
	let slider: ReturnType<typeof TimeRangeSlider> | undefined = $state();

	$effect(() => {
		document.documentElement.style.colorScheme = theme === 'auto' ? 'light dark' : theme;
	});

	/** Seeded, so every visit shows the same data. */
	function random(seed: number) {
		return () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	const FIRST = Date.UTC(2024, 0, 1);
	const LAST = Date.UTC(2027, 0, 1);
	const HOUR = 3_600_000;

	/** Activity at an instant, 0…1.5: a daytime peak, quieter weekends, a summer high, growth. */
	function activity(time: number) {
		const date = new Date(time);
		const daytime = Math.max(0, Math.sin(((date.getUTCHours() - 6) / 24) * 2 * Math.PI));
		const weekday = date.getUTCDay() % 6 === 0 ? 0.45 : 1;
		const season = 0.75 + 0.25 * Math.cos(((date.getUTCMonth() - 6) / 12) * 2 * Math.PI);
		return daytime * weekday * season * (1 + (0.5 * (time - FIRST)) / (LAST - FIRST));
	}

	/** Hourly event counts for 2024–2026. */
	function sampleEvents() {
		const rand = random(42);
		const points: { time: number; value: number }[] = [];
		for (let time = FIRST; time < LAST; time += HOUR) {
			const value = Math.round(20 * activity(time) * (0.7 + 0.6 * rand()));
			if (value > 0) points.push({ time, value });
		}
		return points;
	}

	/** Single incidents with a place on the map, clustered around a few hot spots. */
	function sampleIncidents() {
		const rand = random(7);
		const spots = [
			[300, 210, 90],
			[620, 130, 70],
			[780, 300, 60],
			[160, 90, 50],
			[480, 320, 80]
		];
		const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
		const incidents: { id: number; time: number; x: number; y: number }[] = [];
		while (incidents.length < 4000) {
			const time = FIRST + Math.floor(rand() * ((LAST - FIRST) / 60_000)) * 60_000;
			if (rand() * 1.5 > activity(time)) continue;
			const [x, y, spread] = spots[Math.floor(rand() * spots.length)];
			incidents.push({
				id: incidents.length,
				time,
				x: x + gauss() * spread,
				y: y + gauss() * spread * 0.6
			});
		}
		return incidents;
	}

	const events = sampleEvents();
	const incidents = sampleIncidents();
	const incidentTimes = incidents.map(({ time }) => ({ time }));
	const visible = $derived(
		incidents.filter(({ time }) => time >= from.getTime() && time < to.getTime())
	);

	let nextId = 0;
	function onchange({ from, to, preset }: TimeRangeChange) {
		const text = `${from.toISOString()} → ${to.toISOString()}${preset ? ` (${preset})` : ''}`;
		log = [{ id: nextId++, text }, ...log].slice(0, 6);
	}

	/** The markup for the current options, to copy into an app. */
	const code = $derived.by(() => {
		const props = ['bind:from', 'bind:to', `timeZone="${timeZone}"`, `locale="${locale}"`];
		if (chart !== 'none') props.push('data={events}', 'valueLabel="events"');
		if (chart === 'line') props.push('chart="line"');
		if (bounded) props.push(`min={new Date('2024-01-01')}`, `max={new Date('2026-01-01')}`);
		if (disabled) props.push('disabled');
		props.push('{onchange}');
		return `<TimeRangeSlider\n${props.map((prop) => `  ${prop}`).join('\n')}\n/>`;
	});

	let copied: string | null = $state(null);
	async function copy(text: string) {
		await navigator.clipboard.writeText(text);
		copied = text;
		setTimeout(() => (copied = copied === text ? null : copied), 1500);
	}

	const HINTS = [
		['Drag a knob', 'resize'],
		['Drag the selection', 'move'],
		['Drag the timeline', 'scroll'],
		['Click', 'move the range there'],
		['Double-click', 'pick that period'],
		['Wheel / pinch', 'zoom'],
		['← → on the selection', 'previous / next period']
	];
</script>

<svelte:head>
	<title>Svelte Time Range</title>
	<meta
		name="description"
		content="A zoomable, time-zone aware time range slider for Svelte 5, with presets, snapping and an optional chart."
	/>
</svelte:head>

<main>
	<header>
		<div class="title">
			<h1>Svelte Time Range</h1>
			<span class="version">v{version}</span>
		</div>
		<p class="tagline">
			A zoomable, time-zone aware timeline for picking a time range — e.g. to filter a map.
		</p>
		<div class="links">
			<button type="button" class="install" onclick={() => copy(install)} title="Copy">
				<code>{install}</code>
				<span class="copy">{copied === install ? 'Copied' : 'Copy'}</span>
			</button>
			<a class="button" href={repoUrl}>GitHub</a>
			<a class="button" href={npmUrl}>npm</a>
		</div>
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
		<ul class="hints" aria-label="How to use">
			{#each HINTS as [action, effect] (action)}
				<li><b>{action}</b> {effect}</li>
			{/each}
		</ul>

		<div class="controls" aria-label="Options" role="group">
			<label>
				Time zone
				<select bind:value={timeZone}>
					{#each TIME_ZONES as zone (zone)}<option>{zone}</option>{/each}
				</select>
			</label>
			<label>
				Locale
				<select bind:value={locale}>
					{#each LOCALES as { code, name } (code)}<option value={code}>{name} ({code})</option
						>{/each}
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
			<div class="segmented" role="radiogroup" aria-label="Theme">
				{#each THEMES as option (option)}
					<label class:active={theme === option}>
						<input type="radio" name="theme" value={option} bind:group={theme} />
						{option[0].toUpperCase() + option.slice(1)}
					</label>
				{/each}
			</div>
			<span class="buttons">
				<button type="button" onclick={() => slider?.shift(-1)}>← Previous</button>
				<button type="button" onclick={() => slider?.shift(1)}>Next →</button>
				<button type="button" onclick={() => slider?.reveal()}>Show selection</button>
			</span>
		</div>

		<div class="output">
			<div>
				<h2>Value</h2>
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
				{#if !log.length}<p class="empty">Drag or click the slider</p>{/if}
			</div>
			<div>
				<h2>
					Code
					<button type="button" class="small" onclick={() => copy(code)}>
						{copied === code ? 'Copied' : 'Copy'}
					</button>
				</h2>
				<pre><code>{code}</code></pre>
			</div>
		</div>
	</section>

	<section class="card" aria-labelledby="map-title">
		<h2 id="map-title">Over a map</h2>
		<p class="help">
			With <code>collapsible</code> the slider is a compact bar; tap the range text to open the ruler.
			The dots are the incidents inside the selected range.
		</p>
		<div class="map">
			<svg viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
				<path class="water" d="M690 0h310v170c-60 30-120 10-170-30s-110-60-140-140z" />
				<path class="river" d="M0 300c120-30 220 20 330-10s170-120 300-110 220 60 370 20" />
				<rect class="park" x="90" y="230" width="150" height="110" rx="18" />
				<g class="streets">
					{#each [60, 140, 220, 380, 460] as y (y)}<path d="M0 {y}H1000" />{/each}
					{#each [120, 260, 400, 540, 680, 820, 940] as x (x)}<path d="M{x} 0V420" />{/each}
					<path class="major" d="M0 410L1000 20" />
				</g>
				<g class="dots">
					{#each visible as { id, x, y } (id)}<circle cx={x} cy={y} r="5" />{/each}
				</g>
			</svg>
			<div class="count" aria-live="polite">{visible.length.toLocaleString(locale)} incidents</div>
			<div class="map-control">
				<TimeRangeSlider
					bind:from
					bind:to
					{timeZone}
					{locale}
					data={chart === 'none' ? undefined : incidentTimes}
					chart={chart === 'line' ? 'line' : 'bar'}
					valueLabel="incidents"
					collapsible
					data-testid="overlay"
				/>
			</div>
		</div>
	</section>

	<footer>
		MIT licensed · <a href={repoUrl}>GitHub</a> · <a href={npmUrl}>npm</a> ·
		<a href="{repoUrl}/issues">Issues</a>
	</footer>
</main>

<style>
	:global(html) {
		color-scheme: light dark;
	}

	:global(body) {
		margin: 0;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}

	main {
		--page: light-dark(#f1f5f9, #020617);
		--card: light-dark(#fff, #0f172a);
		--line: light-dark(#e2e8f0, #1e293b);
		--text: light-dark(#0f172a, #e2e8f0);
		--muted: light-dark(#64748b, #94a3b8);
		--accent: light-dark(#2563eb, #60a5fa);
		--control: light-dark(#fff, #1e293b);
		--code: light-dark(#f8fafc, #020617);
		min-height: 100vh;
		box-sizing: border-box;
		padding: 32px 16px;
		background: var(--page);
		color: var(--text);
	}

	header,
	.card,
	footer {
		max-width: 940px;
		margin: 0 auto 16px;
	}

	header {
		margin-bottom: 24px;
	}

	.title {
		display: flex;
		gap: 10px;
		align-items: baseline;
	}

	h1 {
		margin: 0;
		font-size: 1.75rem;
		letter-spacing: -0.01em;
	}

	.version {
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--line);
		color: var(--muted);
		font-size: 12px;
		font-weight: 600;
	}

	.tagline {
		margin: 6px 0 16px;
		color: var(--muted);
		font-size: 1.05rem;
		line-height: 1.5;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	button,
	.button,
	select {
		box-sizing: border-box;
		min-height: 32px;
		padding: 4px 12px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--control);
		color: inherit;
		font: inherit;
		font-size: 13px;
		text-decoration: none;
		cursor: pointer;
	}

	.button {
		display: inline-flex;
		align-items: center;
		font-weight: 500;
	}

	button:hover,
	.button:hover {
		border-color: var(--accent);
	}

	button:focus-visible,
	.button:focus-visible,
	select:focus-visible,
	.segmented label:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	select {
		padding-right: 6px;
	}

	.install {
		display: inline-flex;
		gap: 12px;
		align-items: center;
		background: var(--code);
	}

	.copy {
		color: var(--muted);
		font-size: 12px;
	}

	code,
	pre,
	dd,
	.log {
		font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
		font-size: 12px;
	}

	h2 {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0 0 8px;
		font-size: 0.9rem;
	}

	.card {
		box-sizing: border-box;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--card);
	}

	.hints {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
		color: var(--muted);
		font-size: 12px;
	}

	.hints li {
		padding: 3px 8px;
		border-radius: 6px;
		background: var(--page);
	}

	.hints b {
		color: var(--text);
		font-weight: 500;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 16px;
		align-items: center;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
		font-size: 13px;
	}

	.controls > label {
		display: inline-flex;
		gap: 6px;
		align-items: center;
	}

	input[type='checkbox'] {
		accent-color: var(--accent);
	}

	.segmented {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--line);
		border-radius: 8px;
	}

	.segmented label {
		padding: 3px 10px;
		border-radius: 6px;
		cursor: pointer;
	}

	.segmented label.active {
		background: var(--accent);
		color: light-dark(#fff, #0f172a);
	}

	.segmented input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.buttons {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-left: auto;
	}

	.output {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}

	.output > div {
		min-width: 0;
	}

	.small {
		min-height: 0;
		padding: 1px 8px;
		font-size: 11px;
		font-weight: 400;
	}

	pre {
		margin: 0;
		padding: 12px;
		overflow-x: auto;
		border-radius: 8px;
		background: var(--code);
		line-height: 1.5;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0 0 16px;
		font-size: 13px;
	}

	dt {
		color: var(--muted);
	}

	dd,
	.log {
		margin: 0;
	}

	.log {
		min-height: 1.6em;
		padding-left: 20px;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}

	.log:empty {
		display: none;
	}

	.empty {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
	}

	.help {
		margin: 0 0 12px;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.5;
	}

	.map {
		position: relative;
		height: 380px;
		overflow: hidden;
		border-radius: 10px;
		background: light-dark(#ece9e4, #1e2533);
	}

	.map svg {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.water {
		fill: light-dark(#bfdbfe, #1e3a5f);
	}

	.river {
		fill: none;
		stroke: light-dark(#bfdbfe, #1e3a5f);
		stroke-width: 16;
	}

	.park {
		fill: light-dark(#bbf7d0, #14432a);
	}

	.streets {
		fill: none;
		stroke: light-dark(#fff, #2b3546);
		stroke-width: 5;
	}

	.streets .major {
		stroke: light-dark(#fde68a, #4b4430);
		stroke-width: 9;
	}

	.dots circle {
		fill: light-dark(rgb(220 38 38 / 0.7), rgb(248 113 113 / 0.75));
		stroke: light-dark(#fff, #1e2533);
		stroke-width: 1.5;
	}

	.count {
		position: absolute;
		top: 10px;
		left: 10px;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--card);
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
		font-size: 12px;
		font-weight: 600;
	}

	.map-control {
		position: absolute;
		right: 10px;
		bottom: 10px;
		left: 10px;
	}

	footer {
		padding: 8px 0 0;
		color: var(--muted);
		font-size: 13px;
		text-align: center;
	}

	a {
		color: var(--accent);
	}

	.button {
		color: inherit;
	}

	@media (max-width: 680px) {
		main {
			padding: 20px 10px;
		}

		.card {
			padding: 12px;
		}

		.output {
			grid-template-columns: 1fr;
		}

		.buttons {
			margin-left: 0;
		}
	}
</style>
