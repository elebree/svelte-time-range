/**
 * UI translations. Dates, times and numbers are localized by `Intl`; these cover the words.
 * Each language lives in its own module, so a bundler keeps only the ones that are used.
 */
import { localeTags } from '../core/locale.js';
import type { Locale } from '../core/format.js';
import type { TimeRangeSliderLabels } from '../types.js';
import { labelsCs } from './cs.js';
import { labelsDe } from './de.js';
import { labelsEn } from './en.js';
import { labelsEs } from './es.js';
import { labelsFr } from './fr.js';
import { labelsIt } from './it.js';
import { labelsJa } from './ja.js';
import { labelsKo } from './ko.js';
import { labelsNl } from './nl.js';
import { labelsPl } from './pl.js';
import { labelsPt } from './pt.js';
import { labelsRu } from './ru.js';
import { labelsSv } from './sv.js';
import { labelsTr } from './tr.js';
import { labelsUk } from './uk.js';
import { labelsZhHans } from './zh-Hans.js';
import { labelsZhHant } from './zh-Hant.js';

export {
	labelsCs,
	labelsDe,
	labelsEn,
	labelsEs,
	labelsFr,
	labelsIt,
	labelsJa,
	labelsKo,
	labelsNl,
	labelsPl,
	labelsPt,
	labelsRu,
	labelsSv,
	labelsTr,
	labelsUk,
	labelsZhHans,
	labelsZhHant
};

/** The built-in translations by language (and script, for Chinese). */
export const LABELS: Readonly<Record<string, TimeRangeSliderLabels>> = {
	cs: labelsCs,
	de: labelsDe,
	en: labelsEn,
	es: labelsEs,
	fr: labelsFr,
	it: labelsIt,
	ja: labelsJa,
	ko: labelsKo,
	nl: labelsNl,
	pl: labelsPl,
	pt: labelsPt,
	ru: labelsRu,
	sv: labelsSv,
	tr: labelsTr,
	uk: labelsUk,
	'zh-Hans': labelsZhHans,
	'zh-Hant': labelsZhHant
};

/**
 * The translation for a locale: "de-AT" → German, "pt-BR" → Portuguese, "zh-TW" and "zh-HK" →
 * Traditional Chinese, "zh" → Simplified. Several locales are tried in order; English if none
 * has a translation. Without a locale, the runtime's default locale is used.
 */
export function labelsFor(locale?: Locale): TimeRangeSliderLabels {
	for (const tag of localeTags(locale)) {
		try {
			const { language, script } = new Intl.Locale(tag).maximize();
			const labels = LABELS[`${language}-${script}`] ?? LABELS[language];
			if (labels) return labels;
		} catch {
			// Not a valid tag: try the next one.
		}
	}
	return labelsEn;
}
