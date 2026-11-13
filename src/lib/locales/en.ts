import type { TimeRangeSliderLabels } from '../types.js';

/** English UI strings. */
export const labelsEn: TimeRangeSliderLabels = {
	presets: {
		hour: 'Hour',
		day: 'Day',
		week: 'Week',
		month: 'Month',
		quarter: 'Quarter',
		year: 'Year'
	},
	presetGroup: 'Period',
	zoomGroup: 'Zoom',
	zoomIn: 'Zoom in',
	zoomOut: 'Zoom out',
	current: {
		hour: 'This hour',
		day: 'Today',
		week: 'This week',
		month: 'This month',
		quarter: 'This quarter',
		year: 'This year',
		range: 'Now'
	},
	rolling: {
		hour: 'Last hour',
		day: 'Last 24 hours',
		week: 'Last 7 days',
		month: 'Last 30 days',
		quarter: 'Last 90 days',
		year: 'Last 12 months',
		range: 'Up to now'
	},
	currentGroup: 'Current',
	rollingGroup: 'Recent',
	quarterFormat: 'Q{quarter} {year}',
	customPreset: 'Custom',
	timeline: 'Timeline',
	showTimeline: 'Show timeline',
	hideTimeline: 'Hide timeline',
	start: 'Start',
	end: 'End',
	range: 'Selected range'
};
