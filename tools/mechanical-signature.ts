import { createHash } from 'node:crypto';
import type { ExactGraph } from '../src/shared/game/analysis-graph';
import { initialState, interact } from '../src/shared/game/engine';
import { compileLevel, type RawLevel } from '../src/shared/game/level-schema';
import type { Level } from '../src/shared/game/model';

/** Tile roles along a winning route, for example `add,enemy:bank,boss`. Used to compare route shapes. */
export function roleSequence(
  raw: RawLevel,
  actions: readonly string[]
): string {
  const level = compileLevel(raw);
  let state = initialState(level);
  const roles: string[] = [];
  for (const tileId of actions) {
    const tile = raw.tiles.find((candidate) => candidate.id === tileId);
    const result = interact(level, state, tileId);
    if (!tile || !result.ok)
      throw new Error(`Invalid witness ${raw.id}: ${tileId}`);
    roles.push(
      tile.kind +
        (tile.kind === 'enemy' && tile.maxSurplus !== undefined
          ? ':window'
          : '') +
        (result.state.spareLives < state.spareLives ? ':bank' : '')
    );
    state = result.state;
  }
  if (state.phase !== 'won') throw new Error(`Incomplete witness ${raw.id}`);
  return roles.join(',');
}

export function provesWinningDependencies(
  graph: ExactGraph,
  dependencies: readonly (readonly string[])[]
): boolean {
  const canWin = new Array<boolean>(graph.nodes.length).fill(false);
  for (let index = graph.nodes.length - 1; index >= 0; index -= 1) {
    const node = graph.nodes[index]!;
    canWin[index] =
      node.state.phase === 'won' ||
      node.edges.some((edge) => edge.to !== null && canWin[edge.to]);
  }
  if (!canWin[0]) return false;
  for (const dependency of dependencies) {
    if (dependency.length !== 2 || dependency[0] === dependency[1])
      return false;
    const [before, after] = dependency;
    const reachable = new Set([0]);
    for (let index = 0; index < graph.nodes.length; index += 1) {
      if (!reachable.has(index)) continue;
      for (const edge of graph.nodes[index]!.edges) {
        if (edge.to === null || !canWin[edge.to]) continue;
        if (edge.tileId === after) return false;
        if (edge.tileId !== before) reachable.add(edge.to);
      }
    }
  }
  return true;
}

export function mechanicalSignature(level: Level, graph: ExactGraph): string {
  const roles = new Map(
    level.tiles.map((tile) => [
      tile.id,
      tile.kind === 'enemy' && tile.maxSurplus !== undefined
        ? 'window'
        : tile.kind,
    ])
  );
  const signatures: string[] = [];
  for (let index = graph.nodes.length - 1; index >= 0; index -= 1) {
    const node = graph.nodes[index]!;
    const choices = [
      ...new Set(
        node.edges.map((edge) =>
          JSON.stringify([
            roles.get(edge.tileId),
            edge.event.kind,
            edge.to === null ? 'lost' : signatures[edge.to],
          ])
        )
      ),
    ].sort();
    signatures[index] = createHash('sha256')
      .update(JSON.stringify([node.state.phase, choices]))
      .digest('hex');
  }
  if (!signatures[0]) throw new Error('Cannot sign an empty graph');
  return `mechanical:${signatures[0]}`;
}

export function roleDistance(first: string, second: string): number {
  const left = first.split(',');
  const right = second.split(',');
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        previous[column]! + 1,
        current[column - 1]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

export type MechanicalIdentity = {
  mechanical: string;
  sequence: string;
  stepSequence: string;
};

export function mechanicalDuplicate(
  rows: readonly MechanicalIdentity[],
  candidate: MechanicalIdentity
): string | undefined {
  for (const row of rows) {
    if (row.mechanical === candidate.mechanical) return 'causal graph';
    if (
      roleDistance(row.sequence, candidate.sequence) <= 2 ||
      roleDistance(row.stepSequence, candidate.stepSequence) <= 2
    )
      return 'near role sequence';
  }
  return undefined;
}
