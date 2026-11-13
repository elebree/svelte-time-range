import type { TimeRangeSliderLabels } from '../types.js';

/** French UI strings. */
export const labelsFr: TimeRangeSliderLabels = {
	presets: {
		hour: 'Heure',
		day: 'Jour',
		week: 'Semaine',
		month: 'Mois',
		quarter: 'Trimestre',
		year: 'Année'
	},
	presetGroup: 'Période',
	zoomGroup: 'Zoom',
	zoomIn: 'Zoom avant',
	zoomOut: 'Zoom arrière',
	current: {
		hour: 'Cette heure',
		day: "Aujourd'hui",
		week: 'Cette semaine',
		month: 'Ce mois-ci',
		quarter: 'Ce trimestre',
		year: 'Cette année',
		range: 'Maintenant'
	},
	rolling: {
		hour: 'Dernière heure',
		day: 'Dernières 24 heures',
		week: '7 derniers jours',
		month: '30 derniers jours',
		quarter: '90 derniers jours',
		year: '12 derniers mois',
		range: 'Jusqu’à maintenant'
	},
	currentGroup: 'En cours',
	rollingGroup: 'Récent',
	quarterFormat: 'T{quarter} {year}',
	customPreset: 'Personnalisé',
	timeline: 'Chronologie',
	showTimeline: 'Afficher la chronologie',
	hideTimeline: 'Masquer la chronologie',
	start: 'Début',
	end: 'Fin',
	range: 'Période sélectionnée'
};
