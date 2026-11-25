import { useLayoutEffect } from 'react';
import {
  resolveTheme,
  resolveMotion,
  type ThemePreference,
  type MotionSetting,
} from './settings';
import type { LightTheme, DarkTheme } from './theme-palettes';
import { useMediaQuery } from './useMediaQuery';
import '../styles/themes.css';

type Props = {
  theme: ThemePreference;
  motion: MotionSetting;
  lightTheme?: LightTheme;
  darkTheme?: DarkTheme;
};

/**
 * Resolve theme + motion preferences (including live system changes)
 * onto the document root, and keep the status-bar colour in sync.
 */
export function AppAppearance({
  theme,
  motion,
  lightTheme = 'classic',
  darkTheme = 'classic',
}: Props) {
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');

  const resolvedTheme = resolveTheme(theme, dark);
  const palette = resolvedTheme === 'paper' ? lightTheme : darkTheme;
  const resolvedMotion = resolveMotion(motion, reduced);

  useLayoutEffect(() => {
    const root = document.documentElement;

    root.dataset.theme = resolvedTheme;
    root.dataset.palette = palette;
    root.dataset.motion = resolvedMotion;

    const themeColor = getComputedStyle(root)
      .getPropertyValue('--color-bg')
      .trim();

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themeColor);
  }, [resolvedTheme, palette, resolvedMotion]);

  return null;
}
