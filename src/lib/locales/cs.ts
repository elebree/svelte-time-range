import type { TimeRangeSliderLabels } from '../types.js';

/** Czech UI strings. */
export const labelsCs: TimeRangeSliderLabels = {
	presets: {
		hour: 'Hodina',
		day: 'Den',
		week: 'Týden',
		month: 'Měsíc',
		quarter: 'Čtvrtletí',
		year: 'Rok'
	},
	presetGroup: 'Období',
	zoomGroup: 'Přiblížení',
	zoomIn: 'Přiblížit',
	zoomOut: 'Oddálit',
	current: {
		hour: 'Tato hodina',
		day: 'Dnes',
		week: 'Tento týden',
		month: 'Tento měsíc',
		quarter: 'Toto čtvrtletí',
		year: 'Tento rok',
		range: 'Nyní'
	},
	rolling: {
		hour: 'Poslední hodina',
		day: 'Posledních 24 hodin',
		week: 'Posledních 7 dní',
		month: 'Posledních 30 dní',
		quarter: 'Posledních 90 dní',
		year: 'Posledních 12 měsíců',
		range: 'Do současnosti'
	},
	currentGroup: 'Aktuální',
	rollingGroup: 'Poslední',
	quarterFormat: '{quarter}. čtvrtletí {year}',
	customPreset: 'Vlastní',
	timeline: 'Časová osa',
	showTimeline: 'Zobrazit časovou osu',
	hideTimeline: 'Skrýt časovou osu',
	start: 'Začátek',
	end: 'Konec',
	range: 'Vybrané období'
};
