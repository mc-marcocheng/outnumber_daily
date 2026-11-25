export const supportedLocales = ['en', 'zh-Hant', 'zh-Hans', 'ja'] as const;

export type AppLocale = (typeof supportedLocales)[number];
export type LocalePreference = 'system' | AppLocale;

/** Native language names, shown the same way in every interface language. */
export const localeNames: Record<AppLocale, string> = {
  en: 'English',
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  ja: '日本語',
};

export function matchLocale(tag: string): AppLocale | null {
  const parts = tag.toLowerCase().replace(/_/g, '-').split('-');
  const language = parts[0];

  if (language === 'en') return 'en';
  if (language === 'ja') return 'ja';

  if (language === 'zh') {
    if (parts.includes('hant')) return 'zh-Hant';
    if (parts.includes('hans')) return 'zh-Hans';

    if (parts.includes('tw') || parts.includes('hk') || parts.includes('mo')) {
      return 'zh-Hant';
    }

    return 'zh-Hans';
  }

  return null;
}

export function resolveLocale(
  preference: LocalePreference,
  browserLanguages: readonly string[]
): AppLocale {
  if (preference !== 'system') return preference;

  for (const tag of browserLanguages) {
    const locale = matchLocale(tag);
    if (locale) return locale;
  }

  return 'en';
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}
