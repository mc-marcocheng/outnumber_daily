import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GameState,
  InteractionEvent,
  InteractionResult,
  Level,
} from '../../shared/game/model';
import { buildTimeline, type PresentationFrame } from './animation-timeline';

export type Presentation = {
  gen: number;
  event: InteractionEvent;
  frozen: GameState;
  frame: PresentationFrame | null;
};

type Options = {
  paused?: boolean;
  /**
   * When motion is reduced there is no timeline: the committed state is
   * revealed immediately and the target tile gets a brief static flash.
   */
  reducedMotion: boolean;
  /** Called once per committed interaction, when it becomes visible. */
  onSettled: (event: InteractionEvent) => void;
};

/**
 * Owns the whole interaction-presentation lifecycle: the frozen-state
 * animation timeline, its timers, the reduced-motion flash, and the
 * "reveal everything on backgrounding" rule. Input is busy while a
 * timeline is running; every scheduled frame is generation-guarded so a
 * cancel (undo, restart, hide, unmount) supersedes in-flight work.
 */
export function useInteractionAnimation(options: Options) {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [flashTileId, setFlashTileId] = useState<string | null>(null);

  const busyRef = useRef(false);
  const genRef = useRef(0);
  const timersRef = useRef<
    Array<{
      id: number;
      remaining: number;
      started: number;
      run: () => void;
    }>
  >([]);
  const flashTimerRef = useRef<number | null>(null);

  const settledRef = useRef(options.onSettled);
  const reducedRef = useRef(options.reducedMotion);

  useEffect(() => {
    settledRef.current = options.onSettled;
    reducedRef.current = options.reducedMotion;
  });

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer.id);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    const now = performance.now();
    timersRef.current = timersRef.current.map((timer) => {
      if (options.paused) {
        clearTimeout(timer.id);
        return {
          ...timer,
          remaining: Math.max(0, timer.remaining - (now - timer.started)),
        };
      }
      return {
        ...timer,
        started: now,
        id: window.setTimeout(timer.run, timer.remaining),
      };
    });
  }, [options.paused]);

  /** Block input while an async commit is in flight. */
  const markBusy = useCallback(() => {
    busyRef.current = true;
  }, []);

  /** Cancel any scheduled presentation and release input. */
  const cancel = useCallback(() => {
    genRef.current += 1;
    clearTimers();
    setPresentation(null);
    busyRef.current = false;
  }, [clearTimers]);

  // Backgrounding must reveal the committed state and release input.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) cancel();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [cancel]);

  // Unmount (and, via the caller's key, level change): release timers.
  useEffect(() => {
    return () => {
      genRef.current += 1;
      clearTimers();
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, [clearTimers]);

  const flash = useCallback((tileId: string) => {
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    setFlashTileId(tileId);
    flashTimerRef.current = window.setTimeout(() => {
      setFlashTileId(null);
      flashTimerRef.current = null;
    }, 450);
  }, []);

  /**
   * Begin presenting a committed interaction. `preState` is the state
   * the interaction was made from; it stays on screen while the
   * timeline plays. Returns false when the reduced-motion path resolved
   * the interaction synchronously.
   */
  const start = useCallback(
    (
      result: Extract<InteractionResult, { ok: true }>,
      level: Level,
      preState: GameState,
      onReveal?: () => void
    ): boolean => {
      if (reducedRef.current) {
        onReveal?.();
        busyRef.current = false;
        settledRef.current(result.event);
        flash(result.event.tileId);
        return false;
      }

      const gen = ++genRef.current;
      const plan = buildTimeline(result.path, result.event, level.startCell);

      setPresentation({
        gen,
        event: result.event,
        frozen: preState,
        frame: plan.frames[0] ?? null,
      });

      // The whole timeline is built up front; every frame is scheduled
      // relative to the same start.
      const schedule = (delay: number, fn: () => void) => {
        const timer = {
          id: 0,
          remaining: delay,
          started: performance.now(),
          run: () => {
            timersRef.current = timersRef.current.filter(
              (item) => item.run !== timer.run
            );
            if (genRef.current !== gen) return;
            fn();
          },
        };
        timer.id = window.setTimeout(timer.run, delay);
        timersRef.current.push(timer);
      };

      for (const frame of plan.frames) {
        schedule(frame.atMs, () => {
          if (
            frame.phase === 'effect' ||
            (result.event.kind === 'walk' && frame.phase === 'finish')
          )
            onReveal?.();
          setPresentation((current) =>
            current && current.gen === gen ? { ...current, frame } : current
          );
        });
      }

      schedule(plan.totalMs, () => {
        genRef.current += 1;
        clearTimers();
        setPresentation(null);
        busyRef.current = false;
        settledRef.current(result.event);
      });

      return true;
    },
    [clearTimers, flash]
  );

  return {
    presentation,
    flashTileId,
    busyRef,
    animating: presentation !== null,
    markBusy,
    start,
    cancel,
  };
}
