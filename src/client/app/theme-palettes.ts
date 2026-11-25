import { z } from 'zod';
import type { MotionSetting, ThemePreference } from './settings';

export const lightThemeSchema = z.enum([
  'classic',
  'github-light',
  'solarized-light',
  'rose-pine-dawn',
  'catppuccin-latte',
  'high-contrast-light',
]);
export const darkThemeSchema = z.enum([
  'classic',
  'github-dark',
  'dracula',
  'nord',
  'tokyo-night',
  'catppuccin-mocha',
  'high-contrast-dark',
]);

export type LightTheme = z.infer<typeof lightThemeSchema>;
export type DarkTheme = z.infer<typeof darkThemeSchema>;
export type DisplayPreferences = {
  theme: ThemePreference;
  motion: MotionSetting;
  lightTheme: LightTheme;
  darkTheme: DarkTheme;
};

type Palette<Value extends string> = { value: Value; label: string };

export const lightThemes: readonly Palette<LightTheme>[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'github-light', label: 'GitHub Light' },
  { value: 'solarized-light', label: 'Solarized Light' },
  { value: 'rose-pine-dawn', label: 'Rose Pine Dawn' },
  { value: 'catppuccin-latte', label: 'Catppuccin Latte' },
  { value: 'high-contrast-light', label: 'High Contrast Light' },
];

export const darkThemes: readonly Palette<DarkTheme>[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'github-dark', label: 'GitHub Dark' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'nord', label: 'Nord' },
  { value: 'tokyo-night', label: 'Tokyo Night' },
  { value: 'catppuccin-mocha', label: 'Catppuccin Mocha' },
  { value: 'high-contrast-dark', label: 'High Contrast Dark' },
];

export const displayPreferencesSchema = z.object({
  theme: z.enum(['system', 'paper', 'midnight']).catch('system'),
  motion: z.enum(['system', 'reduced']).catch('system'),
  lightTheme: lightThemeSchema.catch('classic'),
  darkTheme: darkThemeSchema.catch('classic'),
});
