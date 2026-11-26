import type { TFunction } from 'i18next';

export type TranslationFunction = (
  key: string,
  options?: Record<string, unknown>
) => string;

/** Adapts the typed `t` from react-i18next to the plain function the helpers take. */
export function translator(t: TFunction): TranslationFunction {
  return (key, options) => t(key, { ...options });
}
