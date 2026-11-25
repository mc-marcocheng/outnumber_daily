import { describe, expect, it } from 'vitest';
import { communityCopy } from '../src/client/i18n/community-copy';
import { supportedLocales } from '../src/client/i18n/locales';

describe('community translations', () => {
  for (const locale of supportedLocales) {
    it(`covers the same interface and placeholders in ${locale}`, () => {
      expect(Object.keys(communityCopy[locale])).toEqual(
        Object.keys(communityCopy.en)
      );
      for (const [key, text] of Object.entries(communityCopy[locale])) {
        expect(text.trim(), key).not.toBe('');
        expect(text.match(/\{\{\w+\}\}/g)?.sort() ?? [], key).toEqual(
          key.match(/\{\{\w+\}\}/g)?.sort() ?? []
        );
        if (locale !== 'en') expect(text, key).not.toBe(communityCopy.en[key]);
      }
    });
  }
});
