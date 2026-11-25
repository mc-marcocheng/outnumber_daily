import { activeTiles, isFloor, neighbors } from './engine';
import type { Cell, GameState, Level } from './model';

export type Reachability = {
  /**
   * The smallest floor cell in the connected empty-floor region that
   * contains the player. Positions inside the same region are
   * interchangeable, so this anchors the canonical solver key.
   */
  anchor: Cell;
  floorCells: ReadonlySet<Cell>;
  targetIds: readonly string[];
  /**
   * Movement steps from the player to each bordering target: the BFS
   * distance to the nearest adjacent floor cell, plus one to step onto
   * the target. Used by the step-optimal certifier (the engine's
   * reachability-assuming interaction carries no path).
   */
  targetDistances: ReadonlyMap<string, number>;
};

/**
 * Flood-fill the empty floor once and collect every active object that
 * borders the region. Equivalent to asking `pathToTile` for each object,
 * but a single traversal instead of one BFS per interaction.
 *
 * Results are memoized per (level object, state object) pair: states
 * are freshly allocated and never mutated, and levels are compiled once
 * per revision, so each pair is analyzed exactly once even when the
 * solver, the canonical key, and the UI all ask for it. Keying by level
 * identity — not by level id — keeps two revisions or two generated
 * candidates that share an id from reading each other's geometry.
 */
const reachabilityCache = new WeakMap<
  Level,
  WeakMap<GameState, Reachability>
>();

export function analyzeReachability(
  level: Level,
  state: GameState
): Reachability {
  let states = reachabilityCache.get(level);

  if (!states) {
    states = new WeakMap<GameState, Reachability>();
    reachabilityCache.set(level, states);
  }

  const hit = states.get(state);
  if (hit) return hit;

  const value = computeReachability(level, state);
  states.set(state, value);
  return value;
}

function computeReachability(level: Level, state: GameState): Reachability {
  if (state.phase === 'lost') {
    throw new Error('Do not analyze navigation from a terminal loss');
  }

  const objects = activeTiles(level, state);
  const occupied = new Map(objects.map((tile) => [tile.cell, tile.id]));

  const seen = new Set<Cell>([state.position]);
  const dist = new Map<Cell, number>([[state.position, 0]]);
  const targets = new Set<string>();
  const targetDistances = new Map<string, number>();
  const queue: Cell[] = [state.position];

  let head = 0;
  let anchor = state.position;

  while (head < queue.length) {
    const cell = queue[head++];
    if (cell < anchor) anchor = cell;
    const here = dist.get(cell)!;

    for (const next of neighbors(level, cell)) {
      if (!isFloor(level, next)) continue;

      const targetId = occupied.get(next);

      if (targetId !== undefined) {
        targets.add(targetId);
        const d = here + 1;
        const prev = targetDistances.get(targetId);
        if (prev === undefined || d < prev) targetDistances.set(targetId, d);
        continue;
      }

      if (seen.has(next)) continue;

      seen.add(next);
      dist.set(next, here + 1);
      queue.push(next);
    }
  }

  return {
    anchor,
    floorCells: seen,
    targetIds: [...targets].sort(),
    targetDistances,
  };
}

/**
 * A position-insensitive solver key: two states that agree on value,
 * lives, phase, enemy values, and used operations — and whose player
 * stands in the same connected floor region — expose exactly the same
 * set of interactions.
 */
export function canonicalStateKey(level: Level, state: GameState): string {
  const anchor =
    state.phase === 'lost'
      ? state.position
      : analyzeReachability(level, state).anchor;

  return stateKeyWithPosition(state, anchor);
}

/**
 * A position-SENSITIVE key for step-optimal search. Unlike the canonical
 * key, the exact player cell matters: the movement cost to a target
 * depends on where the player stands, so two states in the same floor
 * region are NOT interchangeable when counting steps.
 */
export function positionStateKey(state: GameState): string {
  return stateKeyWithPosition(state, state.position);
}

function stateKeyWithPosition(state: GameState, position: Cell): string {
  const enemies = [...state.enemies.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, value]) => `${id}:${value}`)
    .join(',');

  return [
    position,
    state.value.toString(),
    state.spareLives,
    state.phase,
    enemies,
    [...state.usedOps].sort().join(','),
  ].join('|');
}
