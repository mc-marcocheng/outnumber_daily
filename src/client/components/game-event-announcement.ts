import type { TranslationFunction } from './i18n-types';
import type { InteractionEvent } from '../../shared/game/model';

export type { TranslationFunction };

/**
 * The shared announcement mapping for committed interactions. Both the
 * game screen and the rules demos reuse the existing `announce.*`
 * keys; this is a formatter, not new arithmetic logic.
 */
export function formatAnnouncement(
  t: TranslationFunction,
  event: InteractionEvent
): string {
  switch (event.kind) {
    case 'walk':
      return '';
    case 'absorb':
      return t('announce.absorb', { value: event.playerAfter.toString() });
    case 'win':
      return t('announce.win', { value: event.playerAfter.toString() });
    case 'add':
      return t('announce.add', { value: event.playerAfter.toString() });
    case 'subtract':
      return t('announce.subtract', { value: event.playerAfter.toString() });
    case 'divide':
      return t('announce.divide', { value: event.playerAfter.toString() });
    case 'multiply':
      return t('announce.multiply', { value: event.playerAfter.toString() });
    case 'set':
      return t('announce.set', { value: event.playerAfter.toString() });
    case 'respawn':
      return t('announce.respawn', {
        enemy: event.enemyAfter?.toString() ?? '',
        value: event.playerAfter.toString(),
      });
    case 'loss':
      return t('announce.loss');
  }
}
