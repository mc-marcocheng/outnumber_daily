import { interactAssumingReachable } from './engine';
import { analyzeReachability } from './reachability';
import type { GameState, InteractionResult, Level } from './model';

export type Transition = {
  tileId: string;
  result: Extract<InteractionResult, { ok: true }>;
};

/**
 * Enumerate every legal interaction from `state` using one flood fill
 * instead of one BFS per object. The combat/arithmetic transition is
 * still produced by the real engine, so solver and gameplay can never
 * diverge.
 */
export function successors(level: Level, state: GameState): Transition[] {
  if (state.phase !== 'playing') return [];

  const { targetIds } = analyzeReachability(level, state);
  const out: Transition[] = [];

  for (const tileId of targetIds) {
    const result = interactAssumingReachable(level, state, tileId);
    if (result.ok) out.push({ tileId, result });
  }

  return out;
}
