import type { TimeRangeSliderLabels } from '../types.js';

/** Korean UI strings. */
export const labelsKo: TimeRangeSliderLabels = {
	presets: {
		hour: '시간',
		day: '일',
		week: '주',
		month: '월',
		quarter: '분기',
		year: '연'
	},
	presetGroup: '기간',
	zoomGroup: '확대/축소',
	zoomIn: '확대',
	zoomOut: '축소',
	current: {
		hour: '현재 시간',
		day: '오늘',
		week: '이번 주',
		month: '이번 달',
		quarter: '이번 분기',
		year: '올해',
		range: '지금'
	},
	rolling: {
		hour: '지난 1시간',
		day: '지난 24시간',
		week: '지난 7일',
		month: '지난 30일',
		quarter: '지난 90일',
		year: '지난 12개월',
		range: '현재까지'
	},
	currentGroup: '현재',
	rollingGroup: '최근',
	quarterFormat: '{year} {quarter}분기',
	customPreset: '맞춤',
	timeline: '타임라인',
	showTimeline: '타임라인 표시',
	hideTimeline: '타임라인 숨기기',
	start: '시작',
	end: '종료',
	range: '선택한 기간'
};
