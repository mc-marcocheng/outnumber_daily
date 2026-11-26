import { useTranslation } from 'react-i18next';
import type { InteractionResult, Tile } from '../../shared/game/model';
import { formatInteractionFailure } from './interaction-failure';
import { translator } from './i18n-types';

type Selection = {
  tile: Tile;
  result: InteractionResult;
};

type Props = {
  /** Shown when nothing is selected (mechanic onboarding or generic). */
  instruction: string;
  selection: Selection | null;
  disabled: boolean;
  onConfirm: () => void;
};

export function InteractionPanel({
  instruction,
  selection,
  disabled,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  if (!selection) {
    // Quiet instruction. The panel keeps its reserved height so the
    // board never jumps when a selection appears.
    return (
      <div
        className="interaction-panel interaction-panel--empty"
        data-testid="game-inspector-empty"
      >
        <p className="panel-line panel-line--soft">{instruction}</p>
      </div>
    );
  }

  const { tile, result } = selection;

  if (!result.ok) {
    return (
      <div className="interaction-panel">
        <div className="preview-copy">
          <p className="panel-title">{titleFor(t, tile, result)}</p>
          <p className="panel-line panel-line--warn">
            {formatInteractionFailure(translator(t), result.reason)}
          </p>
        </div>
      </div>
    );
  }

  const { event } = result;
  const enemyBefore = event.enemyBefore;
  const windowed = event.absorbMax !== undefined;

  return (
    <div className="interaction-panel" data-testid="game-inspector">
      <div className="preview-copy">
        <p className="panel-title">{titleFor(t, tile, result)}</p>

        <p className="panel-line panel-line--soft number">
          {t('game.stepsPreview', {
            count: Math.max(result.path.length - 1, 0),
          })}
        </p>

        {enemyBefore !== undefined && (
          <p className="panel-line number" aria-hidden="true">
            {event.combatFailure === 'too-large'
              ? `${event.playerBefore.toString()} > ${event.absorbMax?.toString()}`
              : event.kind === 'absorb' || event.kind === 'win'
                ? `${event.playerBefore.toString()} > ${enemyBefore.toString()}`
                : `${event.playerBefore.toString()} ≤ ${enemyBefore.toString()}`}
          </p>
        )}

        {event.kind === 'absorb' && (
          <>
            {windowed && (
              <p className="panel-line">
                {t('tile.window', {
                  min: event.absorbMin?.toString() ?? '',
                  max: event.absorbMax?.toString() ?? '',
                })}
              </p>
            )}
            <p className="panel-line number">
              {t('game.absorb', {
                before: event.playerBefore.toString(),
                after: event.playerAfter.toString(),
              })}
            </p>
          </>
        )}

        {event.kind === 'win' && (
          <>
            <p className="panel-line number">
              {t('game.defeatPreview', {
                before: event.playerBefore.toString(),
                after: event.playerAfter.toString(),
              })}
            </p>
            <p className="panel-line">{t('game.winLine')}</p>
          </>
        )}

        {event.kind === 'add' && (
          <p className="panel-line number">
            {t('game.addPreview', {
              before: event.playerBefore.toString(),
              after: event.playerAfter.toString(),
            })}
          </p>
        )}

        {(event.kind === 'subtract' || event.kind === 'divide') && (
          <p className="panel-line number">
            {t(`game.${event.kind}Preview`, {
              before: event.playerBefore.toString(),
              after: event.playerAfter.toString(),
            })}
          </p>
        )}

        {event.kind === 'multiply' && (
          <p className="panel-line number">
            {t('game.multiplyPreview', {
              before: event.playerBefore.toString(),
              after: event.playerAfter.toString(),
            })}
          </p>
        )}

        {event.kind === 'set' && (
          <p className="panel-line number">
            {t('game.setPreview', {
              before: event.playerBefore.toString(),
              after: event.playerAfter.toString(),
            })}
          </p>
        )}

        {event.kind === 'respawn' && (
          <>
            {event.playerBefore === enemyBefore && (
              <p className="panel-line panel-line--warn">
                {t('game.tieLoses')}
              </p>
            )}
            {event.combatFailure && (
              <p className="panel-line panel-line--warn">
                {t(
                  event.combatFailure === 'too-large'
                    ? 'combat.tooHigh'
                    : 'combat.tooLow'
                )}
              </p>
            )}
            <p className="panel-line number">
              {t('game.bankPreview', {
                value: event.playerBefore.toString(),
                enemy: event.enemyAfter?.toString() ?? '',
              })}
            </p>
            <p className="panel-line">
              {t('game.respawnPreview', {
                value: event.playerAfter.toString(),
              })}
            </p>
            {windowed && (
              <p className="panel-line">
                {t('combat.nextWindow', {
                  min: ((event.enemyAfter ?? 0n) + 1n).toString(),
                  max: (
                    (event.enemyAfter ?? 0n) +
                    (event.absorbMax ?? 0n) -
                    (event.absorbMin ?? 0n) +
                    1n
                  ).toString(),
                })}
              </p>
            )}
          </>
        )}

        {event.kind === 'loss' && (
          <>
            {event.playerBefore === enemyBefore && (
              <p className="panel-line panel-line--warn">
                {t('game.tieLoses')}
              </p>
            )}
            {event.combatFailure && (
              <p className="panel-line panel-line--warn">
                {t(
                  event.combatFailure === 'too-large'
                    ? 'combat.tooHigh'
                    : 'combat.tooLow'
                )}
              </p>
            )}
            <p className="panel-line panel-line--warn">
              {t('game.lossPreview')}
            </p>
            <p className="panel-line">{t('game.lossFinal')}</p>
          </>
        )}
      </div>

      <button
        type="button"
        data-testid="confirm-interaction"
        className={[
          'primary-action',
          event.kind === 'respawn' || event.kind === 'loss'
            ? 'primary-action--risky'
            : '',
        ].join(' ')}
        disabled={disabled}
        onClick={onConfirm}
      >
        {actionLabel(t, tile, event)}
      </button>
    </div>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

function titleFor(t: T, tile: Tile, result: InteractionResult): string {
  if (tile.kind === 'enemy' || tile.kind === 'boss') {
    const value =
      result.ok && result.event.enemyBefore !== undefined
        ? result.event.enemyBefore
        : tile.value;

    return tile.kind === 'boss'
      ? t('game.boss', { value: value.toString() })
      : t('game.enemy', { value: value.toString() });
  }

  switch (tile.kind) {
    case 'add':
      return `+${tile.amount.toString()}`;
    case 'subtract':
      return `−${tile.amount.toString()}`;
    case 'divide':
      return `÷${tile.amount.toString()}`;
    case 'multiply':
      return `×${tile.amount.toString()}`;
    case 'set':
      return `=${tile.amount.toString()}`;
    default:
      return '';
  }
}

function actionLabel(
  t: T,
  tile: Tile,
  event: Extract<InteractionResult, { ok: true }>['event']
): string {
  switch (tile.kind) {
    case 'add':
      return t('game.takeAdd', { value: tile.amount.toString() });
    case 'subtract':
      return t('game.takeSubtract', { value: tile.amount.toString() });
    case 'divide':
      return t('game.takeDivide', { value: tile.amount.toString() });
    case 'multiply':
      return t('game.takeMultiply', { value: tile.amount.toString() });
    case 'set':
      return t('game.takeSet', { value: tile.amount.toString() });
    case 'enemy':
    case 'boss':
      switch (event.kind) {
        case 'win':
          return t('game.defeatBoss');
        case 'respawn':
          return t('game.bankButton', {
            value: event.playerBefore.toString(),
          });
        case 'loss':
          return t('game.attackAnyway');
        default:
          return t('game.absorbEnemy');
      }
  }
}
