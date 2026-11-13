import type { TimeRangeSliderLabels } from '../types.js';

/** Chinese (Traditional) UI strings. */
export const labelsZhHant: TimeRangeSliderLabels = {
	presets: {
		hour: '小時',
		day: '日',
		week: '週',
		month: '月',
		quarter: '季',
		year: '年'
	},
	presetGroup: '期間',
	zoomGroup: '縮放',
	zoomIn: '放大',
	zoomOut: '縮小',
	current: {
		hour: '本小時',
		day: '今天',
		week: '本週',
		month: '本月',
		quarter: '本季',
		year: '今年',
		range: '現在'
	},
	rolling: {
		hour: '過去1小時',
		day: '過去24小時',
		week: '過去7天',
		month: '過去30天',
		quarter: '過去90天',
		year: '過去12個月',
		range: '截至現在'
	},
	currentGroup: '目前',
	rollingGroup: '最近',
	quarterFormat: '{year}第{quarter}季',
	customPreset: '自訂',
	timeline: '時間軸',
	showTimeline: '顯示時間軸',
	hideTimeline: '隱藏時間軸',
	start: '開始',
	end: '結束',
	range: '所選期間'
};
