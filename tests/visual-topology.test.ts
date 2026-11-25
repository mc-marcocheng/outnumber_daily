import { describe, expect, it } from 'vitest';
import type { RawLevel } from '../src/shared/game/level-schema';
import {
  auditVisualTopology,
  visualDuplicate,
  visualTopology,
} from '../tools/visual-topology';

function corridor(width: number): RawLevel {
  return {
    formatVersion: 1,
    id: 'visual-test',
    revision: 1,
    title: 'Test',
    width,
    terrain: ['.'.repeat(width)],
    startCell: 0,
    startValue: '2',
    spareLives: 0,
    tiles: [
      { id: 'resource', kind: 'add', amount: '3', cell: 1 },
      { id: 'boss', kind: 'boss', value: '4', cell: width - 1 },
    ],
  };
}

describe('visual topology admission', () => {
  it('collapses corridor stretching, identifiers, arithmetic and role changes', () => {
    const changed = corridor(7);
    changed.tiles[0] = {
      id: 'renamed',
      kind: 'multiply',
      amount: '2',
      cell: 3,
    };
    expect(visualTopology(corridor(4))).toEqual(visualTopology(changed));
    expect(visualDuplicate([corridor(4)], changed)).toBe(
      'shared terrain topology'
    );
  });
  it('distinguishes a branch from a corridor', () => {
    const branched = { ...corridor(3), terrain: ['...', '#.#'] };
    expect(visualTopology(branched).topology).not.toBe(
      visualTopology(corridor(3)).topology
    );
  });
  it('ignores reflection and tile array order', () => {
    const reflected = corridor(4);
    reflected.startCell = 3;
    reflected.tiles = reflected.tiles
      .map((tile) => ({ ...tile, cell: 3 - tile.cell }))
      .reverse();
    expect(visualTopology(reflected)).toEqual(visualTopology(corridor(4)));
  });
  it('does not count a moved start or boss as new terrain', () => {
    const moved = corridor(7);
    moved.startCell = 2;
    moved.tiles[1] = { id: 'boss', kind: 'boss', value: '4', cell: 5 };
    expect(visualDuplicate([corridor(4)], moved)).toBe(
      'shared terrain topology'
    );
  });
  it('rejects different terrain with the same tile access', () => {
    const branched = { ...corridor(3), terrain: ['...', '#.#'] };
    expect(visualDuplicate([corridor(3)], branched)).toBe('shared tile access');
  });
  it('reports role distance and does not qualify visually duplicated causal variants', () => {
    const row = {
      raw: corridor(4),
      tier: 'advanced',
      mechanical: 'first',
      sequence: 'add,multiply,boss',
      stepSequence: 'add,multiply,boss',
    };
    const audit = auditVisualTopology([
      row,
      {
        ...row,
        raw: corridor(7),
        mechanical: 'second',
        sequence: 'set,enemy,enemy,enemy,boss',
        stepSequence: 'set,enemy,enemy,enemy,boss',
      },
    ]);
    expect(audit).toMatchObject({
      rows: 2,
      terrainTopologies: 1,
      tileAccessGraphs: 1,
      causalSignatures: 2,
      qualifyingVisualMechanical: 1,
      minimumActionRoleDistance: 4,
      minimumStepRoleDistance: 4,
    });
  });
  it('does not qualify a new terrain when its causal graph is duplicated', () => {
    const row = {
      raw: corridor(4),
      tier: 'advanced',
      mechanical: 'same',
      sequence: 'add,multiply,boss',
      stepSequence: 'add,multiply,boss',
    };
    const different: RawLevel = {
      ...corridor(3),
      terrain: ['...', '...'],
      startCell: 3,
      tiles: [
        { id: 'resource', kind: 'add', amount: '3', cell: 1 },
        { id: 'boss', kind: 'boss', value: '4', cell: 5 },
      ],
    };
    expect(visualDuplicate([row.raw], different)).toBeUndefined();
    expect(
      auditVisualTopology([
        row,
        {
          ...row,
          raw: different,
          sequence: 'set,enemy,enemy,enemy,boss',
          stepSequence: 'set,enemy,enemy,enemy,boss',
        },
      ]).qualifyingVisualMechanical
    ).toBe(1);
  });
});
