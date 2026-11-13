import type { Locale } from './core/format.js';
import { labelsFor } from './locales/index.js';
import type { TimeRangeSliderLabelOverrides, TimeRangeSliderLabels } from './types.js';

/** The translation for `locale`, with any entries of `overrides` replacing its own. */
export function resolveLabels(
	locale: Locale,
	overrides?: TimeRangeSliderLabelOverrides
): TimeRangeSliderLabels {
	const base = labelsFor(locale);
	if (!overrides) return base;
	return {
		...base,
		...overrides,
		presets: { ...base.presets, ...overrides.presets },
		current: { ...base.current, ...overrides.current },
		rolling: { ...base.rolling, ...overrides.rolling }
	};
}
