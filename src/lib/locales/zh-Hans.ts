import type { TimeRangeSliderLabels } from '../types.js';

/** Chinese (Simplified) UI strings. */
export const labelsZhHans: TimeRangeSliderLabels = {
	presets: {
		hour: '小时',
		day: '日',
		week: '周',
		month: '月',
		quarter: '季度',
		year: '年'
	},
	presetGroup: '时间段',
	zoomGroup: '缩放',
	zoomIn: '放大',
	zoomOut: '缩小',
	current: {
		hour: '本小时',
		day: '今天',
		week: '本周',
		month: '本月',
		quarter: '本季度',
		year: '今年',
		range: '现在'
	},
	rolling: {
		hour: '过去1小时',
		day: '过去24小时',
		week: '过去7天',
		month: '过去30天',
		quarter: '过去90天',
		year: '过去12个月',
		range: '截至现在'
	},
	currentGroup: '当前',
	rollingGroup: '最近',
	quarterFormat: '{year}第{quarter}季度',
	customPreset: '自定义',
	timeline: '时间轴',
	showTimeline: '显示时间轴',
	hideTimeline: '隐藏时间轴',
	start: '开始',
	end: '结束',
	range: '所选时间段'
};
