import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { zhHant } from './zh-Hant';
import { zhHans } from './zh-Hans';
import { ja } from './ja';
import { dailyCopy } from './daily-copy';
import { tutorialCopy } from './tutorial-copy';
import { communityCopy } from './community-copy';

export const i18nReady = i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'ui',
  keySeparator: false,
  nsSeparator: false,
  resources: {
    en: {
      ui: { ...en, ...dailyCopy.en, ...tutorialCopy.en, ...communityCopy.en },
    },
    'zh-Hant': {
      ui: {
        ...zhHant,
        ...dailyCopy['zh-Hant'],
        ...tutorialCopy['zh-Hant'],
        ...communityCopy['zh-Hant'],
      },
    },
    'zh-Hans': {
      ui: {
        ...zhHans,
        ...dailyCopy['zh-Hans'],
        ...tutorialCopy['zh-Hans'],
        ...communityCopy['zh-Hans'],
      },
    },
    ja: {
      ui: { ...ja, ...dailyCopy.ja, ...tutorialCopy.ja, ...communityCopy.ja },
    },
  },
  interpolation: {
    // React escapes rendered strings; translations never carry markup.
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

/** Apply the locale to the document so CSS font stacks follow. */
export function applyDocumentLocale(locale: string): void {
  document.documentElement.lang = locale;
}

export default i18n;
