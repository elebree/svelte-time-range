import { describe, expect, it } from 'vitest';
import { formatQuarter } from '../core/format.js';
import { weekStartOf } from '../core/locale.js';
import {
	LABELS,
	labelsDe,
	labelsEn,
	labelsFor,
	labelsPt,
	labelsZhHans,
	labelsZhHant
} from './index.js';

/** All string leaves of a labels object, keyed by path. */
function leaves(value: unknown, path = ''): [string, unknown][] {
	if (typeof value !== 'object' || value === null) return [[path, value]];
	return Object.entries(value).flatMap(([key, child]) =>
		leaves(child, path ? `${path}.${key}` : key)
	);
}

const englishKeys = leaves(labelsEn).map(([key]) => key);

describe.each(Object.entries(LABELS))('%s translation', (code, labels) => {
	it('has every string, non-empty and trimmed', () => {
		const entries = leaves(labels);
		expect(entries.map(([key]) => key)).toEqual(englishKeys);
		for (const [key, value] of entries) {
			expect(typeof value, key).toBe('string');
			expect((value as string).trim(), key).toBe(value);
			expect(value, key).not.toBe('');
		}
	});

	it('names every quarter differently, with the year', () => {
		const texts = [1, 2, 3, 4].map((quarter) =>
			formatQuarter(labels.quarterFormat, quarter, { year: '2025', number: String })
		);
		expect(new Set(texts).size, code).toBe(4);
		for (const text of texts) {
			expect(text).toContain('2025');
			expect(text).not.toMatch(/[{}]/);
		}
	});

	it('uses distinct labels for the preset buttons', () => {
		expect(new Set(Object.values(labels.presets)).size).toBe(6);
		expect(new Set(Object.values(labels.current)).size).toBe(7);
		expect(new Set(Object.values(labels.rolling)).size).toBe(7);
	});
});

describe('labelsFor', () => {
	it.each([
		['de-AT', labelsDe],
		['pt-BR', labelsPt],
		['pt-PT', labelsPt],
		['zh', labelsZhHans],
		['zh-CN', labelsZhHans],
		['zh-TW', labelsZhHant],
		['zh-HK', labelsZhHant],
		['zh-Hant', labelsZhHant],
		['xx-unknown', labelsEn]
	])('picks the translation for %s', (locale, expected) => {
		expect(labelsFor(locale)).toBe(expected);
	});

	it('tries several locales in order', () => {
		expect(labelsFor(['gsw', 'de'])).toBe(labelsDe);
		expect(labelsFor(['not a tag', 'pt'])).toBe(labelsPt);
	});
});

describe('weekStartOf', () => {
	it.each([
		['en-US', 0],
		['en-GB', 1],
		['de-DE', 1],
		['pt-BR', 0],
		['ja-JP', 0],
		['zh-CN', 1],
		['ar-EG', 6],
		['dv-MV', 5]
	] as const)('knows that weeks in %s start on day %d', (locale, day) => {
		expect(weekStartOf(locale)).toBe(day);
	});

	it('falls back to Monday for invalid tags', () => {
		expect(weekStartOf('not a tag')).toBe(1);
	});
});

describe('formatQuarter', () => {
	it('fills Roman numerals and localized digits', () => {
		expect(formatQuarter('{quarterRoman} kw. {year}', 3, { year: '2025', number: String })).toBe(
			'III kw. 2025'
		);
		expect(formatQuarter('Q{quarter}', 2, { year: '', number: () => '٢' })).toBe('Q٢');
	});
});
