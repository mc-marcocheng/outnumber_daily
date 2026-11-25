import type { MotionSetting, ThemePreference } from '../../shared/settings';

export type { MotionSetting, ThemePreference };

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean
): 'paper' | 'midnight' {
  if (preference === 'system') return systemDark ? 'midnight' : 'paper';
  return preference;
}

export function resolveMotion(
  setting: MotionSetting,
  systemReduced: boolean
): 'full' | 'reduced' {
  if (setting === 'reduced') return 'reduced';
  return systemReduced ? 'reduced' : 'full';
}
