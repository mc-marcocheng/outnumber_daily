import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CrownIcon, HomeIcon } from './icons';
import { activeTiles, pathToTile } from '../../shared/game/engine';
import { analyzeReachability } from '../../shared/game/reachability';
import type { Cell, GameState, Level, Tile } from '../../shared/game/model';
import { NumberLabel } from './NumberLabel';
import { PlayerToken } from './PlayerToken';

type Props = {
  level: Level;
  state: GameState;
  selectedId: string | null;
  path: readonly Cell[] | null;
  focusCells?: readonly Cell[];
  cellSize: number;
  disabled: boolean;
  hidePlayer: boolean;
  flashTileId: string | null;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  /** Optional localized board name; the default keeps game naming. */
  boardLabel?: string;
  /** The player's snoovatar; falls back to a numbered token when null. */
  avatarUrl: string | null;
};

/** The legal absorption interval of a window enemy, if it has one. */
function windowInterval(
  tile: Tile,
  state: GameState
): { min: bigint; max: bigint } | null {
  if (tile.kind !== 'enemy' || tile.maxSurplus === undefined) return null;

  const value = state.enemies.get(tile.id) ?? tile.value;

  return { min: value + 1n, max: value + tile.maxSurplus };
}

function tileText(tile: Tile, state: GameState): string {
  switch (tile.kind) {
    case 'enemy':
    case 'boss':
      return (state.enemies.get(tile.id) ?? 0n).toString();
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
  }
}

function tileAriaName(
  t: ReturnType<typeof useTranslation>['t'],
  tile: Tile,
  state: GameState
): string {
  switch (tile.kind) {
    case 'enemy': {
      const value = state.enemies.get(tile.id) ?? 0n;
      const name = t('game.enemy', { value: value.toString() });
      const interval = windowInterval(tile, state);

      if (!interval) return name;

      return [
        name,
        interval.min === interval.max
          ? t('tile.exactWindow', { value: interval.min.toString() })
          : t('tile.window', {
              min: interval.min.toString(),
              max: interval.max.toString(),
            }),
      ].join(', ');
    }
    case 'boss':
      return t('game.boss', {
        value: (state.enemies.get(tile.id) ?? 0n).toString(),
      });
    case 'add':
      return t('game.addLabel', { value: `+${tile.amount.toString()}` });
    case 'subtract':
      return t('game.subtractLabel', { value: tile.amount.toString() });
    case 'divide':
      return t('game.divideLabel', { value: tile.amount.toString() });
    case 'multiply':
      return t('game.multiplyLabel', { value: tile.amount.toString() });
    case 'set':
      return t('game.setLabel', { value: tile.amount.toString() });
  }
}

export function GameBoard({
  level,
  state,
  selectedId,
  path,
  focusCells,
  cellSize,
  disabled,
  hidePlayer,
  flashTileId,
  onSelect,
  onClearSelection,
  boardLabel,
  avatarUrl,
}: Props) {
  const { t } = useTranslation();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const objects = activeTiles(level, state);
  const byCell = new Map(objects.map((tile) => [tile.cell, tile]));

  // Navigation is only meaningful while playing — the engine refuses to
  // analyze from a terminal loss, and after a win nothing is
  // interactable anyway.
  const reachable = useMemo(
    () =>
      state.phase === 'playing'
        ? new Set(analyzeReachability(level, state).targetIds)
        : new Set<string>(),
    [level, state]
  );

  const previewTile = objects.find((tile) => tile.id === previewId);
  const previewPath =
    !disabled && previewTile && state.phase === 'playing'
      ? pathToTile(level, state, previewTile)
      : null;
  const pathCells = new Set(path ?? previewPath ?? []);
  const focused = new Set(focusCells ?? []);

  const style = {
    '--columns': level.width,
    '--cell': `${cellSize}px`,
  } as CSSProperties;

  return (
    <div
      className="board"
      style={style}
      role="group"
      aria-label={boardLabel ?? t('game.boardAria', { title: level.title })}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClearSelection();
      }}
    >
      {level.terrain.flatMap((row, y) =>
        [...row].map((terrain, x) => {
          const cell = y * level.width + x;
          const tile = byCell.get(cell);

          if (terrain === '#') {
            return (
              <div key={cell} className="cell cell--wall" aria-hidden="true" />
            );
          }

          if (tile) {
            const canReach = reachable.has(tile.id);
            const isCombat = tile.kind === 'enemy' || tile.kind === 'boss';

            return (
              <button
                key={cell}
                type="button"
                className={[
                  'cell',
                  'tile',
                  `tile--${tile.kind}`,
                  focused.has(cell) ? 'cell--tutorial-focus' : '',
                  pathCells.has(cell) ? 'cell--path' : '',
                  canReach ? '' : 'tile--unreachable',
                  selectedId === tile.id ? 'tile--selected' : '',
                  flashTileId === tile.id ? 'tile--flash' : '',
                ].join(' ')}
                aria-label={[
                  tileAriaName(t, tile, state),
                  t('game.rowColumn', { row: y + 1, column: x + 1 }),
                  canReach ? t('game.reachable') : t('game.blockedTile'),
                ].join(', ')}
                aria-pressed={selectedId === tile.id}
                disabled={disabled}
                title={
                  canReach
                    ? t('ui.targetSteps', {
                        target: tileAriaName(t, tile, state),
                        steps: Math.max(
                          (pathToTile(level, state, tile)?.length ?? 1) - 1,
                          0
                        ),
                      })
                    : t('game.blockedTile')
                }
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') setPreviewId(tile.id);
                }}
                onPointerLeave={() => setPreviewId(null)}
                onFocus={() => setPreviewId(tile.id)}
                onBlur={() => setPreviewId(null)}
                onClick={() => onSelect(tile.id)}
              >
                {tile.kind === 'boss' && (
                  <span aria-hidden="true" className="boss-mark">
                    <CrownIcon className="icon-inline" />
                  </span>
                )}
                {(() => {
                  const interval = windowInterval(tile, state);

                  if (!interval) return null;

                  return (
                    <span aria-hidden="true" className="window-badge">
                      {interval.min === interval.max
                        ? interval.min.toString()
                        : `${interval.min.toString()}–${interval.max.toString()}`}
                    </span>
                  );
                })()}
                {isCombat ? (
                  <NumberLabel value={state.enemies.get(tile.id) ?? 0n} />
                ) : (
                  <span className="number">{tileText(tile, state)}</span>
                )}
              </button>
            );
          }

          const hasPlayer =
            !hidePlayer && state.phase !== 'lost' && state.position === cell;

          return (
            <button
              key={cell}
              type="button"
              disabled={disabled || state.phase !== 'playing'}
              aria-label={t('ui.moveToCell', { row: y + 1, column: x + 1 })}
              onClick={() => onSelect(`walk:${cell}`)}
              className={[
                'cell',
                'cell--floor',
                focused.has(cell) ? 'cell--tutorial-focus' : '',
                pathCells.has(cell) ? 'cell--path' : '',
              ].join(' ')}
            >
              {cell === level.startCell && (
                <span className="start-mark" aria-hidden="true">
                  <HomeIcon className="icon-inline" />
                </span>
              )}

              {hasPlayer && (
                <div
                  className="player"
                  aria-label={t('game.playerValue', {
                    value: state.value.toString(),
                  })}
                >
                  <PlayerToken avatarUrl={avatarUrl} value={state.value} />
                </div>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
