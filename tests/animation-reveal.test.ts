// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useInteractionAnimation } from '../src/client/presentation/useInteractionAnimation';
import { compileLevel } from '../src/shared/game/level-schema';
import { initialState, interact } from '../src/shared/game/engine';
import { buildTimeline } from '../src/client/presentation/animation-timeline';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('animation reveal callback', () => {
  for (const cancelled of [false, true]) {
    it(
      cancelled
        ? 'suppresses cancelled effects'
        : 'waits for consumption after a long approach',
      () => {
        vi.useFakeTimers();
        const container = document.createElement('div');
        const root = createRoot(container);
        const level = compileLevel({
          formatVersion: 1,
          id: 'sound-test',
          revision: 1,
          title: 'Test',
          width: 5,
          terrain: ['.....', '.....'],
          startCell: 0,
          startValue: '3',
          spareLives: 0,
          tiles: [
            { id: 'enemy', kind: 'enemy', cell: 4, value: '2' },
            { id: 'boss', kind: 'boss', cell: 9, value: '20' },
          ],
        });
        const state = initialState(level);
        const result = interact(level, state, 'enemy');
        if (!result.ok) throw new Error('Fixture must allow absorption');
        const successfulResult = result;
        const reveal = vi.fn();
        function Harness() {
          const animation = useInteractionAnimation({
            reducedMotion: false,
            onSettled: () => {},
          });
          return createElement('button', {
            onClick: () => {
              animation.start(successfulResult, level, state, reveal);
              if (cancelled) animation.cancel();
            },
          });
        }
        try {
          act(() => root.render(createElement(Harness)));
          act(() => container.querySelector('button')!.click());
          const effectTime = buildTimeline(
            result.path,
            result.event,
            level.startCell
          ).frames.find((frame) => frame.phase === 'effect')!.atMs;
          act(() => vi.advanceTimersByTime(effectTime - 1));
          expect(reveal).not.toHaveBeenCalled();
          act(() => vi.advanceTimersByTime(1));
          expect(reveal).toHaveBeenCalledTimes(cancelled ? 0 : 1);
          act(() => vi.runAllTimers());
          expect(reveal).toHaveBeenCalledTimes(cancelled ? 0 : 1);
        } finally {
          act(() => root.unmount());
          vi.useRealTimers();
        }
      }
    );
  }
});
