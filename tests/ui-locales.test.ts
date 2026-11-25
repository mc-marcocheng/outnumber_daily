import { describe, expect, it } from 'vitest';
import i18n, { i18nReady } from '../src/client/i18n';
import { dailyCopy } from '../src/client/i18n/daily-copy';
import { tutorialCopy } from '../src/client/i18n/tutorial-copy';
import { supportedLocales } from '../src/client/i18n/locales';
import { guidedPages, lessons } from '../src/client/tutorials/lessons';

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*([^}]+)\s*}}/g)]
    .map((match) => match[1]!.trim())
    .sort();
}

describe('active UI translations', () => {
  for (const [name, resources] of [
    ['daily', dailyCopy],
    ['tutorial', tutorialCopy],
  ] satisfies [string, Record<string, Record<string, string>>][]) {
    for (const locale of supportedLocales) {
      it(`provides complete ${name} copy in ${locale}`, async () => {
        await i18nReady;
        const english = resources.en!;
        const translated: Record<string, string> = resources[locale]!;
        expect(Object.keys(translated).sort()).toEqual(
          Object.keys(english).sort()
        );
        for (const [key, source] of Object.entries(english)) {
          const value = translated[key]!;
          expect(value.trim(), key).not.toBe('');
          expect(placeholders(value), key).toEqual(placeholders(source));
          expect(value.match(/<\/?(?:strong|b)>/g) ?? [], key).toEqual(
            source.match(/<\/?(?:strong|b)>/g) ?? []
          );
          expect(i18n.getResource(locale, 'ui', key), key).toBe(value);
          if (
            locale !== 'en' &&
            /[A-Za-z]{3}/.test(source) &&
            !['tutorial.brand', 'tutorial.progress'].includes(key)
          ) {
            expect(value, key).not.toBe(source);
          }
        }
      });
    }
  }

  it('keeps English tutorial copy aligned with the lesson metadata', () => {
    for (const lesson of lessons) {
      expect(tutorialCopy.en[`tutorial.lesson.${lesson.id}.title`]).toBe(
        lesson.title
      );
      expect(tutorialCopy.en[`tutorial.lesson.${lesson.id}.description`]).toBe(
        lesson.description
      );
    }
    for (const [index, page] of guidedPages.entries()) {
      expect(tutorialCopy.en[`tutorial.guided.page.${index}.title`]).toBe(
        page.title
      );
      expect(tutorialCopy.en[`tutorial.guided.page.${index}.text`]).toBe(
        page.text
      );
    }
  });
});
