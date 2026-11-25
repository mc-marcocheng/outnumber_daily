import type { TranslationFunction } from './i18n-types';

export function formatInteractionFailure(
  t: TranslationFunction,
  reason: string,
  blockedKey = 'game.blocked'
): string {
  switch (reason) {
    case 'non-positive-result':
      return t('game.nonPositiveResult');
    case 'non-integer-result':
      return t('game.nonIntegerResult');
    case 'unreachable':
      return t(blockedKey);
    default:
      return t('game.cannotInteract');
  }
}
