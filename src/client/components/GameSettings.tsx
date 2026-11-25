import { useId, useRef, useState } from 'react';
import { Monitor, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveTheme, type ThemePreference } from '../app/settings';
import {
  darkThemes,
  lightThemes,
  type DisplayPreferences,
} from '../app/theme-palettes';
import { useMediaQuery } from '../app/useMediaQuery';
import {
  previewSoundEffects,
  restoredSoundVolume,
  setSoundVolume,
  soundVolume,
} from '../app/sound-effects';
import { readLocalePreference, setLocalePreference } from '../i18n/bootstrap';
import { localeNames, supportedLocales } from '../i18n/locales';
import '../styles/settings.css';

type GameSettingsProps = DisplayPreferences & {
  onChange: (next: DisplayPreferences) => void;
};

export function GameSettings({
  theme,
  motion,
  lightTheme,
  darkTheme,
  onChange,
}: GameSettingsProps) {
  const { t } = useTranslation();
  const settingsId = useId();
  const [language, setLanguage] = useState(readLocalePreference);
  const [volume, setVolume] = useState(soundVolume);
  const volumeChanged = useRef(false);
  const previewVolume = () => {
    if (!volumeChanged.current) return;
    volumeChanged.current = false;
    void previewSoundEffects();
  };
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolvedTheme = resolveTheme(theme, systemDark);
  const preferences = { theme, motion, lightTheme, darkTheme };
  const themes: {
    value: ThemePreference;
    label: string;
    icon: typeof Monitor;
  }[] = [
    { value: 'system', label: t('settings.system'), icon: Monitor },
    { value: 'paper', label: t('settings.theme.light'), icon: Sun },
    { value: 'midnight', label: t('settings.theme.dark'), icon: Moon },
  ];

  return (
    <div className="game-settings">
      <div className="game-settings__row game-settings__sound">
        <label htmlFor={`${settingsId}-sound`}>{t('ui.soundEffects')}</label>
        <div className="game-settings__volume">
          <button
            type="button"
            className="icon-button"
            aria-label={t(volume > 0 ? 'ui.muteSound' : 'ui.unmuteSound')}
            title={t(volume > 0 ? 'ui.muteSound' : 'ui.unmuteSound')}
            onClick={() => {
              const next = volume > 0 ? 0 : restoredSoundVolume();
              setSoundVolume(next);
              setVolume(next);
              if (next > 0) void previewSoundEffects();
            }}
          >
            {volume > 0 ? (
              <Volume2 size={20} aria-hidden="true" />
            ) : (
              <VolumeX size={20} aria-hidden="true" />
            )}
          </button>
          <input
            id={`${settingsId}-sound`}
            type="range"
            min="0"
            max="100"
            step="1"
            value={volume}
            aria-valuetext={`${volume}%`}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              setSoundVolume(next);
              setVolume(next);
              volumeChanged.current = true;
            }}
            onPointerUp={previewVolume}
            onKeyUp={previewVolume}
            onBlur={previewVolume}
          />
          <output htmlFor={`${settingsId}-sound`}>{volume}%</output>
        </div>
      </div>
      <fieldset className="game-settings__appearance">
        <legend>{t('settings.appearance')}</legend>
        <div className="game-settings__segments">
          {themes.map(({ value, label, icon: Icon }) => (
            <label className="game-settings__segment" key={value}>
              <input
                type="radio"
                name={`${settingsId}-theme`}
                value={value}
                checked={theme === value}
                onChange={() => onChange({ ...preferences, theme: value })}
              />
              <span>
                <Icon size={18} aria-hidden="true" />
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="game-settings__row">
        <label htmlFor={`${settingsId}-palette`}>
          {t(
            resolvedTheme === 'paper'
              ? 'settings.lightPalette'
              : 'settings.darkPalette'
          )}
        </label>
        <select
          id={`${settingsId}-palette`}
          className="game-settings__language"
          value={resolvedTheme === 'paper' ? lightTheme : darkTheme}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (resolvedTheme === 'paper') {
              const next = lightThemes.find(
                (palette) => palette.value === value
              );
              if (next) onChange({ ...preferences, lightTheme: next.value });
            } else {
              const next = darkThemes.find(
                (palette) => palette.value === value
              );
              if (next) onChange({ ...preferences, darkTheme: next.value });
            }
          }}
        >
          {(resolvedTheme === 'paper' ? lightThemes : darkThemes).map(
            ({ value, label }) => (
              <option key={value} value={value}>
                {value === 'classic'
                  ? t('ui.classicTheme')
                  : value === 'high-contrast-light'
                    ? t('ui.highContrastLight')
                    : value === 'high-contrast-dark'
                      ? t('ui.highContrastDark')
                      : label}
              </option>
            )
          )}
        </select>
      </div>
      <div className="game-settings__row">
        <label htmlFor={`${settingsId}-language`}>
          {t('settings.language')}
        </label>
        <select
          id={`${settingsId}-language`}
          className="game-settings__language"
          value={language}
          onChange={(event) => {
            const value = event.currentTarget.value;
            const next =
              value === 'system'
                ? 'system'
                : supportedLocales.find((locale) => locale === value);
            if (!next) return;
            setLocalePreference(next);
            setLanguage(next);
          }}
        >
          <option value="system">{t('settings.system')}</option>
          {supportedLocales.map((locale) => (
            <option key={locale} value={locale} lang={locale}>
              {localeNames[locale]}
            </option>
          ))}
        </select>
      </div>
      <div className="game-settings__row">
        <label htmlFor={`${settingsId}-motion`}>
          {t('settings.motion.reduce')}
        </label>
        <input
          id={`${settingsId}-motion`}
          className="game-settings__switch"
          type="checkbox"
          role="switch"
          checked={motion === 'reduced'}
          onChange={(event) =>
            onChange({
              ...preferences,
              motion: event.currentTarget.checked ? 'reduced' : 'system',
            })
          }
        />
      </div>
    </div>
  );
}
