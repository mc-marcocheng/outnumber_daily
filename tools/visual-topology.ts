import { createHash } from 'node:crypto';
import type { RawLevel } from '../src/shared/game/level-schema';
import { mechanicalDuplicate, roleDistance } from './mechanical-signature';

type Graph = { labels: string[]; edges: number[][] };

function fingerprint(graph: Graph): string {
  let colors = graph.labels.map((label) =>
    createHash('sha256').update(label).digest('hex')
  );
  for (let round = 0; round < graph.labels.length; round += 1) {
    colors = colors.map((color, index) =>
      createHash('sha256')
        .update(
          JSON.stringify([
            color,
            graph.edges[index]!.map((neighbor) => colors[neighbor]).sort(),
          ])
        )
        .digest('hex')
    );
  }
  return createHash('sha256')
    .update(JSON.stringify(colors.sort()))
    .digest('hex');
}

export function visualTopology(raw: RawLevel): {
  topology: string;
  access: string;
} {
  const floor = raw.terrain.flatMap((row, rowIndex) =>
    [...row].flatMap((cell, column) =>
      cell === '.' ? [rowIndex * raw.width + column] : []
    )
  );
  const floorSet = new Set(floor);
  const neighbors = (cell: number) =>
    [
      cell - raw.width,
      cell + raw.width,
      ...(cell % raw.width > 0 ? [cell - 1] : []),
      ...(cell % raw.width < raw.width - 1 ? [cell + 1] : []),
    ].filter((next) => floorSet.has(next));
  const boss = raw.tiles.find((tile) => tile.kind === 'boss')!.cell;
  const label = (cell: number) =>
    cell === raw.startCell ? 'start' : cell === boss ? 'boss' : 'node';
  const anchors = floor.filter((cell) => neighbors(cell).length !== 2);
  const visitedFloor = new Set<number>();
  for (const cell of floor) {
    if (visitedFloor.has(cell)) continue;
    const component = [cell];
    visitedFloor.add(cell);
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const next of neighbors(component[cursor]!)) {
        if (!visitedFloor.has(next)) {
          visitedFloor.add(next);
          component.push(next);
        }
      }
    }
    if (!component.some((member) => anchors.includes(member)))
      anchors.push(cell);
  }
  const anchorSet = new Set(anchors);
  const topology: Graph = {
    labels: anchors.map(() => 'node'),
    edges: anchors.map(() => []),
  };
  for (const [index, cell] of anchors.entries()) {
    for (const neighbor of neighbors(cell)) {
      let previous = cell;
      let current = neighbor;
      const visited = new Set([cell]);
      while (!anchorSet.has(current) && !visited.has(current)) {
        visited.add(current);
        const next = neighbors(current).find((next) => next !== previous)!;
        previous = current;
        current = next;
      }
      const destination = anchors.indexOf(current);
      if (destination >= 0) topology.edges[index]!.push(destination);
    }
  }
  const terminals = [raw.startCell, ...raw.tiles.map((tile) => tile.cell)];
  const terminalSet = new Set(terminals);
  const access: Graph = {
    labels: terminals.map(label),
    edges: terminals.map(() => []),
  };
  for (const [index, cell] of terminals.entries()) {
    const visited = new Set([cell]);
    const queue = [...neighbors(cell)];
    const adjacent = new Set<number>();
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const next = queue[cursor]!;
      if (visited.has(next)) continue;
      visited.add(next);
      if (terminalSet.has(next)) adjacent.add(terminals.indexOf(next));
      else queue.push(...neighbors(next));
    }
    access.edges[index] = [...adjacent];
  }
  return {
    topology: `topology:${fingerprint(topology)}`,
    access: `access:${fingerprint(access)}`,
  };
}

export function visualDuplicate(
  rows: readonly RawLevel[],
  candidate: RawLevel
): string | undefined {
  const identity = visualTopology(candidate);
  for (const row of rows) {
    const previous = visualTopology(row);
    if (previous.topology === identity.topology)
      return 'shared terrain topology';
    if (previous.access === identity.access) return 'shared tile access';
  }
  return undefined;
}

export function visualAdmissionIndex(rows: readonly RawLevel[]) {
  const topologies = new Set<string>();
  const accessGraphs = new Set<string>();
  const add = (raw: RawLevel) => {
    const identity = visualTopology(raw);
    topologies.add(identity.topology);
    accessGraphs.add(identity.access);
  };
  for (const raw of rows) add(raw);
  return {
    add,
    accepts: (raw: RawLevel): boolean => {
      const identity = visualTopology(raw);
      return (
        !topologies.has(identity.topology) && !accessGraphs.has(identity.access)
      );
    },
  };
}

export function auditVisualTopology(
  rows: readonly {
    raw: RawLevel;
    tier: string;
    mechanical: string;
    sequence: string;
    stepSequence: string;
  }[]
) {
  const identities = rows.map((row) => ({
    id: row.raw.id,
    tier: row.tier,
    ...visualTopology(row.raw),
  }));
  const groups = (key: 'topology' | 'access') => {
    const grouped = new Map<string, string[]>();
    for (const row of identities)
      grouped.set(row[key], [...(grouped.get(row[key]) ?? []), row.id]);
    return [...grouped.values()].sort(
      (first, second) => second.length - first.length
    );
  };
  const retained: (typeof rows)[number][] = [];
  let minimumActionRoleDistance: number | null = null;
  let minimumStepRoleDistance: number | null = null;
  for (const [index, row] of rows.entries()) {
    for (const previous of rows.slice(0, index)) {
      const actionDistance = roleDistance(previous.sequence, row.sequence);
      const stepDistance = roleDistance(
        previous.stepSequence,
        row.stepSequence
      );
      minimumActionRoleDistance = Math.min(
        minimumActionRoleDistance ?? Infinity,
        actionDistance
      );
      minimumStepRoleDistance = Math.min(
        minimumStepRoleDistance ?? Infinity,
        stepDistance
      );
    }
    if (
      !visualDuplicate(
        retained.map((previous) => previous.raw),
        row.raw
      ) &&
      !mechanicalDuplicate(retained, row)
    )
      retained.push(row);
  }
  return {
    rows: rows.length,
    terrainTopologies: groups('topology').length,
    tileAccessGraphs: groups('access').length,
    causalSignatures: new Set(rows.map((row) => row.mechanical)).size,
    roleSequences: new Set(rows.map((row) => row.sequence)).size,
    stepRoleSequences: new Set(rows.map((row) => row.stepSequence)).size,
    minimumActionRoleDistance,
    minimumStepRoleDistance,
    qualifyingVisualMechanical: retained.length,
    qualifyingIds: retained.map((row) => row.raw.id),
    qualifyingCounts: Object.fromEntries(
      ['advanced', 'expert', 'master'].map((tier) => [
        tier,
        retained.filter((row) => row.tier === tier).length,
      ])
    ),
    maximumWidth: Math.max(0, ...rows.map((row) => row.raw.width)),
    maximumHeight: Math.max(0, ...rows.map((row) => row.raw.terrain.length)),
    topologyGroups: groups('topology'),
    accessGroups: groups('access'),
    identities,
  };
}
