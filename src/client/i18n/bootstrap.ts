import i18n, { applyDocumentLocale } from './index';
import { browserLanguages, resolveLocale } from './locales';
import type { LocalePreference } from './locales';

const languageStorageKey = 'outnumber-language';

function isLocalePreference(value: unknown): value is LocalePreference {
  return (
    value === 'system' ||
    value === 'en' ||
    value === 'ja' ||
    value === 'zh-Hans' ||
    value === 'zh-Hant'
  );
}

export function readLocalePreference(): LocalePreference {
  try {
    const preference = localStorage.getItem(languageStorageKey);
    return isLocalePreference(preference) ? preference : 'system';
  } catch {
    return 'system';
  }
}

export function setLocalePreference(preference: LocalePreference): void {
  if (!isLocalePreference(preference)) return;
  try {
    localStorage.setItem(languageStorageKey, preference);
  } catch {
    applyLocalePreference(preference);
    return;
  }
  applyLocalePreference(preference);
}

function applyLocalePreference(preference: LocalePreference): void {
  const locale = resolveLocale(preference, browserLanguages());
  void i18n.changeLanguage(locale);
  applyDocumentLocale(locale);
}

export function bootstrapLocale(): void {
  applyLocalePreference(readLocalePreference());
}
