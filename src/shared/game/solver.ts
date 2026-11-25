import { canonicalStateKey } from './reachability';
import { successors } from './transitions';
import type { GameState, Level } from './model';

type SearchNode = {
  state: GameState;
  parent: number;
  action: string | null;
};

/**
 * Analysis-only transition filters. They never change gameplay rules;
 * they remove edges from the search graph so content tooling can ask
 * questions such as "is there a solution that never respawns?".
 */
export type SearchRestrictions = {
  maxRespawnsUsed?: number;
  forbiddenTileIds?: ReadonlySet<string>;
};

export type SolveOptions = {
  /**
   * Merge states whose player positions sit in the same connected floor
   * region. Solutions remain valid because region membership determines
   * exactly which interactions are reachable.
   */
  canonical?: boolean;
  restrictions?: SearchRestrictions;
};

export type SolveResult =
  | {
      status: 'solved';
      optimal: true;
      actions: string[];
      minimumActions: number;
      /** Nodes dequeued and expanded (or skipped) before the answer. */
      explored: number;
      /** Nodes created and stored by the search in total (expanded
       * and unexpanded alike) — NOT the open frontier size. */
      generated: number;
    }
  | { status: 'unsolvable'; explored: number; generated: number }
  | {
      status: 'limit';
      explored: number;
      generated: number;
      reason: 'time' | 'states';
    };

export function stateKey(state: GameState): string {
  const enemies = [...state.enemies.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => `${id}:${value}`)
    .join(',');

  return [
    state.position,
    state.value.toString(),
    state.spareLives,
    state.phase,
    enemies,
    [...state.usedOps].sort().join(','),
  ].join('|');
}

function allowed(
  restrictions: SearchRestrictions | undefined,
  tileId: string
): boolean {
  return !(restrictions?.forbiddenTileIds?.has(tileId) ?? false);
}

function respawnsAllowed(
  restrictions: SearchRestrictions | undefined,
  level: Level,
  successor: GameState
): boolean {
  const max = restrictions?.maxRespawnsUsed;
  if (max === undefined) return true;
  return level.spareLives - successor.spareLives <= max;
}

/**
 * Breadth-first search over game states. A "solved" result is a
 * shortest winning sequence: BFS explores interactions layer by layer,
 * so the first win found uses the minimum number of actions.
 */
export function solve(
  level: Level,
  start: GameState,
  limits: {
    maxStates: number;
    maxMs: number;
  },
  options: SolveOptions = {}
): SolveResult {
  const started = performance.now();
  const restrictions = options.restrictions;

  const keyOf = options.canonical
    ? (state: GameState) => canonicalStateKey(level, state)
    : stateKey;

  const nodes: SearchNode[] = [{ state: start, parent: -1, action: null }];

  const visited = new Set([keyOf(start)]);
  let head = 0;

  function reconstruct(index: number): string[] {
    const actions: string[] = [];

    while (nodes[index].parent !== -1) {
      actions.push(nodes[index].action!);
      index = nodes[index].parent;
    }

    return actions.reverse();
  }

  while (head < nodes.length) {
    if (performance.now() - started >= limits.maxMs) {
      return {
        status: 'limit',
        explored: head,
        generated: nodes.length,
        reason: 'time',
      };
    }

    const index = head++;
    const node = nodes[index];

    if (node.state.phase === 'won') {
      const actions = reconstruct(index);
      return {
        status: 'solved',
        optimal: true,
        actions,
        minimumActions: actions.length,
        explored: head,
        generated: nodes.length,
      };
    }

    if (node.state.phase === 'lost') continue;

    for (const transition of successors(level, node.state)) {
      if (!allowed(restrictions, transition.tileId)) continue;

      const nextState = transition.result.state;

      if (nextState.phase === 'lost') continue;
      if (!respawnsAllowed(restrictions, level, nextState)) continue;

      const key = keyOf(nextState);

      if (visited.has(key)) continue;

      if (nodes.length >= limits.maxStates) {
        return {
          status: 'limit',
          explored: head,
          generated: nodes.length,
          reason: 'states',
        };
      }

      visited.add(key);

      nodes.push({
        state: nextState,
        parent: index,
        action: transition.tileId,
      });
    }
  }

  return { status: 'unsolvable', explored: head, generated: nodes.length };
}
