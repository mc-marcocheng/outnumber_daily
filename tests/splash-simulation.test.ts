import { describe, expect, it } from 'vitest';
import {
  createSplashBoard,
  nextSplashEncounter,
  puzzleTimeRemaining,
  SPLASH_BOARD_SIZE,
} from '../src/client/splash-simulation';

describe('splash simulation', () => {
  it('uses a bounded board and survives all sampled encounters without returning home', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const board = createSplashBoard(random);
    expect(board.level.width).toBe(SPLASH_BOARD_SIZE);
    expect(board.level.tiles.length).toBeLessThan(2601);
    let state = board.state;
    for (let turn = 0; turn < 30; turn++) {
      const next = nextSplashEncounter(board.level, state, random);
      expect(next).not.toBeNull();
      if (!next) return;
      expect(next.event.kind).toBe('absorb');
      expect(next.state.position).not.toBe(state.position);
      expect(next.state.phase).toBe('playing');
      expect(next.state.enemies.size).toBe(state.enemies.size - 1);
      state = next.state;
    }
  });
  it('reports exhaustion so the renderer can reset', () => {
    const board = createSplashBoard(() => 0.99);
    expect(nextSplashEncounter(board.level, board.state)).toBeNull();
  });
  it('uses the puzzle UTC deadline, not the browser timezone or current day', () => {
    expect(
      puzzleTimeRemaining('2026-11-14', Date.parse('2026-11-14T12:34:56Z'))
    ).toBe('11:25:04');
    expect(
      puzzleTimeRemaining('2026-11-14', Date.parse('2026-11-15T00:00:00Z'))
    ).toBe('Time is up');
    expect(puzzleTimeRemaining('invalid', Date.now())).toBe('--:--:--');
  });
});
