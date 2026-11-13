import type { TimeRangeSliderLabels } from '../types.js';

/** Swedish UI strings. */
export const labelsSv: TimeRangeSliderLabels = {
	presets: {
		hour: 'Timme',
		day: 'Dag',
		week: 'Vecka',
		month: 'Månad',
		quarter: 'Kvartal',
		year: 'År'
	},
	presetGroup: 'Period',
	zoomGroup: 'Zoom',
	zoomIn: 'Zooma in',
	zoomOut: 'Zooma ut',
	current: {
		hour: 'Denna timme',
		day: 'Idag',
		week: 'Denna vecka',
		month: 'Denna månad',
		quarter: 'Detta kvartal',
		year: 'Detta år',
		range: 'Nu'
	},
	rolling: {
		hour: 'Senaste timmen',
		day: 'Senaste 24 timmarna',
		week: 'Senaste 7 dagarna',
		month: 'Senaste 30 dagarna',
		quarter: 'Senaste 90 dagarna',
		year: 'Senaste 12 månaderna',
		range: 'Fram till nu'
	},
	currentGroup: 'Aktuell',
	rollingGroup: 'Senaste',
	quarterFormat: 'Q{quarter} {year}',
	customPreset: 'Anpassad',
	timeline: 'Tidslinje',
	showTimeline: 'Visa tidslinje',
	hideTimeline: 'Dölj tidslinje',
	start: 'Start',
	end: 'Slut',
	range: 'Vald period'
};
