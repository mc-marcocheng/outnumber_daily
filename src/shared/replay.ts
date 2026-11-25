import { initialState, interact } from './game/engine';
import type { GameState, Level } from './game/model';

export type ReplayResult = {
  state: GameState;
  steps: number;
};

/**
 * Replay an action log through the real engine, summing movement steps
 * (path length minus the starting cell). Throws on an invalid log —
 * the server never trusts a client-supplied state or step count.
 */
export function replayWithSteps(
  level: Level,
  actions: readonly string[]
): ReplayResult {
  let state = initialState(level);
  let steps = 0;
  for (const tileId of actions) {
    const result = interact(level, state, tileId);
    if (!result.ok) {
      throw new Error(`Invalid action log at "${tileId}": ${result.reason}`);
    }
    steps += Math.max(result.path.length - 1, 0);
    state = result.state;
  }
  return { state, steps };
}
