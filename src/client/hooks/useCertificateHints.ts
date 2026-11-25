import { useMemo } from 'react';
import { initialState, interact } from '../../shared/game/engine';
import type { GameState, Level } from '../../shared/game/model';
import type { TranslationFunction } from '../components/i18n-types';

/**
 * Progressive hints derived from the shipped step-optimal certificate.
 * This replays the known witness line through the real engine — it is
 * NOT a solver and never searches. No hint worker runs in the post.
 */

function describeHintAction(
  t: TranslationFunction,
  level: Level,
  state: GameState,
  tileId: string
): string {
  const tile = level.tiles.find((item) => item.id === tileId);
  if (!tile) return t('hint.none');

  const result = interact(level, state, tileId);
  if (!result.ok) return t('hint.none');

  const { event } = result;

  switch (tile.kind) {
    case 'add':
      return t('hintAction.add', { value: tile.amount.toString() });
    case 'subtract':
      return t('hintAction.subtract', { value: tile.amount.toString() });
    case 'divide':
      return t('hintAction.divide', { value: tile.amount.toString() });
    case 'multiply':
      return t('hintAction.multiply', { value: tile.amount.toString() });
    case 'set':
      return t('hintAction.set', { value: tile.amount.toString() });
    default:
      break;
  }

  switch (event.kind) {
    case 'absorb':
      return t('hintAction.absorb', {
        value: (event.enemyBefore ?? 0n).toString(),
      });
    case 'win':
      return t('hintAction.win', {
        value: (event.enemyBefore ?? 0n).toString(),
      });
    case 'respawn':
      return t('hintAction.bank', {
        value: (event.enemyBefore ?? 0n).toString(),
        player: event.playerBefore.toString(),
      });
    default:
      return t('hint.none');
  }
}

export type CertificateHints = {
  available: boolean;
  /** Three distinct nudges, never a full solution. */
  hints: readonly (readonly string[])[];
};

export function useCertificateHints(
  level: Level | null,
  solution: readonly string[] | null,
  t: TranslationFunction
): CertificateHints {
  return useMemo(() => {
    if (!level || !solution || solution.length === 0) {
      return { available: false, hints: [] };
    }

    return buildCertificateHints(level, solution, t);
  }, [level, solution, t]);
}

export function buildCertificateHints(
  level: Level,
  solution: readonly string[],
  t: TranslationFunction
): CertificateHints {
  const first = solution[0];
  if (!first) return { available: false, hints: [] };
  const hasWindow = level.tiles.some(
    (tile) => tile.kind === 'enemy' && tile.maxSurplus !== undefined
  );
  const rule = hasWindow
    ? t('rule.window')
    : level.tiles.some((tile) => tile.kind === 'divide')
      ? t('rule.divide')
      : level.tiles.some((tile) => tile.kind === 'subtract')
        ? t('rule.subtract')
        : t('hint.arithmeticOrder');
  const planning =
    level.spareLives > 0 ? t('hint.bankPlanning') : t('hint.bossPlanning');
  const opening =
    solution.length > 1
      ? describeHintAction(t, level, initialState(level), first)
      : t('hint.reachableTarget');
  return { available: true, hints: [[rule], [planning], [opening]] };
}
