import type { TimeRangeSliderLabels } from '../types.js';

/** Japanese UI strings. */
export const labelsJa: TimeRangeSliderLabels = {
	presets: {
		hour: '時間',
		day: '日',
		week: '週',
		month: '月',
		quarter: '四半期',
		year: '年'
	},
	presetGroup: '期間',
	zoomGroup: 'ズーム',
	zoomIn: 'ズームイン',
	zoomOut: 'ズームアウト',
	current: {
		hour: '現在の時間',
		day: '今日',
		week: '今週',
		month: '今月',
		quarter: '今四半期',
		year: '今年',
		range: '現在'
	},
	rolling: {
		hour: '過去1時間',
		day: '過去24時間',
		week: '過去7日間',
		month: '過去30日間',
		quarter: '過去90日間',
		year: '過去12か月',
		range: '現在まで'
	},
	currentGroup: '現在',
	rollingGroup: '過去',
	quarterFormat: '{year}第{quarter}四半期',
	customPreset: 'カスタム',
	timeline: 'タイムライン',
	showTimeline: 'タイムラインを表示',
	hideTimeline: 'タイムラインを非表示',
	start: '開始',
	end: '終了',
	range: '選択した期間'
};
