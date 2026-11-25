import { activeTiles, initialState } from './engine';
import type { GameState, Level } from './model';
import { analyzeReachability, positionStateKey } from './reachability';
import { successors } from './transitions';

export type StepsBudget = {
  maxStates: number;
  maxEdges: number;
  maxMs: number;
};

export const STEPS_BUDGET: StepsBudget = {
  maxStates: 3_000_000,
  maxEdges: 20_000_000,
  maxMs: 120_000,
};

type Edge = { tileId: string; weight: number; to: number | null };
type Node = { state: GameState; edges: Edge[] };

export type StepsResult =
  | {
      status: 'certified';
      minimumSteps: number;
      stepOptimalSolution: string[];
      graphStates: number;
      graphEdges: number;
    }
  | { status: 'unsolvable' }
  | { status: 'limit'; reason: 'time' | 'states' | 'edges' };

/**
 * Exact minimum MOVEMENT steps via a position-keyed state graph.
 *
 * The canonical (region-anchored) key is invalid here: movement cost
 * depends on the exact player cell. Each edge is weighted by the BFS
 * distance to the target (recorded by analyzeReachability), and a
 * reverse-order DP yields the step-optimal value and a witness line.
 * Offline certification only — never shipped to the client.
 */
export function certifySteps(
  level: Level,
  budget: StepsBudget = STEPS_BUDGET
): StepsResult {
  const started = Date.now();
  const start = initialState(level);
  const nodes: Node[] = [{ state: start, edges: [] }];
  const ids = new Map<string, number>([[positionStateKey(start), 0]]);
  let edgeCount = 0;

  const rank = (s: GameState): number =>
    activeTiles(level, s).length + s.spareLives;

  for (let head = 0; head < nodes.length; head += 1) {
    if (Date.now() - started >= budget.maxMs)
      return { status: 'limit', reason: 'time' };
    const node = nodes[head];
    if (node.state.phase !== 'playing') continue;

    const reach = analyzeReachability(level, node.state);

    for (const t of successors(level, node.state)) {
      edgeCount += 1;
      if (edgeCount > budget.maxEdges)
        return { status: 'limit', reason: 'edges' };
      const next = t.result.state;
      const weight = reach.targetDistances.get(t.tileId) ?? 0;

      if (next.phase === 'lost') {
        node.edges.push({ tileId: t.tileId, weight, to: null });
        continue;
      }
      if (rank(next) !== rank(node.state) - 1) {
        throw new Error(`${level.id}: non-decreasing transition rank`);
      }

      const key = positionStateKey(next);
      let to = ids.get(key);
      if (to === undefined) {
        if (nodes.length >= budget.maxStates)
          return { status: 'limit', reason: 'states' };
        to = nodes.length;
        ids.set(key, to);
        nodes.push({ state: next, edges: [] });
      }
      node.edges.push({ tileId: t.tileId, weight, to });
    }
  }

  const total = nodes.length;
  const canWin = new Array<boolean>(total).fill(false);
  const minSteps = new Array<number>(total).fill(Number.POSITIVE_INFINITY);

  for (let i = total - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (node.state.phase === 'won') {
      canWin[i] = true;
      minSteps[i] = 0;
      continue;
    }
    if (node.state.phase !== 'playing') continue;

    let winning = false;
    let best = Number.POSITIVE_INFINITY;
    for (const e of node.edges) {
      if (e.to === null || !canWin[e.to]) continue;
      winning = true;
      best = Math.min(best, e.weight + minSteps[e.to]);
    }
    canWin[i] = winning;
    minSteps[i] = best;
  }

  const startIndex = ids.get(positionStateKey(start))!;
  if (!canWin[startIndex]) return { status: 'unsolvable' };

  const minimumSteps = minSteps[startIndex];
  const line: string[] = [];
  let index = startIndex;
  while (nodes[index].state.phase === 'playing') {
    let nextIndex: number | undefined;
    let nextTile: string | undefined;
    for (const e of nodes[index].edges) {
      if (
        e.to !== null &&
        canWin[e.to] &&
        e.weight + minSteps[e.to] === minSteps[index]
      ) {
        nextIndex = e.to;
        nextTile = e.tileId;
        break;
      }
    }
    if (nextIndex === undefined || nextTile === undefined) break;
    line.push(nextTile);
    index = nextIndex;
  }

  return {
    status: 'certified',
    minimumSteps,
    stepOptimalSolution: line,
    graphStates: total,
    graphEdges: edgeCount,
  };
}
