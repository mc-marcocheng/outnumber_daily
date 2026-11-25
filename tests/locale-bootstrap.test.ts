import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapLocale,
  readLocalePreference,
  setLocalePreference,
} from '../src/client/i18n/bootstrap';
import i18n, { i18nReady } from '../src/client/i18n';

const values = new Map<string, string>();
const documentElement = { lang: '' };

beforeEach(async () => {
  await i18nReady;
  values.clear();
  documentElement.lang = '';
  vi.stubGlobal('document', { documentElement });
  vi.stubGlobal('navigator', { languages: ['ja-JP'] });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('locale bootstrap persistence', () => {
  it('defaults missing and invalid preferences to system', () => {
    expect(readLocalePreference()).toBe('system');
    values.set('outnumber-language', 'fr');
    expect(readLocalePreference()).toBe('system');
    bootstrapLocale();
    expect(i18n.language).toBe('ja');
    expect(documentElement.lang).toBe('ja');
  });

  it.each(['system', 'en', 'ja', 'zh-Hans', 'zh-Hant'])(
    'reads the saved %s preference',
    (preference) => {
      values.set('outnumber-language', preference);
      expect(readLocalePreference()).toBe(preference);
      bootstrapLocale();
      const expected = preference === 'system' ? 'ja' : preference;
      expect(i18n.language).toBe(expected);
      expect(documentElement.lang).toBe(expected);
    }
  );

  it('persists runtime changes separately from display preferences', () => {
    values.set('outnumber-display', '{"theme":"paper","motion":"system"}');
    setLocalePreference('zh-Hant');
    expect(readLocalePreference()).toBe('zh-Hant');
    expect(i18n.language).toBe('zh-Hant');
    expect(documentElement.lang).toBe('zh-Hant');
    expect(values.get('outnumber-display')).toBe(
      '{"theme":"paper","motion":"system"}'
    );
    setLocalePreference('system');
    expect(readLocalePreference()).toBe('system');
    expect(i18n.language).toBe('ja');
    expect(documentElement.lang).toBe('ja');
  });

  it('ignores invalid runtime values', () => {
    setLocalePreference('en');
    Reflect.apply(setLocalePreference, undefined, ['fr']);
    expect(readLocalePreference()).toBe('en');
    expect(i18n.language).toBe('en');
    expect(documentElement.lang).toBe('en');
  });

  it('applies language changes when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Unavailable');
      },
      setItem: () => {
        throw new Error('Unavailable');
      },
    });
    expect(readLocalePreference()).toBe('system');
    bootstrapLocale();
    expect(documentElement.lang).toBe('ja');
    setLocalePreference('zh-Hans');
    expect(i18n.language).toBe('zh-Hans');
    expect(documentElement.lang).toBe('zh-Hans');
  });
});
