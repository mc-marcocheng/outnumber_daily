import { activeTiles, initialState } from './engine';
import type { GameState, InteractionEvent, Level } from './model';
import { canonicalStateKey } from './reachability';
import { successors } from './transitions';

/**
 * One exact state graph per level, built once by breadth-first search.
 *
 * Every successful interaction consumes exactly one operation tile or
 * one spare life, so `activeTiles + spareLives` strictly decreases and
 * the graph is acyclic; BFS order plus the strictly decreasing rank
 * makes reverse node order a valid dynamic-programming order.
 *
 * Terminal losses are stored as edges (`to: null`), not expandable
 * nodes. A graph limit aborts the entire analysis — no partial
 * metrics are ever produced from an incomplete graph.
 */

export type GraphEdge = Readonly<{
  tileId: string;
  event: InteractionEvent;
  to: number | null;
}>;

export type GraphNode = {
  state: GameState;
  depth: number;
  edges: GraphEdge[];
};

export type ExactGraph = Readonly<{
  nodes: readonly GraphNode[];
  edgeCount: number;
}>;

export type GraphBudget = {
  maxStates: number;
  maxEdges: number;
  maxMs: number;
};

export type GraphResult =
  | Readonly<{ status: 'complete'; graph: ExactGraph }>
  | Readonly<{
      status: 'limit';
      reason: 'time' | 'states' | 'edges';
    }>;

export function buildExactGraph(
  level: Level,
  budget: GraphBudget
): GraphResult {
  const started = performance.now();
  const start = initialState(level);
  const nodes: GraphNode[] = [{ state: start, depth: 0, edges: [] }];
  const ids = new Map<string, number>([[canonicalStateKey(level, start), 0]]);

  let edgeCount = 0;

  const rank = (state: GameState): number =>
    activeTiles(level, state).length + state.spareLives;

  for (let head = 0; head < nodes.length; head += 1) {
    if (performance.now() - started >= budget.maxMs) {
      return { status: 'limit', reason: 'time' };
    }

    const node = nodes[head];

    if (node.state.phase !== 'playing') continue;

    for (const transition of successors(level, node.state)) {
      edgeCount += 1;

      if (edgeCount > budget.maxEdges) {
        return { status: 'limit', reason: 'edges' };
      }

      const next = transition.result.state;

      if (next.phase === 'lost') {
        node.edges.push({
          tileId: transition.tileId,
          event: transition.result.event,
          to: null,
        });
        continue;
      }

      if (rank(next) !== rank(node.state) - 1) {
        throw new Error(`${level.id}: non-decreasing transition rank`);
      }

      const key = canonicalStateKey(level, next);
      let to = ids.get(key);

      if (to === undefined) {
        if (nodes.length >= budget.maxStates) {
          return { status: 'limit', reason: 'states' };
        }

        to = nodes.length;
        ids.set(key, to);
        nodes.push({
          state: next,
          depth: node.depth + 1,
          edges: [],
        });
      } else if (nodes[to].depth !== node.depth + 1) {
        throw new Error(`${level.id}: inconsistent canonical depth`);
      }

      node.edges.push({
        tileId: transition.tileId,
        event: transition.result.event,
        to,
      });
    }
  }

  return {
    status: 'complete',
    graph: { nodes, edgeCount },
  };
}
