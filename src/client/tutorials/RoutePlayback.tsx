import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { initialState, interact } from '../../shared/game/engine';
import type { Level } from '../../shared/game/model';
import { BoardStage } from '../components/BoardStage';
import { PlayerStatus } from '../components/PlayerStatus';
import { useMediaQuery } from '../app/useMediaQuery';
import { useInteractionAnimation } from '../presentation/useInteractionAnimation';

export function RoutePlayback({
  level,
  solution,
  avatarUrl,
  boardLabel,
  compact = false,
  finishedContent,
}: {
  level: Level;
  solution: readonly string[];
  avatarUrl: string | null;
  boardLabel?: string;
  compact?: boolean;
  finishedContent?: ReactNode;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState(() => initialState(level));
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(true);
  const [paused, setPaused] = useState(false);
  const playbackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animation = useInteractionAnimation({
    reducedMotion,
    paused,
    onSettled: () => setReady(true),
  });
  const { start } = animation;

  useEffect(() => {
    if (!paused) return;
    const animations =
      playbackRef.current?.getAnimations({ subtree: true }) ?? [];
    for (const item of animations) item.pause();
    return () => {
      for (const item of animations) item.play();
    };
  }, [paused]);

  useEffect(() => {
    const resume = () => {
      if (!document.hidden) setReady(true);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, []);

  useEffect(() => {
    const action = solution[index];
    if (!ready || !action || paused) return;
    const timer = window.setTimeout(
      () => {
        const result = interact(level, state, action);
        if (!result.ok) return;
        setReady(false);
        setState(result.state);
        setIndex((value) => value + 1);
        start(result, level, state);
      },
      reducedMotion ? 1000 : 500
    );
    return () => clearTimeout(timer);
  }, [index, level, ready, reducedMotion, solution, start, state, paused]);

  const finished = index === solution.length && ready;

  return (
    <div
      className={`tutorial-route-playback${compact ? ' tutorial-route-playback--compact' : ''}`}
      ref={playbackRef}
    >
      <div className="tutorial-playback-rail">
        <PlayerStatus level={level} state={state} />
        <div className="tutorial-route-controls">
          <button
            type="button"
            className="toolbar-button"
            disabled={finished}
            title={t(paused ? 'tutorial.play' : 'tutorial.pause')}
            aria-label={t(paused ? 'tutorial.play' : 'tutorial.pause')}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <Play /> : <Pause />}
            {!compact && t(paused ? 'tutorial.play' : 'tutorial.pause')}
          </button>
          <button
            type="button"
            className="toolbar-button"
            title={t('tutorial.replay')}
            aria-label={t('tutorial.replay')}
            onClick={() => {
              animation.cancel();
              setState(initialState(level));
              setIndex(0);
              setReady(true);
              setPaused(false);
            }}
          >
            <RotateCcw />
            {!compact && t('tutorial.replay')}
          </button>
        </div>
      </div>
      <BoardStage
        level={level}
        present={state}
        presentation={animation.presentation}
        selectedId={null}
        selectionPath={null}
        disabled
        flashTileId={animation.flashTileId}
        onSelect={() => {}}
        onClearSelection={() => {}}
        boardLabel={boardLabel ?? t('tutorial.expectedRoute')}
        avatarUrl={avatarUrl}
      />
      <p className="tutorial-steps" role="status">
        {finished
          ? t('tutorial.complete')
          : t('tutorial.progress', { current: index, total: solution.length })}
      </p>
      {finished && finishedContent && (
        <div className="tutorial-finished-action">{finishedContent}</div>
      )}
    </div>
  );
}
