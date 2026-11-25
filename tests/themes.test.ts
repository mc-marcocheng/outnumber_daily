// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AppAppearance } from '../src/client/app/AppAppearance';
import { resolveTheme, resolveMotion } from '../src/client/app/settings';
import {
  darkThemes,
  displayPreferencesSchema,
  lightThemes,
  type DisplayPreferences,
} from '../src/client/app/theme-palettes';
import { GameSettings } from '../src/client/components/GameSettings';
import { i18nReady } from '../src/client/i18n';

const defaults: DisplayPreferences = {
  theme: 'system',
  motion: 'system',
  lightTheme: 'classic',
  darkTheme: 'classic',
};
const themeStyles = readFileSync('src/client/styles/themes.css', 'utf8');
const tokenStyles = readFileSync('src/client/styles/tokens.css', 'utf8');
const container = document.createElement('div');
let root = createRoot(container);
const media = new Map<string, MediaQueryList>();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function setMedia(query: string, matches: boolean) {
  const entry = media.get(query);
  if (!entry) throw new Error(`Missing query: ${query}`);
  Object.defineProperty(entry, 'matches', {
    configurable: true,
    value: matches,
  });
  entry.dispatchEvent(new Event('change'));
}

beforeEach(async () => {
  await i18nReady;
  localStorage.clear();
  media.clear();
  vi.stubGlobal('matchMedia', (query: string) => {
    let entry = media.get(query);
    if (!entry) {
      entry = Object.assign(new EventTarget(), {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
      });
      media.set(query, entry);
    }
    return entry;
  });
  document.head.innerHTML = '<meta name="theme-color" content="">';
  document.documentElement.style.setProperty('--color-bg', '#123456');
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  container.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.removeAttribute('data-motion');
  document.documentElement.removeAttribute('style');
  vi.unstubAllGlobals();
});

describe('display preference schema', () => {
  it('defaults missing fields and retains old paper/midnight preferences', () => {
    expect(displayPreferencesSchema.parse({})).toEqual(defaults);
    for (const theme of ['system', 'paper', 'midnight']) {
      expect(
        displayPreferencesSchema.parse({ theme, motion: 'reduced' })
      ).toEqual({ ...defaults, theme, motion: 'reduced' });
    }
  });

  it('defaults invalid fields independently without losing valid selections', () => {
    expect(
      displayPreferencesSchema.parse({
        theme: 'invalid',
        motion: null,
        lightTheme: 'github-light',
        darkTheme: 'not-a-theme',
      })
    ).toEqual({ ...defaults, lightTheme: 'github-light' });
    expect(
      displayPreferencesSchema.parse({
        theme: 'paper',
        motion: 'reduced',
        lightTheme: 'dracula',
        darkTheme: 'nord',
      })
    ).toEqual({
      ...defaults,
      theme: 'paper',
      motion: 'reduced',
      darkTheme: 'nord',
    });
    for (const value of [null, [], 'invalid', 7]) {
      expect(displayPreferencesSchema.safeParse(value).success).toBe(false);
    }
  });

  it('round-trips both palette choices through the existing storage key', () => {
    for (const theme of ['system', 'paper', 'midnight']) {
      const saved = {
        ...defaults,
        theme,
        lightTheme: 'solarized-light',
        darkTheme: 'dracula',
      };
      localStorage.setItem('outnumber-display', JSON.stringify(saved));
      expect(
        displayPreferencesSchema.parse(
          JSON.parse(localStorage.getItem('outnumber-display') ?? 'null')
        )
      ).toEqual(saved);
    }
  });

  it('accepts every catalog entry and keeps catalog values unique', () => {
    expect(new Set(lightThemes.map(({ value }) => value)).size).toBe(6);
    expect(new Set(darkThemes.map(({ value }) => value)).size).toBe(7);
    for (const { value } of lightThemes) {
      expect(
        displayPreferencesSchema.parse({ lightTheme: value }).lightTheme
      ).toBe(value);
    }
    for (const { value } of darkThemes) {
      expect(
        displayPreferencesSchema.parse({ darkTheme: value }).darkTheme
      ).toBe(value);
    }
  });
});

