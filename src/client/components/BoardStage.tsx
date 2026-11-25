import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Cell, GameState, Level } from '../../shared/game/model';
import type { Presentation } from '../presentation/useInteractionAnimation';
import { GameBoard } from './GameBoard';
import { PlayerToken } from './PlayerToken';

type Props = {
  level: Level;
  /** The committed current state (ignored while a presentation runs). */
  present: GameState;
  presentation: Presentation | null;
  selectedId: string | null;
  selectionPath: readonly Cell[] | null;
  focusCells?: readonly Cell[];
  disabled: boolean;
  flashTileId: string | null;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  /** Optional localized board name; the default preserves game naming. */
  boardLabel?: string;
  /** The player's snoovatar; falls back to a numbered token when null. */
  avatarUrl: string | null;
};

/**
 * The shared board stage: ResizeObserver-based cell fitting, the
 * frozen/display-state projection during an interaction presentation,
 * overlay positioning, and board rendering. Used by the game screen
 * and the rules demos so both behave identically.
 */
export function BoardStage({
  level,
  present,
  presentation,
  selectedId,
  selectionPath,
  focusCells,
  disabled,
  flashTileId,
  onSelect,
  onClearSelection,
  boardLabel,
  avatarUrl,
}: Props) {
  const [cellSize, setCellSize] = useState(48);
  const viewportRef = useRef<HTMLDivElement>(null);

  const fitBoard = useCallback(() => {
    const element = viewportRef.current;

    if (!element) return;

    const rect = element.getBoundingClientRect();
    const availableWidth = rect.width - 24;
    const availableHeight = rect.height - 24;
    const maxCellSize =
      Number.parseFloat(
        getComputedStyle(element).getPropertyValue('--board-max-cell')
      ) || 112;
    const fit = Math.floor(
      Math.min(
        availableWidth / level.width,
        availableHeight / level.terrain.length,
        maxCellSize
      )
    );

    const minimum = Math.min(
      44,
      Math.floor(availableWidth / level.width),
      Math.floor(availableHeight / level.terrain.length)
    );
    setCellSize(Math.max(28, minimum, fit));
  }, [level]);

  useEffect(() => {
    fitBoard();

    const element = viewportRef.current;

    if (!element) return;

    const observer = new ResizeObserver(fitBoard);
    observer.observe(element);

    return () => observer.disconnect();
  }, [fitBoard]);

  // Frozen/display state projection: while a presentation runs, show
  // the frozen pre-interaction state until the final reveal, then the
  // committed enemy map.
  const displayState = (() => {
    const current = presentation;

    if (!current) return present;

    if (current.frame?.revealed) {
      const enemies = new Map(current.frozen.enemies);

      if (current.event.enemyAfter !== undefined) {
        enemies.set(current.event.tileId, current.event.enemyAfter);
      } else {
        enemies.delete(current.event.tileId);
      }

      return { ...current.frozen, enemies };
    }

    return current.frozen;
  })();

  const animating = presentation !== null;
  const frame = presentation?.frame ?? null;

  const overlayX = frame !== null ? (frame.cell % level.width) * cellSize : 0;
  const overlayY =
    frame !== null ? Math.floor(frame.cell / level.width) * cellSize : 0;
  const juiceClass =
    frame !== null && frame.revealed && frame.juice
      ? `player-overlay--juice-${frame.juice}`
      : '';

  return (
    <div className="board-viewport" ref={viewportRef}>
      <div
        className="board-wrap"
        style={
          {
            '--columns': level.width,
            '--cell': `${cellSize}px`,
          } as CSSProperties
        }
      >
        <GameBoard
          focusCells={focusCells}
          level={level}
          state={displayState}
          selectedId={presentation ? presentation.event.tileId : selectedId}
          path={presentation ? null : selectionPath}
          cellSize={cellSize}
          disabled={disabled || animating}
          hidePlayer={animating}
          flashTileId={flashTileId}
          onSelect={onSelect}
          onClearSelection={onClearSelection}
          boardLabel={boardLabel}
          avatarUrl={avatarUrl}
        />
        {frame !== null && (
          <div
            className={[
              'player-overlay',
              'number',
              frame.showPlayer ? '' : 'player-overlay--hidden',
              juiceClass,
            ].join(' ')}
            style={{
              left: overlayX,
              top: overlayY,
              width: cellSize,
              height: cellSize,
              transitionDuration: `${Math.max(frame.stepMs, 40)}ms`,
            }}
          >
            <PlayerToken avatarUrl={avatarUrl} value={frame.playerValue} />
          </div>
        )}
      </div>
    </div>
  );
}
