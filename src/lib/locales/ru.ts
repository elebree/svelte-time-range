import type { TimeRangeSliderLabels } from '../types.js';

/** Russian UI strings. */
export const labelsRu: TimeRangeSliderLabels = {
	presets: {
		hour: 'Час',
		day: 'День',
		week: 'Неделя',
		month: 'Месяц',
		quarter: 'Квартал',
		year: 'Год'
	},
	presetGroup: 'Период',
	zoomGroup: 'Масштаб',
	zoomIn: 'Приблизить',
	zoomOut: 'Отдалить',
	current: {
		hour: 'Этот час',
		day: 'Сегодня',
		week: 'Эта неделя',
		month: 'Этот месяц',
		quarter: 'Этот квартал',
		year: 'Этот год',
		range: 'Сейчас'
	},
	rolling: {
		hour: 'Последний час',
		day: 'Последние 24 часа',
		week: 'Последние 7 дней',
		month: 'Последние 30 дней',
		quarter: 'Последние 90 дней',
		year: 'Последние 12 месяцев',
		range: 'До текущего момента'
	},
	currentGroup: 'Текущий',
	rollingGroup: 'Последние',
	quarterFormat: '{quarterRoman} кв. {year} г.',
	customPreset: 'Произвольный',
	timeline: 'Временная шкала',
	showTimeline: 'Показать временную шкалу',
	hideTimeline: 'Скрыть временную шкалу',
	start: 'Начало',
	end: 'Конец',
	range: 'Выбранный период'
};