describe('appearance resolution', () => {
  it('resolves the base theme and motion', () => {
    expect(resolveTheme('system', false)).toBe('paper');
    expect(resolveTheme('system', true)).toBe('midnight');
    expect(resolveTheme('paper', true)).toBe('paper');
    expect(resolveTheme('midnight', false)).toBe('midnight');
    expect(resolveMotion('system', true)).toBe('reduced');
  });

  it('defaults optional palettes to classic', async () => {
    for (const theme of [
      'paper',
      'midnight',
    ] satisfies DisplayPreferences['theme'][]) {
      await act(async () =>
        root.render(createElement(AppAppearance, { theme, motion: 'system' }))
      );
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(document.documentElement.dataset.palette).toBe('classic');
    }
  });

  it('updates system palette and reduced motion live and refreshes the theme-color meta', async () => {
    await act(async () =>
      root.render(
        createElement(AppAppearance, {
          ...defaults,
          lightTheme: 'github-light',
          darkTheme: 'nord',
        })
      )
    );
    expect(document.documentElement.dataset.theme).toBe('paper');
    expect(document.documentElement.dataset.palette).toBe('github-light');
    expect(document.documentElement.dataset.motion).toBe('full');
    document.documentElement.style.setProperty('--color-bg', '#654321');
    await act(async () => {
      setMedia('(prefers-color-scheme: dark)', true);
      setMedia('(prefers-reduced-motion: reduce)', true);
    });
    expect(document.documentElement.dataset.theme).toBe('midnight');
    expect(document.documentElement.dataset.palette).toBe('nord');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content')
    ).toBe('#654321');
    await act(async () => setMedia('(prefers-color-scheme: dark)', false));
    expect(document.documentElement.dataset.palette).toBe('github-light');
  });

  it('does not switch explicit light mode when the system changes', async () => {
    await act(async () =>
      root.render(
        createElement(AppAppearance, {
          ...defaults,
          theme: 'paper',
          lightTheme: 'rose-pine-dawn',
        })
      )
    );
    await act(async () => setMedia('(prefers-color-scheme: dark)', true));
    expect(document.documentElement.dataset.theme).toBe('paper');
    expect(document.documentElement.dataset.palette).toBe('rose-pine-dawn');
  });
});

function SettingsProbe() {
  const [preferences, setPreferences] = useState<DisplayPreferences>({
    ...defaults,
    lightTheme: 'github-light',
    darkTheme: 'dracula',
  });
  return createElement(GameSettings, {
    ...preferences,
    onChange: setPreferences,
  });
}

function paletteSelect(): HTMLSelectElement {
  const select = container.querySelector('select');
  if (!select) throw new Error('Missing palette select');
  return select;
}

async function selectPalette(value: string) {
  await act(async () => {
    paletteSelect().value = value;
    paletteSelect().dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('settings controls', () => {
  it('shows exactly three modes and retains separate palette choices across switches', async () => {
    await act(async () => root.render(createElement(SettingsProbe)));
    expect(
      [...container.querySelectorAll('input[type="radio"]')].map((input) =>
        input.getAttribute('value')
      )
    ).toEqual(['system', 'paper', 'midnight']);
    expect(paletteSelect().labels?.[0]?.textContent).toBe('Light theme');
    expect(paletteSelect().value).toBe('github-light');
    await selectPalette('solarized-light');
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[value="midnight"]')
        ?.click()
    );
    expect(paletteSelect().labels?.[0]?.textContent).toBe('Dark theme');
    expect(paletteSelect().value).toBe('dracula');
    expect(paletteSelect().options).toHaveLength(darkThemes.length);
    await selectPalette('tokyo-night');
    await act(async () =>
      container.querySelector<HTMLInputElement>('input[role="switch"]')?.click()
    );
    expect(paletteSelect().value).toBe('tokyo-night');
    await act(async () =>
      container.querySelector<HTMLInputElement>('input[value="paper"]')?.click()
    );
    expect(paletteSelect().value).toBe('solarized-light');
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[value="midnight"]')
        ?.click()
    );
    expect(paletteSelect().value).toBe('tokyo-night');
  });

  it('changes the visible dropdown live in system mode without discarding either selection', async () => {
    await act(async () => root.render(createElement(SettingsProbe)));
    expect(paletteSelect().options).toHaveLength(lightThemes.length);
    await act(async () => setMedia('(prefers-color-scheme: dark)', true));
    expect(paletteSelect().value).toBe('dracula');
    expect(paletteSelect().labels?.[0]?.textContent).toBe('Dark theme');
    await selectPalette('nord');
    await act(async () => setMedia('(prefers-color-scheme: dark)', false));
    expect(paletteSelect().value).toBe('github-light');
    await act(async () => setMedia('(prefers-color-scheme: dark)', true));
    expect(paletteSelect().value).toBe('nord');
  });
});

describe('palette styles', () => {
  it('defines every non-classic palette and overrides every semantic color token', () => {
    const colors = new Set(
      [...tokenStyles.matchAll(/--color-[\w-]+(?=:)/g)].map(([name]) => name)
    );
    for (const color of colors) expect(themeStyles).toContain(`${color}:`);
    const required = [
      'bg',
      'surface',
      'ink',
      'muted',
      'accent',
      'on-accent',
      'focus',
      'wall',
      'floor',
      'border',
      'enemy',
      'boss',
      'add',
      'multiply',
      'risk',
      'notice',
      'difficulty-easy',
      'difficulty-medium',
      'difficulty-hard',
    ];
    for (const { value } of [...lightThemes, ...darkThemes]) {
      if (value === 'classic') continue;
      const block = themeStyles.match(
        new RegExp(`\\[data-palette=['\"]?${value}['\"]?\\]\\s*\\{([^}]+)\\}`)
      )?.[1];
      expect(block).toBeDefined();
      for (const token of required)
        expect(block).toContain(`--palette-${token}:`);
    }
  });
});
